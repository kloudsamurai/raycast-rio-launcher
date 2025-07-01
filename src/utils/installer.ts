import { homedir } from "os";
import { join } from "path";
import { DependencyChecker, IDependencyConfig } from "./dependency-checker";
import { CargoPackageManager, ICargoPackageConfig } from "./cargo-package-manager";
import { RioConfigManager } from "./rio-config-manager";
import { FontManager } from "./font-manager";
import { SystemRequirementsChecker } from "./system-requirements";
import { VoltaManager } from "./volta-manager";
import { getErrorMessage } from "./type-guards";

export { ICargoPackageConfig, IDependencyConfig };

export class DependencyInstaller {
  private readonly dependencyChecker: DependencyChecker;
  private readonly cargoPackageManager: CargoPackageManager;
  private readonly rioConfigManager: RioConfigManager;
  private readonly fontManager: FontManager;
  private readonly systemRequirementsChecker: SystemRequirementsChecker;
  private readonly voltaManager: VoltaManager;

  constructor() {
    this.dependencyChecker = new DependencyChecker();
    this.cargoPackageManager = new CargoPackageManager();
    this.rioConfigManager = new RioConfigManager();
    this.fontManager = new FontManager();
    this.systemRequirementsChecker = new SystemRequirementsChecker();
    this.voltaManager = new VoltaManager();
  }

  async checkAndInstallDependency(config: IDependencyConfig): Promise<boolean> {
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

  async checkAndInstallCargoPackage(config: ICargoPackageConfig): Promise<boolean> {
    return this.cargoPackageManager.installPackage(config);
  }

  async ensureRustToolchain(): Promise<boolean> {
    try {
      await this.checkAndInstallRust();

      const cargoPath = join(homedir(), ".cargo", "bin");
      process.env.PATH = `${cargoPath}:${process.env.PATH}`;

      return true;
    } catch (error) {
      throw new Error(`Failed to setup Rust toolchain: ${getErrorMessage(error)}`);
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
      throw new Error(`Failed to setup development environment: ${getErrorMessage(error)}`);
    }
  }
}
