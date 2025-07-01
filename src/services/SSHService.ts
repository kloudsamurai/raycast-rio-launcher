/**
 * SSH service for managing SSH connections and hosts
 */

import { LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { ISSHService } from "../types/services";
import type { ISSHHost } from "../types/system";
import { getEventBus } from "./EventBus";
import { isDefined, safeMapGet, isDefinedString, isDefinedObject } from "../utils/type-guards";
import { readFile, access } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SSH_HOSTS_KEY = "rio-ssh-hosts";
const SSH_CONFIG_PATH = join(homedir(), ".ssh", "config");
const KNOWN_HOSTS_PATH = join(homedir(), ".ssh", "known_hosts");
const DEFAULT_SSH_PORT = 22;
const SSH_CONNECT_TIMEOUT_SECONDS = 5;
const SSH_REGEX_MIN_MATCH_LENGTH = 3;

interface IStoredSSHHost extends ISSHHost {
  id: string;
  lastUsed?: string;
  useCount: number;
}

interface ISSHConnection {
  id: string;
  host: ISSHHost;
  status: "connecting" | "connected" | "disconnected" | "failed";
  startedAt: Date;
  endedAt?: Date;
  processId?: number;
  error?: Error;
}

interface IRioLaunchedEvent {
  options?: {
    command?: string;
    // eslint-disable-next-line @typescript-eslint/member-ordering
    [key: string]: unknown;
  };
  process?: unknown;
}

export class SSHService extends BaseService implements ISSHService {
  private readonly hosts: Map<string, IStoredSSHHost> = new Map();
  private readonly connections: Map<string, ISSHConnection> = new Map();
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();

  constructor(options?: IServiceOptions) {
    super("SSHService", options);
  }

  protected async onInitialize(): Promise<void> {
    // Load saved hosts
    await this.loadHosts();

    // Parse SSH config
    await this.parseSSHConfig();

    // Set up event listeners
    this.setupEventListeners();
  }

  protected async onCleanup(): Promise<void> {
    // Close all connections
    for (const [id, connection] of this.connections) {
      if (isDefinedObject(connection) && connection.status === "connected") {
        await this.disconnect(id);
      }
    }

    // Save hosts
    await this.saveHosts();

    this.hosts.clear();
    this.connections.clear();
  }

  /**
   * Get all SSH hosts
   */
  async getHosts(): Promise<ISSHHost[]> {
    return Array.from(this.hosts.values()).sort((a: IStoredSSHHost, b: IStoredSSHHost) => {
      // Sort by use count and last used
      if (a.useCount !== b.useCount) {
        return b.useCount - a.useCount;
      }
      const bLastUsed = b.lastUsed ?? "";
      const aLastUsed = a.lastUsed ?? "";
      return bLastUsed.localeCompare(aLastUsed);
    });
  }

  /**
   * Add a new SSH host
   */
  async addHost(host: ISSHHost): Promise<void> {
    const port: number = host.port ?? DEFAULT_SSH_PORT;

    if (!isDefinedString(host.username) || !isDefinedString(host.hostname)) {
      throw new Error("Host username and hostname must be defined strings");
    }

    const username = host.username;
    const hostname = host.hostname;
    const id = `${username}@${hostname}:${port}`;

    const newHost: IStoredSSHHost = {
      ...host,
      id,
      port,
      useCount: 0,
    };

    this.hosts.set(id, newHost);
    await this.saveHosts();

    this.log("info", `SSH host added: ${id}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-confusing-void-expression
    this.eventBus.emit("ssh:host_added", { host: newHost }).catch((error: unknown) => {
      this.log("error", "Failed to emit ssh:host_added event", error);
    });
  }

  /**
   * Update an SSH host
   */
  async updateHost(id: string, updates: Partial<ISSHHost>): Promise<void> {
    const host = safeMapGet(this.hosts, id);
    if (!isDefined(host)) {
      throw new Error(`SSH host not found: ${id}`);
    }

    const updatedHost: IStoredSSHHost = {
      ...host,
      ...updates,
      id, // Ensure ID doesn't change
    };

    this.hosts.set(id, updatedHost);
    await this.saveHosts();

    this.log("info", `SSH host updated: ${id}`);
  }

  /**
   * Remove an SSH host
   */
  async removeHost(id: string): Promise<void> {
    const host = safeMapGet(this.hosts, id);
    if (!isDefined(host)) {
      throw new Error(`SSH host not found: ${id}`);
    }

    // Disconnect if connected
    const connection = this.connections.get(id);
    if (isDefinedObject(connection) && connection.status === "connected") {
      await this.disconnect(id);
    }

    this.hosts.delete(id);
    await this.saveHosts();

    this.log("info", `SSH host removed: ${id}`);
  }

  /**
   * Verify SSH host key against known hosts
   */
  private async verifyHostKey(hostname: string, port: number = DEFAULT_SSH_PORT): Promise<boolean> {
    try {
      await access(KNOWN_HOSTS_PATH);
      const knownHosts = await readFile(KNOWN_HOSTS_PATH, "utf-8");
      const hostPattern = `${hostname}:${port}`;
      const altPattern = `[${hostname}]:${port}`;

      return knownHosts.includes(hostPattern) || knownHosts.includes(altPattern) || knownHosts.includes(hostname);
    } catch (error: unknown) {
      // Known hosts file doesn't exist, which is okay for first-time connections
      if (error instanceof Error) {
        this.log("warn", `Known hosts file not found at ${KNOWN_HOSTS_PATH}`, error);
      } else {
        this.log("warn", `Known hosts file not found at ${KNOWN_HOSTS_PATH}`, new Error("Unknown error"));
      }
      return true; // Allow connection but with a warning
    }
  }

  /**
   * Connect to an SSH host
   */
  async connect(
    hostId: string,
    options?: {
      command?: string;
      workingDirectory?: string;
    },
  ): Promise<ISSHConnection> {
    const host = this.validateAndGetHost(hostId);
    const existingConnection = this.getExistingConnection(hostId);
    if (existingConnection !== null) {
      return existingConnection;
    }

    await this.performPreConnectionSetup(host);
    const connection = this.createConnection(hostId, host);

    try {
      await this.establishConnection(connection, options);
      this.handleSuccessfulConnection(hostId, connection);
      return connection;
    } catch (error: unknown) {
      this.handleConnectionFailure(hostId, connection, error);
      throw error;
    }
  }

  /**
   * Helper methods for connection process
   */
  private validateAndGetHost(hostId: string): IStoredSSHHost {
    const host = safeMapGet(this.hosts, hostId);
    if (!isDefined(host)) {
      throw new Error(`SSH host not found: ${hostId}`);
    }
    return host;
  }

  private getExistingConnection(hostId: string): ISSHConnection | null {
    const existing = this.connections.get(hostId);
    if (isDefinedObject(existing) && existing.status === "connected") {
      return existing;
    }
    return null;
  }

  private async performPreConnectionSetup(host: IStoredSSHHost): Promise<void> {
    // Verify host key
    const isHostVerified = await this.verifyHostKey(host.hostname, host.port ?? DEFAULT_SSH_PORT);
    if (!isHostVerified) {
      this.log("warn", `Host key verification failed for ${host.hostname}`);
    }

    // Update host usage
    // eslint-disable-next-line require-atomic-updates
    host.lastUsed = new Date().toISOString();
    host.useCount++;
    await this.saveHosts();
  }

  private createConnection(hostId: string, host: IStoredSSHHost): ISSHConnection {
    const connection: ISSHConnection = {
      id: hostId,
      host,
      status: "connecting",
      startedAt: new Date(),
    };

    this.connections.set(hostId, connection);
    return connection;
  }

  private async establishConnection(
    connection: ISSHConnection,
    options?: { command?: string; workingDirectory?: string },
  ): Promise<void> {
    const sshCommand = this.buildSSHCommand(connection.host, options);
    const processService = await this.getProcessService();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const profile = connection.host.profile;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const validProfile = isDefinedString(profile) ? profile : undefined;

    const launchedProcess = await processService.launchRio({
      command: sshCommand,
      workingDirectory: options?.workingDirectory,
      profile: validProfile,
    });

    // eslint-disable-next-line require-atomic-updates
    connection.status = "connected";
    if (typeof launchedProcess.pid === "number") {
      // eslint-disable-next-line require-atomic-updates
      connection.processId = launchedProcess.pid;
    } else {
      throw new Error("Invalid process ID returned from launchRio");
    }
  }

  private async getProcessService(): Promise<{
    launchRio: (options: { command: string; workingDirectory?: string; profile?: string }) => Promise<{ pid: number }>;
  }> {
    const { getServiceRegistry } = await import("./base/ServiceRegistry");
    const registry = getServiceRegistry();

    const processServiceRaw = await registry.get("process");
    if (!isDefinedObject(processServiceRaw)) {
      throw new Error("Process service not found or invalid");
    }

    interface IProcessService {
      launchRio: (options: {
        command: string;
        workingDirectory?: string;
        profile?: string;
      }) => Promise<{ pid: number }>;
    }

    const processService = processServiceRaw as IProcessService;
    if (typeof processService.launchRio !== "function") {
      throw new Error("Process service launchRio method not found");
    }

    return processService;
  }

  private handleSuccessfulConnection(hostId: string, connection: ISSHConnection): void {
    this.log("info", `Connected to SSH host: ${hostId}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-confusing-void-expression
    this.eventBus.emit("ssh:connected", { connection }).catch((error: unknown) => {
      this.log("error", "Failed to emit ssh:connected event", error);
    });
  }

  private handleConnectionFailure(hostId: string, connection: ISSHConnection, error: unknown): void {
    connection.status = "failed";
    connection.error = error instanceof Error ? error : new Error("Connection failed");

    this.log("error", `Failed to connect to SSH host: ${hostId}`, error);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-confusing-void-expression
    this.eventBus.emit("ssh:connection_failed", { connection }).catch((eventError: unknown) => {
      this.log("error", "Failed to emit ssh:connection_failed event", eventError);
    });
  }

  /**
   * Disconnect from an SSH host
   */
  async disconnect(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!isDefined(connection)) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (typeof connection.processId === "number") {
      try {
        process.kill(connection.processId, "SIGTERM");
      } catch (error: unknown) {
        const processIdStr = connection.processId.toString();
        if (error instanceof Error) {
          this.log("warn", `Failed to kill SSH process: ${processIdStr}`, error);
        } else {
          this.log("warn", `Failed to kill SSH process: ${processIdStr}`, new Error("Unknown error"));
        }
      }
    }

    connection.status = "disconnected";
    connection.endedAt = new Date();

    this.connections.delete(connectionId);

    this.log("info", `Disconnected from SSH host: ${connectionId}`);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-confusing-void-expression
    this.eventBus.emit("ssh:disconnected", { connection }).catch((error: unknown) => {
      this.log("error", "Failed to emit ssh:disconnected event", error);
    });
  }

  /**
   * Get active connections
   */
  async getConnections(): Promise<ISSHConnection[]> {
    return Array.from(this.connections.values());
  }

  /**
   * Test SSH connection
   */
  async testConnection(hostId: string): Promise<boolean> {
    const host = safeMapGet(this.hosts, hostId);
    if (!isDefined(host)) {
      throw new Error(`SSH host not found: ${hostId}`);
    }

    try {
      // Build test command
      const command = `ssh -o ConnectTimeout=${SSH_CONNECT_TIMEOUT_SECONDS} -o BatchMode=yes ${this.buildSSHArgs(host).join(" ")} exit`;

      await execAsync(command);
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("warn", `SSH connection test failed for ${hostId}`, error);
      } else {
        this.log("warn", `SSH connection test failed for ${hostId}`, new Error("Unknown error"));
      }
      return false;
    }
  }

  /**
   * Import hosts from SSH config
   */
  async importFromConfig(): Promise<ISSHHost[]> {
    const hosts = await this.parseSSHConfig();
    const imported: ISSHHost[] = [];

    for (const host of hosts) {
      const port = host.port ?? DEFAULT_SSH_PORT;
      const id = `${host.username}@${host.hostname}:${port}`;

      if (!this.hosts.has(id)) {
        const storedHost: IStoredSSHHost = { ...host, id, useCount: 0 };
        this.hosts.set(id, storedHost);
        imported.push(host);
      }
    }

    if (imported.length > 0) {
      await this.saveHosts();
      this.log("info", `Imported ${imported.length} hosts from SSH config`);
    }

    return imported;
  }

  /**
   * Private helper methods
   */

  private buildSSHCommand(host: ISSHHost, options?: { command?: string }): string {
    const args = this.buildSSHArgs(host);

    if (isDefinedString(options?.command)) {
      args.push("--", options.command);
    }

    return `ssh ${args.join(" ")}`;
  }

  private buildSSHArgs(host: ISSHHost): string[] {
    const args: string[] = [];

    this.addUserHostToArgs(args, host);
    this.addPortToArgs(args, host);
    this.addIdentityFileToArgs(args, host);
    this.addProxyJumpToArgs(args, host);
    this.addOptionsToArgs(args, host);

    return args;
  }

  private addUserHostToArgs(args: string[], host: ISSHHost): void {
    if (!isDefinedString(host.username) || !isDefinedString(host.hostname)) {
      throw new Error("Host username and hostname must be defined strings");
    }

    const username = host.username;
    const hostname = host.hostname;
    args.push(`${username}@${hostname}`);
  }

  private addPortToArgs(args: string[], host: ISSHHost): void {
    if (typeof host.port === "number" && host.port !== DEFAULT_SSH_PORT) {
      args.push("-p", String(host.port));
    }
  }

  private addIdentityFileToArgs(args: string[], host: ISSHHost): void {
    if (isDefinedString(host.identityFile)) {
      args.push("-i", host.identityFile);
    }
  }

  private addProxyJumpToArgs(args: string[], host: ISSHHost): void {
    if (isDefinedString(host.proxyJump)) {
      args.push("-J", host.proxyJump);
    }
  }

  private addOptionsToArgs(args: string[], host: ISSHHost): void {
    if (isDefinedObject(host.options)) {
      const options = host.options as Record<string, unknown>;
      for (const [key, value] of Object.entries(options)) {
        if (!isDefinedString(key)) {
          continue; // Skip invalid keys
        }
        const valueStr = typeof value === "string" ? value : String(value);
        args.push("-o", `${key}=${valueStr}`);
      }
    }
  }

  private async parseSSHConfig(): Promise<ISSHHost[]> {
    const hosts: ISSHHost[] = [];

    try {
      await access(SSH_CONFIG_PATH);
      const content = await readFile(SSH_CONFIG_PATH, "utf-8");
      const lines = content.split("\n");

      let currentHost: Partial<ISSHHost> | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (this.shouldSkipLine(trimmed)) {
          continue;
        }

        const [key, ...valueParts] = trimmed.split(/\s+/);
        const value = valueParts.join(" ");

        if (key.toLowerCase() === "host") {
          this.saveCurrentHost(currentHost, hosts);
          currentHost = this.startNewHost(value);
        } else if (isDefinedObject(currentHost)) {
          this.processConfigLine(currentHost, key, value);
        }
      }

      // Save last host
      this.saveCurrentHost(currentHost, hosts);
    } catch (error: unknown) {
      this.handleParseError(error);
    }

    return hosts;
  }

  private shouldSkipLine(line: string): boolean {
    return line.length === 0 || line.startsWith("#");
  }

  private saveCurrentHost(currentHost: Partial<ISSHHost> | null, hosts: ISSHHost[]): void {
    if (
      isDefinedObject(currentHost) &&
      isDefinedString(currentHost.hostname) &&
      isDefinedString(currentHost.username)
    ) {
      const port: number = currentHost.port ?? DEFAULT_SSH_PORT;
      const username: string = currentHost.username;
      const hostname: string = currentHost.hostname;
      hosts.push({
        name: currentHost.name ?? hostname,
        hostname,
        username,
        port,
        identityFile: currentHost.identityFile,
        proxyJump: currentHost.proxyJump,
        extraOptions: currentHost.extraOptions,
      });
    }
  }

  private startNewHost(name: string): Partial<ISSHHost> {
    return {
      name,
      username: "root", // Default, will be overridden if specified
    };
  }

  private processConfigLine(currentHost: Partial<ISSHHost>, key: string, value: string): void {
    switch (key.toLowerCase()) {
      case "hostname":
        currentHost.hostname = value;
        break;
      case "user":
        currentHost.username = value;
        break;
      case "port": {
        const parsedPort = parseInt(value, 10);
        if (!isNaN(parsedPort)) {
          currentHost.port = parsedPort;
        }
        break;
      }
      case "identityfile":
        currentHost.identityFile = value.replace("~", homedir());
        break;
      case "proxyjump":
        currentHost.proxyJump = value;
        break;
      default:
        // Ignore other SSH config options
        break;
    }
  }

  private handleParseError(error: unknown): void {
    if (error instanceof Error) {
      this.log("warn", "Failed to parse SSH config", error);
    } else {
      this.log("warn", "Failed to parse SSH config", new Error("Unknown error"));
    }
  }

  private async loadHosts(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(SSH_HOSTS_KEY);
      if (isDefinedString(stored)) {
        let hosts: IStoredSSHHost[];
        try {
          const parsed: unknown = JSON.parse(stored);
          if (!Array.isArray(parsed)) {
            throw new Error("Invalid hosts data format");
          }
          hosts = parsed as IStoredSSHHost[];
        } catch (parseError: unknown) {
          if (parseError instanceof Error) {
            this.log("error", "Failed to parse stored hosts", parseError);
          } else {
            this.log("error", "Failed to parse stored hosts", new Error("Unknown parse error"));
          }
          hosts = [];
        }

        for (const host of hosts) {
          this.hosts.set(host.id, host);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to load SSH hosts", error);
      } else {
        this.log("error", "Failed to load SSH hosts", new Error("Unknown error"));
      }
    }
  }

  private async saveHosts(): Promise<void> {
    try {
      const hosts = Array.from(this.hosts.values());
      await LocalStorage.setItem(SSH_HOSTS_KEY, JSON.stringify(hosts));
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to save SSH hosts", error);
      } else {
        this.log("error", "Failed to save SSH hosts", new Error("Unknown error"));
      }
    }
  }

  private setupEventListeners(): void {
    // Listen for Rio launch events to detect SSH connections
    this.eventBus.on("rio:launched", (event: unknown) => {
      const handlePromise = this.handleRioLaunchedEvent(event);
      handlePromise.catch((error: unknown) => {
        this.log("error", "Failed to handle rio:launched event", error);
      });
    });
  }

  private async handleRioLaunchedEvent(event: unknown): Promise<void> {
    if (!isDefinedObject(event)) {
      return;
    }

    const typedEvent = event as IRioLaunchedEvent;
    const { options } = typedEvent;

    if (!isDefinedObject(options) || !isDefinedString(options.command)) {
      return;
    }

    if (!options.command.startsWith("ssh ")) {
      return;
    }

    // Track as SSH connection
    const sshMatch = /ssh\s+([^@]+)@([^\s]+)/.exec(options.command);
    if (!isDefinedObject(sshMatch) || sshMatch.length < SSH_REGEX_MIN_MATCH_LENGTH) {
      return;
    }

    const username = sshMatch[1];
    const hostname = sshMatch[2];

    if (!isDefinedString(username) || !isDefinedString(hostname)) {
      return;
    }

    const hostId = `${username}@${hostname}:${DEFAULT_SSH_PORT}`;

    // Auto-add host if not exists
    if (!this.hosts.has(hostId)) {
      await this.addHost({
        name: hostname,
        hostname,
        username,
        port: DEFAULT_SSH_PORT,
      });
    }
  }
}
