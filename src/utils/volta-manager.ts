import { showToast, Toast } from "@raycast/api";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { CommandExecutor } from "./command-executor";
import { PathManager } from "./path-manager";

export class VoltaManager {
  private commandExecutor: CommandExecutor;
  private pathManager: PathManager;

  constructor() {
    this.commandExecutor = new CommandExecutor();
    this.pathManager = new PathManager();
  }

  async checkAndInstallVolta(): Promise<boolean> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Checking Volta...",
    });

    try {
      // Check if Volta is already installed
      const voltaPath = join(homedir(), ".volta", "bin", "volta");
      if (existsSync(voltaPath)) {
        toast.style = Toast.Style.Success;
        toast.title = "Volta is already installed";
        return true;
      }

      // Install Volta
      toast.title = "Installing Volta";
      toast.message = "📦 Setting up Node.js toolchain manager...";

      // Download and install Volta
      await this.commandExecutor.execute("curl -sSf https://get.volta.sh | bash");
      
      // Add Volta to PATH
      const voltaBin = join(homedir(), ".volta", "bin");
      this.pathManager.addToPath(voltaBin);
      
      // Run volta setup
      await this.commandExecutor.execute("volta setup", { 
        env: { ...process.env, PATH: `${voltaBin}:${process.env.PATH}` }
      });
      
      // Install Node.js tools
      toast.message = "📦 Installing Node.js tools...";
      const voltaEnv = { ...process.env, PATH: `${voltaBin}:${process.env.PATH}` };
      
      await this.commandExecutor.execute("volta install node", { env: voltaEnv });
      toast.message = "✅ Node.js installed";
      
      await this.commandExecutor.execute("volta install npm", { env: voltaEnv });
      toast.message = "✅ npm installed";
      
      await this.commandExecutor.execute("volta install pnpm", { env: voltaEnv });
      toast.message = "✅ pnpm installed";
      
      toast.style = Toast.Style.Success;
      toast.title = "Volta installed successfully";
      toast.message = "🎉 Node.js toolchain ready!";
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to install Volta";
      toast.message = error instanceof Error ? error.message : "Unknown error";
      throw error;
    }
  }

  async ensureVoltaEnvironment(): Promise<void> {
    await this.checkAndInstallVolta();
    
    // Ensure Volta bin is in PATH
    const voltaBin = join(homedir(), ".volta", "bin");
    this.pathManager.addToPath(voltaBin);
  }
}