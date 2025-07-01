/**
 * Multiplexer service for tmux/screen session management
 */

import { LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { IMultiplexerService } from "../types/services";
import type { ITmuxSession } from "../types/system";
import { getEventBus, type EventBusService } from "./EventBus";
import { exec } from "child_process";
import { promisify } from "util";
import { isDefinedString, isDefinedObject, isDefinedBoolean } from "../utils/type-guards";

const execAsync = promisify(exec);

const MULTIPLEXER_PREFERENCE_KEY = "rio-multiplexer-type";
const SESSION_HISTORY_KEY = "rio-multiplexer-session-history";
const MILLISECONDS_PER_SECOND = 1000;

type MultiplexerType = "tmux" | "screen";

interface IMultiplexerSession extends ITmuxSession {
  type: MultiplexerType;
}

interface ISessionHistoryItem {
  name: string;
  type: MultiplexerType;
  lastAccessed: string;
  accessCount: number;
}

export class MultiplexerService extends BaseService implements IMultiplexerService {
  private preferredType: MultiplexerType = "tmux";
  private readonly sessionHistory: Map<string, ISessionHistoryItem> = new Map();
  private readonly eventBus: EventBusService = getEventBus();

  constructor(options?: IServiceOptions) {
    super("MultiplexerService", options);
  }

  protected async onInitialize(): Promise<void> {
    // Load preferences
    const savedType = await LocalStorage.getItem<MultiplexerType>(MULTIPLEXER_PREFERENCE_KEY);
    if (isDefinedString(savedType)) {
      this.preferredType = savedType;
    }

    // Load session history
    await this.loadSessionHistory();

    // Check available multiplexers
    await this.checkAvailability();

    // Set up event listeners
    this.setupEventListeners();
  }

  protected async onCleanup(): Promise<void> {
    // Save session history
    await this.saveSessionHistory();

    this.sessionHistory.clear();
  }

  /**
   * Get active sessions
   */
  async getSessions(type?: MultiplexerType): Promise<IMultiplexerSession[]> {
    const multiplexerType = type ?? this.preferredType;

    try {
      if (multiplexerType === "tmux") {
        return await this.getTmuxSessions();
      }
      return await this.getScreenSessions();
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", `Failed to get ${multiplexerType} sessions`, error);
      } else {
        this.log("error", `Failed to get ${multiplexerType} sessions`, new Error("Unknown error"));
      }
      return [];
    }
  }

  /**
   * Create a new session
   */
  async createSession(
    name: string,
    options?: {
      type?: MultiplexerType;
      command?: string;
      workingDirectory?: string;
    },
  ): Promise<void> {
    const type = options?.type ?? this.preferredType;

    try {
      const command =
        type === "tmux" ? this.buildTmuxCreateCommand(name, options) : this.buildScreenCreateCommand(name, options);

      await execAsync(command);

      // Update history
      this.updateSessionHistory(name, type);

      this.log("info", `Created ${type} session: ${name}`);

      this.eventBus.emit("multiplexer:session_created", { name, type });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create ${type} session: ${errorMessage}`);
    }
  }

  /**
   * Attach to a session
   */
  async attachSession(
    name: string,
    options?: {
      type?: MultiplexerType;
      readOnly?: boolean;
    },
  ): Promise<string> {
    const type = options?.type ?? this.preferredType;

    try {
      const command =
        type === "tmux" ? this.buildTmuxAttachCommand(name, options) : this.buildScreenAttachCommand(name, options);

      // Update history
      this.updateSessionHistory(name, type);

      this.log("info", `Attaching to ${type} session: ${name}`);

      this.eventBus.emit("multiplexer:session_attached", { name, type });

      return command;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to attach to ${type} session: ${errorMessage}`);
    }
  }

  /**
   * Detach from current session
   */
  async detachSession(options?: { type?: MultiplexerType }): Promise<void> {
    const type = options?.type ?? this.preferredType;

    try {
      if (type === "tmux") {
        await execAsync("tmux detach-client");
      } else {
        // Screen detaches with Ctrl-A D, handled by terminal
        this.log("info", "Screen session detach must be done within terminal");
      }

      this.eventBus.emit("multiplexer:session_detached", { type });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to detach from ${type} session: ${errorMessage}`);
    }
  }

  /**
   * Kill a session
   */
  async killSession(name: string, options?: { type?: MultiplexerType }): Promise<void> {
    const type = options?.type ?? this.preferredType;

    try {
      let command: string;

      if (type === "tmux") {
        command = `tmux kill-session -t "${name}"`;
      } else {
        command = `screen -S "${name}" -X quit`;
      }

      await execAsync(command);

      this.log("info", `Killed ${type} session: ${name}`);

      this.eventBus.emit("multiplexer:session_killed", { name, type });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to kill ${type} session: ${errorMessage}`);
    }
  }

  /**
   * Rename a session
   */
  async renameSession(
    oldName: string,
    newName: string,
    options?: {
      type?: MultiplexerType;
    },
  ): Promise<void> {
    const type = options?.type ?? this.preferredType;

    try {
      if (type === "tmux") {
        await execAsync(`tmux rename-session -t "${oldName}" "${newName}"`);
      } else {
        // Screen doesn't support renaming sessions directly
        throw new Error("Screen sessions cannot be renamed");
      }

      // Update history
      const history = this.sessionHistory.get(oldName);
      if (isDefinedObject(history)) {
        this.sessionHistory.delete(oldName);
        this.sessionHistory.set(newName, { ...history, name: newName });
      }

      this.log("info", `Renamed ${type} session: ${oldName} -> ${newName}`);

      this.eventBus.emit("multiplexer:session_renamed", { oldName, newName, type });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to rename ${type} session: ${errorMessage}`);
    }
  }

  /**
   * Get session details
   */
  async getSessionInfo(
    name: string,
    options?: {
      type?: MultiplexerType;
    },
  ): Promise<IMultiplexerSession | null> {
    const type = options?.type ?? this.preferredType;
    const sessions = await this.getSessions(type);
    return sessions.find((s: IMultiplexerSession) => s.name === name) ?? null;
  }

  /**
   * Check if multiplexer is available
   */
  async isAvailable(type: MultiplexerType): Promise<boolean> {
    try {
      const command = type === "tmux" ? "tmux -V" : "screen -v";
      await execAsync(command);
      return true;
    } catch {
      // Silently handle error - availability check is expected to fail if not installed
      return false;
    }
  }

  /**
   * Set preferred multiplexer type
   */
  async setPreferredType(type: MultiplexerType): Promise<void> {
    const available = await this.isAvailable(type);
    if (!available) {
      throw new Error(`${type} is not installed or available`);
    }

    this.preferredType = type;
    await LocalStorage.setItem(MULTIPLEXER_PREFERENCE_KEY, type);

    this.log("info", `Preferred multiplexer set to ${type}`);
  }

  /**
   * Get session history
   */
  async getSessionHistory(): Promise<ISessionHistoryItem[]> {
    return Array.from(this.sessionHistory.values()).sort((a: ISessionHistoryItem, b: ISessionHistoryItem) => {
      // Sort by access count and last accessed
      if (a.accessCount !== b.accessCount) {
        return b.accessCount - a.accessCount;
      }
      return b.lastAccessed.localeCompare(a.lastAccessed);
    });
  }

  /**
   * Private helper methods
   */

  private buildTmuxCreateCommand(
    name: string,
    options?: {
      command?: string;
      workingDirectory?: string;
    },
  ): string {
    let command = `tmux new-session -d -s "${name}"`;
    if (isDefinedString(options?.workingDirectory)) {
      command += ` -c "${options.workingDirectory}"`;
    }
    if (isDefinedString(options?.command)) {
      command += ` "${options.command}"`;
    }
    return command;
  }

  private buildScreenCreateCommand(
    name: string,
    options?: {
      command?: string;
    },
  ): string {
    let command = `screen -dmS "${name}"`;
    if (isDefinedString(options?.command)) {
      command += ` bash -c "${options.command}"`;
    }
    return command;
  }

  private buildTmuxAttachCommand(
    name: string,
    options?: {
      readOnly?: boolean;
    },
  ): string {
    let command = `tmux attach-session -t "${name}"`;
    if (isDefinedBoolean(options?.readOnly) && options.readOnly) {
      command += " -r";
    }
    return command;
  }

  private buildScreenAttachCommand(
    name: string,
    options?: {
      readOnly?: boolean;
    },
  ): string {
    if (isDefinedBoolean(options?.readOnly) && options.readOnly) {
      return `screen -r "${name}"`;
    }
    return `screen -x "${name}"`;
  }

  private extractTmuxSessionName(command: string): string | null {
    const match = /tmux (?:attach|new)-session.*-[ts]\s+"?([^"\s]+)"?/.exec(command);
    if (isDefinedObject(match) && match.length > 1 && isDefinedString(match[1])) {
      return match[1];
    }
    return null;
  }

  private extractScreenSessionName(command: string): string | null {
    const match = /screen\s+-[rRxS]\s+"?([^"\s]+)"?/.exec(command);
    if (isDefinedObject(match) && match.length > 1 && isDefinedString(match[1])) {
      return match[1];
    }
    return null;
  }

  private extractCommandFromEvent(event: unknown): string | null {
    if (typeof event !== "object" || event === null || !("options" in event)) {
      return null;
    }

    const typedEvent = event as { options?: { command?: string } };
    const { options } = typedEvent;

    if (!isDefinedObject(options) || !isDefinedString(options.command)) {
      return null;
    }

    return options.command;
  }

  private handleRioLaunchEvent(event: unknown): void {
    const command = this.extractCommandFromEvent(event);
    if (!isDefinedString(command)) {
      return;
    }

    // Check if launching with tmux
    if (command.includes("tmux attach") || command.includes("tmux new")) {
      const sessionName = this.extractTmuxSessionName(command);
      if (isDefinedString(sessionName)) {
        this.updateSessionHistory(sessionName, "tmux");
      }
      return;
    }

    // Check if launching with screen
    if (command.includes("screen -")) {
      const sessionName = this.extractScreenSessionName(command);
      if (isDefinedString(sessionName)) {
        this.updateSessionHistory(sessionName, "screen");
      }
    }
  }

  private async getTmuxSessions(): Promise<IMultiplexerSession[]> {
    try {
      const { stdout } = await execAsync(
        "tmux list-sessions -F '#{session_name}|#{session_created}|#{session_windows}|#{session_attached}'",
      );

      if (stdout.trim() === "") {
        return [];
      }

      return stdout
        .trim()
        .split("\n")
        .map((line: string) => {
          const [name, created, windows, attached] = line.split("|");
          return {
            name,
            type: "tmux" as MultiplexerType,
            created: new Date(parseInt(created, 10) * MILLISECONDS_PER_SECOND),
            windows: parseInt(windows, 10),
            attached: attached === "1",
          };
        });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("no server running")) {
        return [];
      }
      throw error;
    }
  }

  private async getScreenSessions(): Promise<IMultiplexerSession[]> {
    try {
      const { stdout } = await execAsync("screen -ls");

      const sessions: IMultiplexerSession[] = [];
      const lines = stdout.split("\n");

      for (const line of lines) {
        const match = /(\d+)\.(\S+)\s+\(([^)]+)\)/.exec(line);
        if (isDefinedObject(match)) {
          const [, pid, name, status] = match;
          sessions.push({
            name,
            type: "screen",
            created: new Date(), // Screen doesn't provide creation time
            attached: status.includes("Attached"),
            pid: parseInt(pid, 10),
          });
        }
      }

      return sessions;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("No Sockets found")) {
        return [];
      }
      throw error;
    }
  }

  private async checkAvailability(): Promise<void> {
    const tmuxAvailable = await this.isAvailable("tmux");
    const screenAvailable = await this.isAvailable("screen");

    if (!tmuxAvailable && !screenAvailable) {
      this.log("warn", "No terminal multiplexer (tmux or screen) is available");
    } else {
      this.log(
        "info",
        `Available multiplexers: ${[tmuxAvailable && "tmux", screenAvailable && "screen"].filter(Boolean).join(", ")}`,
      );

      // If preferred type is not available, switch to available one
      if (!(await this.isAvailable(this.preferredType))) {
        if (tmuxAvailable) {
          this.preferredType = "tmux";
        } else if (screenAvailable) {
          this.preferredType = "screen";
        }
      }
    }
  }

  private updateSessionHistory(name: string, type: MultiplexerType): void {
    const existing = this.sessionHistory.get(name);

    if (isDefinedObject(existing)) {
      existing.lastAccessed = new Date().toISOString();
      existing.accessCount++;
    } else {
      this.sessionHistory.set(name, {
        name,
        type,
        lastAccessed: new Date().toISOString(),
        accessCount: 1,
      });
    }
  }

  private async loadSessionHistory(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(SESSION_HISTORY_KEY);
      if (isDefinedString(stored)) {
        const items = JSON.parse(stored) as ISessionHistoryItem[];
        for (const item of items) {
          this.sessionHistory.set(item.name, item);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to load session history", error);
      } else {
        this.log("error", "Failed to load session history", new Error("Unknown error"));
      }
    }
  }

  private async saveSessionHistory(): Promise<void> {
    try {
      const items = Array.from(this.sessionHistory.values());
      await LocalStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(items));
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to save session history", error);
      } else {
        this.log("error", "Failed to save session history", new Error("Unknown error"));
      }
    }
  }

  private setupEventListeners(): void {
    // Listen for Rio launch events that might use multiplexer
    this.eventBus.on("rio:launched", (event: unknown) => {
      this.handleRioLaunchEvent(event);
    });
  }
}
