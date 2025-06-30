import { closeMainWindow, showHUD, showToast, Toast } from "@raycast/api";
import { exec } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { DependencyInstaller } from "./utils/installer";
import { PathManager } from "./utils/path-manager";

export default async function launchRio() {
  const installer = new DependencyInstaller();
  const pathManager = PathManager.getInstance();

  try {
    // Step 1: Check system requirements
    await installer.checkSystemRequirements();

    // Step 2: Ensure development environment (Volta + Rust)
    await installer.ensureDevelopmentEnvironment();

    // Step 3: Install Rio if not already installed
    await installer.checkAndInstallCargoPackage({
      name: "Rio Terminal",
      packageName: "rioterm",
      binaryName: "rio",
    });

    // Step 4: Ensure Rio configuration exists
    await installer.ensureRioConfig();

    // Step 5: Ensure required fonts are installed
    await installer.ensureRequiredFonts();

    // Step 6: Launch Rio
    const rioPath = join(homedir(), ".cargo", "bin", "rio");
    await closeMainWindow();

    const cargoPath = join(homedir(), ".cargo", "bin");
    const fullPath = pathManager.buildFullPath([cargoPath]);

    exec(
      `"${rioPath}"`,
      {
        shell: pathManager.getDefaultShell(),
        env: {
          ...process.env,
          PATH: fullPath,
        },
      },
      (error) => {
        if (error) {
          showToast({
            style: Toast.Style.Failure,
            title: "Failed to launch Rio",
            message: error.message,
          });
        } else {
          showHUD("Rio Terminal launched!");
        }
      },
    );
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Setup failed",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
}
