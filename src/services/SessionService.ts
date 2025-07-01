/**
 * Session service for managing Rio terminal sessions
 */

import { LocalStorage } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { ISessionService } from "../types/services";
import type { IRioSession, IRioProfile } from "../types/rio";
import { ValidationError } from "../types/errors";
import { getEventBus } from "./EventBus";
import type { ProcessService } from "./ProcessService";
import { randomUUID } from "crypto";
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { isDefinedString, isDefinedObject } from "../utils/type-guards";
import { homedir } from "os";
import { spawn, type ChildProcess } from "child_process";

const SESSIONS_STORAGE_KEY = "rio-sessions";
const RECORDINGS_DIR = join(homedir(), ".rio-launcher", "recordings");

interface IAsciinemaRecording {
  sessionId: string;
  filePath: string;
  process: ChildProcess;
  startTime: Date;
}

export class SessionService extends BaseService implements ISessionService {
  private readonly sessions: Map<string, IRioSession> = new Map();
  private readonly recordings: Map<string, IAsciinemaRecording> = new Map();
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();
  private processService?: ProcessService;

  constructor(
    options?: IServiceOptions & {
      processService?: ProcessService;
    },
  ) {
    super("SessionService", options);
    this.processService = options?.processService;
  }

  protected async onInitialize(): Promise<void> {
    // Check if asciinema is available
    await this.checkAsciinemaAvailability();

    // Ensure recordings directory exists
    if (!existsSync(RECORDINGS_DIR)) {
      mkdirSync(RECORDINGS_DIR, { recursive: true });
    }

    // Load saved sessions
    await this.loadSessions();

    // Get process service if not provided
    if (!isDefinedObject(this.processService)) {
      const { getServiceRegistry } = await import("./base/ServiceRegistry");
      const registry = getServiceRegistry();
      const processServiceRaw = await registry.get("process");

      if (!isDefinedObject(processServiceRaw)) {
        throw new Error("Process service not found or invalid");
      }

      this.processService = processServiceRaw as ProcessService;
    }

    // Scan for orphaned sessions
    await this.cleanupOrphanedSessions();
  }

  protected async onCleanup(): Promise<void> {
    // Stop all active recordings
    for (const [sessionId] of this.recordings) {
      try {
        await this.stopRecording(sessionId);
      } catch (error) {
        this.log("warn", `Failed to stop recording for session ${String(sessionId)}`, error);
      }
    }

    this.sessions.clear();
    this.recordings.clear();
  }

  /**
   * Create a new session
   */
  async createSession(name: string, profile?: IRioProfile): Promise<IRioSession> {
    return this.trackPerformance("createSession", async () => {
      const session: IRioSession = {
        id: randomUUID(),
        name,
        windowIds: [],
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        profile,
      };

      this.sessions.set(session.id, session);
      await this.saveSessions();

      this.eventBus.emit("session:created", { session });

      this.log("info", `Session '${name}' created`);
      return session;
    });
  }

  /**
   * Get all sessions
   */
  async getSessions(): Promise<IRioSession[]> {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a specific session - creates default if not found
   */
  async getSession(id: string): Promise<IRioSession> {
    const existing = this.sessions.get(id);
    if (isDefinedObject(existing)) {
      return existing;
    }

    // Always create a default session - sessions always exist
    const defaultSession: IRioSession = {
      id,
      status: "starting",
      startTime: new Date().toISOString(),
      endTime: null,
      exitCode: null,
      workingDirectory: process.cwd(),
      environment: {},
      profile: null,
    };
    this.sessions.set(id, defaultSession);
    return defaultSession;
  }

  /**
   * Update a session
   */
  async updateSession(id: string, updates: Partial<IRioSession>): Promise<void> {
    const session = this.sessions.get(id);
    if (!isDefinedObject(session)) {
      throw new ValidationError("Session not found", {
        field: "id",
        value: id,
      });
    }

    const updatedSession: IRioSession = {
      ...session,
      ...updates,
      id, // Ensure ID doesn't change
      lastAccessedAt: new Date(),
    };

    this.sessions.set(id, updatedSession);
    await this.saveSessions();

    this.log("info", `Session '${String(updatedSession.name)}' updated`);
  }

  /**
   * Delete a session
   */
  async deleteSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!isDefinedObject(session)) {
      throw new ValidationError("Session not found", {
        field: "id",
        value: id,
      });
    }

    // Stop recording if active
    if (this.recordings.has(id)) {
      await this.stopRecording(id);
    }

    // Delete session
    this.sessions.delete(id);
    await this.saveSessions();

    // Delete recordings
    const recordingPath = join(RECORDINGS_DIR, `${id}.json`);
    if (existsSync(recordingPath)) {
      try {
        const { unlink } = await import("fs/promises");
        await unlink(recordingPath);
      } catch (error) {
        this.log("warn", "Failed to delete recording file", error);
      }
    }

    this.eventBus.emit("session:deleted", { sessionId: id });

    this.log("info", `Session '${String(session.name)}' deleted`);
  }

  /**
   * Save session state
   */
  async saveSessionState(session: IRioSession): Promise<void> {
    // Update the session with current state
    const existingSession = this.sessions.get(session.id);
    if (!isDefinedObject(existingSession)) {
      throw new ValidationError("Session not found", {
        field: "id",
        value: session.id,
      });
    }

    // Get current Rio processes
    if (!isDefinedObject(this.processService)) {
      throw new Error("Process service not available");
    }

    const processes = await this.processService.getRioProcesses();
    const windowIds = processes.map((p: { windowId: string }) => p.windowId);

    const updatedSession: IRioSession = {
      ...existingSession,
      windowIds,
      lastAccessedAt: new Date(),
    };

    this.sessions.set(session.id, updatedSession);
    await this.saveSessions();

    this.log("info", `Session state saved for '${String(session.name)}'`);
  }

  /**
   * Restore a session
   */
  async restoreSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!isDefinedObject(session)) {
      throw new ValidationError("Session not found", {
        field: "id",
        value: id,
      });
    }

    try {
      // For now, we'll launch a new Rio instance
      // In the future, we could restore window positions, tabs, etc.
      const launchOptions = isDefinedObject(session.profile)
        ? {
            profile: session.profile.id,
            environment: session.profile.environment,
            workingDirectory: session.profile.workingDirectory,
          }
        : {};

      if (!isDefinedObject(this.processService)) {
        throw new Error("Process service not available");
      }

      await this.processService.launchRio(launchOptions);

      // Update last accessed time
      await this.updateSession(id, {
        lastAccessedAt: new Date(),
      });

      this.eventBus.emit("session:restored", { session });

      this.log("info", `Session '${String(session.name)}' restored`);
    } catch (restoreError: unknown) {
      if (restoreError instanceof Error) {
        throw new ValidationError("Failed to restore session", {
          field: "id",
          value: id,
          suggestion: "Check if Rio is properly installed",
        });
      } else {
        throw new ValidationError("Failed to restore session", {
          field: "id",
          value: id,
          suggestion: "Unknown error occurred",
        });
      }
    }
  }

  /**
   * Attach to an existing session
   */
  async attachSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!isDefinedObject(session)) {
      throw new ValidationError("Session not found", {
        field: "id",
        value: id,
      });
    }

    try {
      // If the session has active windows, try to focus them
      if (isDefinedObject(session.windowIds) && session.windowIds.length > 0) {
        if (!isDefinedObject(this.processService)) {
          throw new Error("Process service not available");
        }

        const processes = await this.processService.getRioProcesses();
        const sessionProcesses = processes.filter((p: { windowId: string }) => session.windowIds.includes(p.windowId));

        if (sessionProcesses.length > 0) {
          // Focus the first active window
          const firstProcess = sessionProcesses[0];
          if (isDefinedObject(firstProcess) && typeof firstProcess.pid === "number") {
            await this.processService.attachToProcess(firstProcess.pid);
          }
        }
      } else {
        // No active windows, restore the session
        await this.restoreSession(id);
      }

      // Update last accessed time
      await this.updateSession(id, {
        lastAccessedAt: new Date(),
      });

      this.eventBus.emit("session:attached", { session });

      this.log("info", `Attached to session '${String(session.name)}'`);
    } catch (attachError: unknown) {
      if (attachError instanceof Error) {
        throw new ValidationError("Failed to attach to session", {
          field: "id",
          value: id,
          suggestion: "Check if Rio processes are running",
        });
      } else {
        throw new ValidationError("Failed to attach to session", {
          field: "id",
          value: id,
          suggestion: "Unknown error occurred",
        });
      }
    }
  }

  /**
   * Start recording a session
   */
  async recordSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!isDefinedObject(session)) {
      throw new ValidationError("Session not found", {
        field: "id",
        value: sessionId,
      });
    }

    if (this.recordings.has(sessionId)) {
      throw new ValidationError("Session is already being recorded", {
        field: "sessionId",
        value: sessionId,
      });
    }

    // Ensure recordings directory exists
    if (!existsSync(RECORDINGS_DIR)) {
      mkdirSync(RECORDINGS_DIR, { recursive: true });
    }

    // Create asciinema recording file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sessionName = isDefinedString(session.name) ? session.name : "unnamed-session";
    const fileName = `${sessionName}-${timestamp}.cast`;
    const filePath = join(RECORDINGS_DIR, fileName);

    // Start asciinema recording
    const asciinemaProcess = spawn("asciinema", ["rec", filePath, "--overwrite"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color" },
    });

    if (typeof asciinemaProcess.pid !== "number") {
      throw new Error("Failed to start asciinema recording process");
    }

    const recording: IAsciinemaRecording = {
      sessionId,
      filePath,
      process: asciinemaProcess,
      startTime: new Date(),
    };

    this.recordings.set(sessionId, recording);

    // Handle recording process events
    asciinemaProcess.on("error", (error: unknown) => {
      if (error instanceof Error) {
        this.log("error", `Asciinema recording failed for session ${String(sessionId)}`, error);
      } else {
        this.log("error", `Asciinema recording failed for session ${String(sessionId)}`, new Error("Unknown error"));
      }
      this.recordings.delete(sessionId);
    });

    asciinemaProcess.on("exit", (code: number | null) => {
      const codeStr = typeof code === "number" ? String(code) : "unknown";
      this.log("info", `Asciinema recording ended for session ${String(sessionId)} with code ${codeStr}`);
      if (code !== 0 && existsSync(filePath)) {
        // Clean up failed recording file
        try {
          unlinkSync(filePath);
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.log("warn", `Failed to clean up recording file ${filePath}`, error);
          } else {
            this.log("warn", `Failed to clean up recording file ${filePath}`, new Error("Unknown error"));
          }
        }
      }
    });

    this.eventBus.emit("session:recording:started", { sessionId, filePath });

    this.log("info", `Started asciinema recording for session '${String(session.name)}' at ${filePath}`);
  }

  /**
   * Stop recording a session
   */
  async stopRecording(sessionId: string): Promise<void> {
    const recording = this.recordings.get(sessionId);
    if (!isDefinedObject(recording)) {
      throw new ValidationError("Session is not being recorded", {
        field: "sessionId",
        value: sessionId,
      });
    }

    // Stop asciinema recording by sending SIGTERM
    try {
      if (isDefinedObject(recording.process) && !recording.process.killed) {
        recording.process.kill("SIGTERM");

        // Wait for process to exit gracefully
        const GRACEFUL_SHUTDOWN_TIMEOUT = 5000;
        await new Promise<void>((resolve: () => void) => {
          const timeout = setTimeout(() => {
            if (isDefinedObject(recording.process) && !recording.process.killed) {
              recording.process.kill("SIGKILL");
            }
            resolve();
          }, GRACEFUL_SHUTDOWN_TIMEOUT);

          recording.process.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      // Verify recording file was created
      if (existsSync(recording.filePath)) {
        this.log("info", `Recording saved to ${recording.filePath}`);
        this.eventBus.emit("session:recording:stopped", {
          sessionId,
          filePath: recording.filePath,
        });
      } else {
        this.log("warn", `Recording file not found: ${recording.filePath}`);
        this.eventBus.emit("session:recording:failed", {
          sessionId,
          error: "Recording file not created",
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to stop recording", error);
      } else {
        this.log("error", "Failed to stop recording", new Error("Unknown error"));
      }
      this.eventBus.emit("session:recording:failed", { sessionId, error });
    }

    this.recordings.delete(sessionId);
  }

  /**
   * Get session recording file path
   */
  async getSessionRecording(sessionId: string): Promise<string | null> {
    // Check in-memory recordings first
    const recording = this.recordings.get(sessionId);
    if (isDefinedObject(recording)) {
      return recording.filePath;
    }

    // Check for saved asciinema files in recordings directory
    if (!existsSync(RECORDINGS_DIR)) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!isDefinedObject(session)) {
      return null;
    }

    // Look for asciinema files matching this session
    try {
      const files: string[] = readdirSync(RECORDINGS_DIR);
      const sessionName = isDefinedString(session.name) ? session.name : session.id;
      const sessionFiles = files.filter((file: string) => file.startsWith(sessionName) && file.endsWith(".cast"));

      if (sessionFiles.length > 0) {
        // Return the most recent recording
        const latestFile = sessionFiles
          .map((file: string) => ({
            name: file,
            path: join(RECORDINGS_DIR, file),
            mtime: statSync(join(RECORDINGS_DIR, file)).mtime,
          }))
          .sort((a: { mtime: Date }, b: { mtime: Date }) => b.mtime.getTime() - a.mtime.getTime())[0];

        return isDefinedObject(latestFile) ? latestFile.path : null;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to list recording files", error);
      } else {
        this.log("error", "Failed to list recording files", new Error("Unknown error"));
      }
    }

    return null;
  }

  /**
   * Play back a session recording
   */
  async playRecording(sessionId: string): Promise<void> {
    const recordingPath = await this.getSessionRecording(sessionId);
    if (!isDefinedString(recordingPath)) {
      throw new ValidationError("No recording found for session", {
        field: "sessionId",
        value: sessionId,
      });
    }

    // Play the recording using asciinema
    const playProcess = spawn("asciinema", ["play", recordingPath], {
      stdio: "inherit",
    });

    return new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      playProcess.on("exit", (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          const codeStr = typeof code === "number" ? String(code) : "unknown";
          reject(new Error(`Playback failed with exit code ${codeStr}`));
        }
      });

      playProcess.on("error", (error: Error) => {
        reject(new Error(`Failed to start playback: ${error.message}`));
      });
    });
  }

  /**
   * Export recording to different formats
   */
  async exportRecording(sessionId: string, format: "gif" | "svg" | "txt", outputPath?: string): Promise<string> {
    const recordingPath = await this.getSessionRecording(sessionId);
    if (!isDefinedString(recordingPath)) {
      throw new ValidationError("No recording found for session", {
        field: "sessionId",
        value: sessionId,
      });
    }

    const session = this.sessions.get(sessionId);
    const baseName = isDefinedObject(session) && isDefinedString(session.name) ? session.name : sessionId;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const defaultOutputPath = outputPath ?? join(RECORDINGS_DIR, `${baseName}-${timestamp}.${format}`);

    let command: string[];
    switch (format) {
      case "gif":
        command = ["agg", recordingPath, defaultOutputPath];
        break;
      case "svg":
        command = ["svg-term", "--in", recordingPath, "--out", defaultOutputPath];
        break;
      case "txt":
        command = ["asciinema", "cat", recordingPath];
        break;
      default:
        throw new ValidationError("Unsupported export format", {
          field: "format",
          value: format,
        });
    }

    return new Promise<string>((resolve: (value: string) => void, reject: (error: Error) => void) => {
      const exportProcess = spawn(command[0], command.slice(1), {
        stdio: format === "txt" ? ["inherit", "pipe", "pipe"] : "inherit",
      });

      if (format === "txt") {
        // For text format, capture stdout and write to file
        let output = "";
        exportProcess.stdout?.on("data", (data: Buffer) => {
          output += data.toString();
        });

        exportProcess.on("exit", (code: number | null) => {
          if (code === 0) {
            try {
              writeFileSync(defaultOutputPath, output, "utf-8");
              resolve(defaultOutputPath);
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              reject(new Error(`Failed to write text export: ${errorMessage}`));
            }
          } else {
            const codeStr = typeof code === "number" ? String(code) : "unknown";
            reject(new Error(`Export failed with exit code ${codeStr}`));
          }
        });
      } else {
        exportProcess.on("exit", (code: number | null) => {
          if (code === 0) {
            resolve(defaultOutputPath);
          } else {
            const codeStr = typeof code === "number" ? String(code) : "unknown";
            reject(new Error(`Export failed with exit code ${codeStr}`));
          }
        });
      }

      exportProcess.on("error", (error: Error) => {
        reject(new Error(`Failed to start export: ${error.message}`));
      });
    });
  }

  /**
   * List all available recordings
   */
  async listRecordings(): Promise<
    { sessionId: string; sessionName: string; filePath: string; created: Date; size: number }[]
  > {
    if (!existsSync(RECORDINGS_DIR)) {
      return [];
    }

    try {
      const files: string[] = readdirSync(RECORDINGS_DIR);
      const recordings: { sessionId: string; sessionName: string; filePath: string; created: Date; size: number }[] =
        [];

      for (const file of files) {
        if (file.endsWith(".cast")) {
          const filePath = join(RECORDINGS_DIR, file);
          const stats = statSync(filePath);

          // Try to match file to session
          const fileName = file.replace(".cast", "");
          const parts = fileName.split("-");
          const sessionName = parts.slice(0, -1).join("-"); // Remove timestamp

          // Find matching session
          let sessionId = "";
          for (const [id, session] of this.sessions) {
            if (isDefinedString(session.name) && session.name === sessionName) {
              sessionId = id;
              break;
            }
          }

          recordings.push({
            sessionId: sessionId !== "" ? sessionId : fileName,
            sessionName,
            filePath,
            created: stats.birthtime,
            size: stats.size,
          });
        }
      }

      return recordings.sort((a: { created: Date }, b: { created: Date }) => b.created.getTime() - a.created.getTime());
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to list recordings", error);
      } else {
        this.log("error", "Failed to list recordings", new Error("Unknown error"));
      }
      return [];
    }
  }

  /**
   * Private helper methods
   */

  private async checkAsciinemaAvailability(): Promise<void> {
    try {
      await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        const checkProcess = spawn("asciinema", ["--version"], { stdio: "pipe" });

        checkProcess.on("exit", (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error("asciinema not found"));
          }
        });

        checkProcess.on("error", () => {
          reject(new Error("asciinema not installed"));
        });
      });

      this.log("info", "asciinema is available for session recording");
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("warn", "asciinema not available - session recording will be disabled", error);
      } else {
        this.log("warn", "asciinema not available - session recording will be disabled", new Error("Unknown error"));
      }
      this.eventBus.emit("session:recording:unavailable", {
        reason: "asciinema not installed",
      });
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(SESSIONS_STORAGE_KEY);
      if (isDefinedString(stored)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const sessions: IRioSession[] = JSON.parse(stored);
        for (const session of sessions) {
          // Convert date strings back to Date objects
          session.createdAt = new Date(session.createdAt);
          session.lastAccessedAt = new Date(session.lastAccessedAt);
          this.sessions.set(session.id, session);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to load sessions", error);
      } else {
        this.log("error", "Failed to load sessions", new Error("Unknown error"));
      }
    }
  }

  private async saveSessions(): Promise<void> {
    try {
      const sessions = Array.from(this.sessions.values());
      await LocalStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.log("error", "Failed to save sessions", error);
      } else {
        this.log("error", "Failed to save sessions", new Error("Unknown error"));
      }
    }
  }

  private async cleanupOrphanedSessions(): Promise<void> {
    // Remove sessions with no active windows
    if (!isDefinedObject(this.processService)) {
      throw new Error("Process service not available");
    }

    const processes = await this.processService.getRioProcesses();
    const activeWindowIds = new Set(processes.map((p: { windowId: string }) => String(p.windowId)));

    for (const [_sessionId, session] of this.sessions) {
      const hasActiveWindows = session.windowIds.some((windowId: string) => activeWindowIds.has(windowId));

      if (!hasActiveWindows && session.windowIds.length > 0) {
        // Clear window IDs for orphaned sessions
        session.windowIds = [];
        this.log("debug", `Cleaned up orphaned windows for session '${String(session.name)}'`);
      }
    }

    await this.saveSessions();
  }
}
