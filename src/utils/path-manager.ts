import { existsSync } from "fs";
import { platform } from "os";
import { delimiter } from "path";

export class PathManager {
  private static instance: PathManager;

  private constructor() {}

  static getInstance(): PathManager {
    if (!PathManager.instance) {
      PathManager.instance = new PathManager();
    }
    return PathManager.instance;
  }

  getSystemPaths(): string[] {
    const isWindows = platform() === "win32";

    if (isWindows) {
      return [
        "C:\\Windows\\System32",
        "C:\\Windows",
        "C:\\Windows\\System32\\Wbem",
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\",
        process.env.PROGRAMFILES || "C:\\Program Files",
        process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      ];
    } else {
      return [
        "/bin",
        "/usr/bin",
        "/usr/local/bin",
        "/sbin",
        "/usr/sbin",
        "/opt/homebrew/bin",
        "/opt/local/bin",
        "/usr/local/sbin",
      ];
    }
  }

  buildFullPath(additionalPaths: string[] = []): string {
    const systemPaths = this.getSystemPaths();
    const existingPath = process.env.PATH || "";
    const pathSeparator = delimiter;

    const validSystemPaths = systemPaths.filter((p) => existsSync(p));
    const validAdditionalPaths = additionalPaths.filter((p) => existsSync(p));

    return [...validAdditionalPaths, ...validSystemPaths, existingPath].join(pathSeparator);
  }

  getDefaultShell(): string {
    return process.env.SHELL || (platform() === "win32" ? "cmd.exe" : "/bin/sh");
  }
}
