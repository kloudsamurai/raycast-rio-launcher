import { showToast, Toast } from "@raycast/api";
import { platform } from "os";
import { CommandExecutor } from "./command-executor";

export interface ISystemRequirement {
  name: string;
  description: string;
  check: () => Promise<boolean>;
  fix?: () => Promise<void>;
  critical: boolean;
}

export class SystemRequirementsChecker {
  private readonly commandExecutor: CommandExecutor;
  private readonly platform: string;

  constructor() {
    this.commandExecutor = new CommandExecutor();
    this.platform = platform();
  }

  private async checkTerminalEnvironment(): Promise<boolean> {
    // Check if TERM environment variable can be set to xterm-256color
    try {
      await this.commandExecutor.execute("echo $TERM");
      return true; // If we can execute commands, terminal env is OK
    } catch {
      return false;
    }
  }

  private async checkGraphicsBackend(): Promise<boolean> {
    // Check for graphics acceleration support
    switch (this.platform) {
      case "darwin":
        // macOS always has Metal support
        return true;
      case "win32":
        // Check for DirectX/OpenGL support
        try {
          await this.commandExecutor.execute("dxdiag /t dxdiag_out.txt");
          return true;
        } catch {
          return true; // Assume it's available
        }
      case "linux":
        // Check for OpenGL support
        try {
          const { stdout } = await this.commandExecutor.execute("glxinfo | grep 'OpenGL version' || true");
          return stdout.includes("OpenGL");
        } catch {
          return true; // Assume it's available
        }
      case "aix":
      case "android":
      case "freebsd":
      case "haiku":
      case "openbsd":
      case "sunos":
      case "cygwin":
      case "netbsd":
      default:
        return true;
    }
  }

  private async check256ColorSupport(): Promise<boolean> {
    // Check if terminal supports 256 colors
    try {
      const { stdout } = await this.commandExecutor.execute("tput colors");
      const colorCount: number = parseInt(stdout.trim(), 10);
      const minColorCount: number = 256;
      return colorCount >= minColorCount;
    } catch {
      // If tput is not available, assume support
      return true;
    }
  }

  private async checkTransparencySupport(): Promise<boolean> {
    // Window transparency is OS-dependent
    switch (this.platform) {
      case "darwin":
        // macOS supports transparency natively
        return true;
      case "win32":
        // Windows 10+ supports transparency
        try {
          const { stdout } = await this.commandExecutor.execute("ver");
          return stdout.includes("10.0") || stdout.includes("11.0");
        } catch {
          return true;
        }
      case "linux":
        // Check for compositor
        try {
          const compositors: string[] = ["picom", "compton", "compiz", "kwin", "mutter"];
          for (const comp of compositors) {
            const isRunning: boolean = await this.commandExecutor.checkCommand(comp);
            if (isRunning) {
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      case "aix":
      case "android":
      case "freebsd":
      case "haiku":
      case "openbsd":
      case "sunos":
      case "cygwin":
      case "netbsd":
      default:
        return false;
    }
  }

  private async enableTransparency(): Promise<void> {
    if (this.platform === "linux") {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Enabling transparency support...",
      });

      try {
        // Try to install and run picom (lightweight compositor)
        const distro = await this.detectLinuxDistro();

        if (distro.includes("ubuntu") || distro.includes("debian")) {
          await this.commandExecutor.execute("sudo apt-get install -y picom");
        } else if (distro.includes("fedora") || distro.includes("rhel")) {
          await this.commandExecutor.execute("sudo dnf install -y picom");
        } else if (distro.includes("arch") || distro.includes("manjaro")) {
          await this.commandExecutor.execute("sudo pacman -S --noconfirm picom");
        }

        // Start picom in background
        await this.commandExecutor.execute("picom -b --config /dev/null");

        toast.style = Toast.Style.Success;
        toast.title = "Transparency support enabled";
      } catch {
        toast.style = Toast.Style.Failure;
        toast.title = "Could not enable transparency";
        toast.message = "You may need to manually install a compositor";
      }
    }
  }

  private async detectLinuxDistro(): Promise<string> {
    try {
      const { stdout } = await this.commandExecutor.execute("cat /etc/os-release | grep '^ID=' | cut -d= -f2");
      return stdout.toLowerCase().trim();
    } catch {
      return "unknown";
    }
  }

  async checkAllRequirements(): Promise<void> {
    const requirements: ISystemRequirement[] = [
      {
        name: "Terminal Environment",
        description: "Basic terminal command execution",
        check: async () => this.checkTerminalEnvironment(),
        critical: true,
      },
      {
        name: "256 Color Support",
        description: "Terminal supports 256 colors (TERM=xterm-256color)",
        check: async () => this.check256ColorSupport(),
        critical: false,
      },
      {
        name: "Graphics Backend",
        description: this.platform === "darwin" ? "Metal support" : "Graphics acceleration",
        check: async () => this.checkGraphicsBackend(),
        critical: false,
      },
      {
        name: "Window Transparency",
        description: "Compositor support for transparent windows",
        check: async () => this.checkTransparencySupport(),
        fix: async () => this.enableTransparency(),
        critical: false,
      },
    ];

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Checking system requirements...",
    });

    const failedRequirements: ISystemRequirement[] = [];

    for (const req of requirements) {
      toast.message = `Checking ${req.name}...`;

      const passed = await req.check();
      if (!passed) {
        failedRequirements.push(req);

        // Try to fix if possible
        if (req.fix !== undefined) {
          toast.message = `Fixing ${req.name}...`;
          try {
            await req.fix();
            // Remove from failed list if fix succeeded
            const index = failedRequirements.indexOf(req);
            if (index > -1) {
              failedRequirements.splice(index, 1);
            }
          } catch {
            // Fix failed, keep in failed list
          }
        }
      }
    }

    if (failedRequirements.length > 0) {
      const criticalFailed: ISystemRequirement[] = failedRequirements.filter((r: ISystemRequirement) => r.critical);

      if (criticalFailed.length > 0) {
        toast.style = Toast.Style.Failure;
        toast.title = "Critical requirements missing";
        toast.message = criticalFailed.map((r: ISystemRequirement) => r.name).join(", ");
        throw new Error("Critical system requirements not met");
      } else {
        toast.style = Toast.Style.Success;
        toast.title = "System check complete";
        toast.message = `Some optional features may not work: ${failedRequirements.map((r: ISystemRequirement) => r.name).join(", ")}`;
      }
    } else {
      toast.style = Toast.Style.Success;
      toast.title = "All system requirements met";
      toast.message = "Your system is fully compatible";
    }
  }
}
