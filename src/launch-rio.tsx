import { closeMainWindow, showHUD, showToast, Toast } from "@raycast/api";
import { exec } from "child_process";
import { homedir, platform } from "os";
import { join, delimiter } from "path";
import { existsSync } from "fs";
import { DependencyInstaller } from "./utils/installer";

export default async function launchRio() {
  const installer = new DependencyInstaller();

  try {
    // Step 1: Ensure Rust toolchain is installed
    await installer.ensureRustToolchain();

    // Step 2: Install Rio if not already installed
    await installer.checkAndInstallCargoPackage({
      name: "Rio Terminal",
      packageName: "rioterm",
      binaryName: "rio",
    });

    // Step 3: Launch Rio
    const rioPath = join(homedir(), ".cargo", "bin", "rio");
    await closeMainWindow();

    // Build cross-platform PATH
    const isWindows = platform() === "win32";
    const systemPaths = isWindows ? [
      "C:\\Windows\\System32",
      "C:\\Windows",
      "C:\\Windows\\System32\\Wbem",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\",
      process.env.PROGRAMFILES || "C:\\Program Files",
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
    ] : [
      "/bin",
      "/usr/bin",
      "/usr/local/bin",
      "/sbin",
      "/usr/sbin",
      "/opt/homebrew/bin",
      "/opt/local/bin",
      "/usr/local/sbin",
    ];
    
    const validSystemPaths = systemPaths.filter(p => existsSync(p));
    const fullPath = [...validSystemPaths, process.env.PATH || ''].join(delimiter);

    exec(`"${rioPath}"`, {
      shell: process.env.SHELL || (isWindows ? "cmd.exe" : "/bin/sh"),
      env: {
        ...process.env,
        PATH: fullPath
      }
    }, (error) => {
      if (error) {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to launch Rio",
          message: error.message,
        });
      } else {
        showHUD("Rio Terminal launched!");
      }
    });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Setup failed",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}
