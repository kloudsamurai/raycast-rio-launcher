import { homedir } from "os";
import { join } from "path";
import { DependencyChecker } from "./dependency-checker";
import { CargoPackageManager, CargoPackageConfig } from "./cargo-package-manager";
import { RioConfigManager } from "./rio-config-manager";
import { FontManager } from "./font-manager";
import { SystemRequirementsChecker } from "./system-requirements";
import { VoltaManager } from "./volta-manager";

export interface DependencyConfig {
  name: string;
  checkCommand: string;
  installCommand: string;
  installMessage: string;
}

export { CargoPackageConfig };

export class DependencyInstaller {
  private dependencyChecker: DependencyChecker;
  private cargoPackageManager: CargoPackageManager;
  private rioConfigManager: RioConfigManager;
  private fontManager: FontManager;
  private systemRequirementsChecker: SystemRequirementsChecker;
  private voltaManager: VoltaManager;

  constructor() {
    this.dependencyChecker = new DependencyChecker();
    this.cargoPackageManager = new CargoPackageManager();
    this.rioConfigManager = new RioConfigManager();
    this.fontManager = new FontManager();
    this.systemRequirementsChecker = new SystemRequirementsChecker();
    this.voltaManager = new VoltaManager();
  }

  async checkAndInstallDependency(config: DependencyConfig): Promise<boolean> {
    return this.dependencyChecker.checkAndInstall(config);
  }

  async checkAndInstallRust(): Promise<boolean> {
    return this.checkAndInstallDependency({
      name: "Rust",
      checkCommand: "rustc",
      installCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
      installMessage: "Installing Rust...",
    });
  }

  async checkAndInstallCargo(): Promise<boolean> {
    return this.checkAndInstallDependency({
      name: "Cargo",
      checkCommand: "cargo",
      installCommand: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
      installMessage: "Installing Cargo...",
    });
  }

  async checkAndInstallCargoPackage(config: CargoPackageConfig): Promise<boolean> {
    return this.cargoPackageManager.installPackage(config);
  }

  async ensureRustToolchain(): Promise<boolean> {
    try {
      await this.checkAndInstallRust();

      const cargoPath = join(homedir(), ".cargo", "bin");
      process.env.PATH = `${cargoPath}:${process.env.PATH}`;

      return true;
    } catch (error) {
      throw new Error(`Failed to setup Rust toolchain: ${error}`);
    }
  }

  async ensureRioConfig(): Promise<void> {
    return this.rioConfigManager.ensureConfig();
  }

  async ensureRequiredFonts(): Promise<void> {
    return this.fontManager.ensureRequiredFonts();
  }

  async checkSystemRequirements(): Promise<void> {
    return this.systemRequirementsChecker.checkAllRequirements();
  }

  async ensureVoltaEnvironment(): Promise<void> {
    return this.voltaManager.ensureVoltaEnvironment();
  }

  async ensureDevelopmentEnvironment(): Promise<boolean> {
    try {
      // Install Volta for Node.js management
      await this.ensureVoltaEnvironment();
      
      // Install Rust toolchain
      await this.ensureRustToolchain();
      
      return true;
    } catch (error) {
      throw new Error(`Failed to setup development environment: ${error}`);
    }
  }
}
