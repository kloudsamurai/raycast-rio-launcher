import { showToast, Toast } from "@raycast/api";
import { existsSync, mkdirSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { CommandExecutor } from "./command-executor";

export interface FontConfig {
  name: string;
  fontFamily: string;
  downloadUrl?: string;
  brewCask?: string;
  chocoPackage?: string;
}

export class FontManager {
  private commandExecutor: CommandExecutor;
  private platform: NodeJS.Platform;

  constructor() {
    this.commandExecutor = new CommandExecutor();
    this.platform = platform();
  }

  private getFontDirectories(): string[] {
    switch (this.platform) {
      case "darwin":
        return ["/System/Library/Fonts", "/Library/Fonts", join(homedir(), "Library/Fonts")];
      case "win32":
        return ["C:\\Windows\\Fonts", join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts")];
      case "linux":
        return [
          "/usr/share/fonts",
          "/usr/local/share/fonts",
          join(homedir(), ".fonts"),
          join(homedir(), ".local/share/fonts"),
        ];
      default:
        return [];
    }
  }

  private async isFontInstalled(fontFamily: string): Promise<boolean> {
    const fontDirs = this.getFontDirectories();

    // Check if font exists in any font directory
    for (const dir of fontDirs) {
      if (!existsSync(dir)) continue;

      try {
        // Use platform-specific font detection
        if (this.platform === "darwin") {
          // macOS: Check multiple ways
          try {
            // Method 1: Use fc-list (more reliable for Nerd Fonts)
            const { stdout: fcList } = await this.commandExecutor.execute(
              `fc-list : family | grep -i "${fontFamily}" || true`,
            );
            if (fcList.toLowerCase().includes(fontFamily.toLowerCase())) {
              return true;
            }
          } catch {
            // fc-list might not be available
          }

          // Method 2: Use system_profiler (slower but comprehensive)
          const { stdout } = await this.commandExecutor.execute(
            `system_profiler SPFontsDataType | grep -i "${fontFamily}" || true`,
          );
          if (stdout.toLowerCase().includes(fontFamily.toLowerCase())) {
            return true;
          }
        } else if (this.platform === "win32") {
          // Windows: Check registry
          const { stdout } = await this.commandExecutor.execute(
            `reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" | findstr /i "${fontFamily}" || exit 0`,
          );
          if (stdout.toLowerCase().includes(fontFamily.toLowerCase())) {
            return true;
          }
        } else {
          // Linux: Use fc-list
          const { stdout } = await this.commandExecutor.execute(`fc-list | grep -i "${fontFamily}" || true`);
          if (stdout.toLowerCase().includes(fontFamily.toLowerCase())) {
            return true;
          }
        }
      } catch {
        // Continue checking other methods
      }
    }

    return false;
  }

  private async refreshFontCache(): Promise<void> {
    try {
      switch (this.platform) {
        case "darwin":
          // macOS font cache refresh
          await this.commandExecutor.execute(
            `atsutil databases -remove || true && atsutil server -shutdown || true && atsutil server -ping || true`,
          );
          break;
        case "win32":
          // Windows font cache refresh
          await this.commandExecutor.execute(
            `powershell -Command "Add-Type -TypeDefinition '[DllImport(\\"gdi32.dll\\")] public static extern int AddFontResource(string lpszFilename);' -Name Font -Namespace Win32; [Win32.Font]::AddFontResource($null)" || true`,
          );
          break;
        case "linux":
          // Linux font cache refresh
          await this.commandExecutor.execute(`fc-cache -f -v || true`);
          break;
      }
    } catch {
      // Font cache refresh is best-effort, don't fail if it doesn't work
    }
  }

  private async installFontMacOS(config: FontConfig): Promise<void> {
    if (config.brewCask) {
      // Try Homebrew first
      const isBrewInstalled = await this.commandExecutor.checkCommand("brew");
      if (isBrewInstalled) {
        await this.commandExecutor.execute(`brew install --cask ${config.brewCask}`);

        // Refresh font cache
        await this.refreshFontCache();
        return;
      }
    }

    // Fallback to manual download
    if (config.downloadUrl) {
      const fontDir = join(homedir(), "Library/Fonts");
      if (!existsSync(fontDir)) {
        mkdirSync(fontDir, { recursive: true });
      }

      const fileName = config.downloadUrl.split("/").pop() || "font.zip";
      const downloadPath = join("/tmp", fileName);

      await this.commandExecutor.execute(
        `curl -L "${config.downloadUrl}" -o "${downloadPath}" && ` +
          `unzip -o "${downloadPath}" -d "${fontDir}" && ` +
          `rm "${downloadPath}"`,
      );

      // Refresh font cache
      await this.refreshFontCache();
    }
  }

  private async installFontWindows(config: FontConfig): Promise<void> {
    if (config.chocoPackage) {
      // Try Chocolatey first
      const isChocoInstalled = await this.commandExecutor.checkCommand("choco");
      if (isChocoInstalled) {
        await this.commandExecutor.execute(`choco install ${config.chocoPackage} -y`);
        return;
      }
    }

    // Fallback to manual download
    if (config.downloadUrl) {
      const fontDir = join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
      if (!existsSync(fontDir)) {
        mkdirSync(fontDir, { recursive: true });
      }

      const fileName = config.downloadUrl.split("/").pop() || "font.zip";
      const downloadPath = join(process.env.TEMP || "", fileName);

      await this.commandExecutor.execute(
        `powershell -Command "Invoke-WebRequest -Uri '${config.downloadUrl}' -OutFile '${downloadPath}'; ` +
          `Expand-Archive -Path '${downloadPath}' -DestinationPath '${fontDir}' -Force; ` +
          `Remove-Item '${downloadPath}'"`,
      );

      // Refresh font cache
      await this.refreshFontCache();
    }
  }

  private async installFontLinux(config: FontConfig): Promise<void> {
    // Create user fonts directory if it doesn't exist
    const fontDir = join(homedir(), ".local/share/fonts");
    if (!existsSync(fontDir)) {
      mkdirSync(fontDir, { recursive: true });
    }

    if (config.downloadUrl) {
      const fileName = config.downloadUrl.split("/").pop() || "font.zip";
      const downloadPath = join("/tmp", fileName);

      await this.commandExecutor.execute(
        `wget "${config.downloadUrl}" -O "${downloadPath}" && ` +
          `unzip -o "${downloadPath}" -d "${fontDir}" && ` +
          `rm "${downloadPath}"`,
      );

      // Refresh font cache
      await this.refreshFontCache();
    }
  }

  async installFont(config: FontConfig): Promise<boolean> {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Checking ${config.name}...`,
    });

    try {
      const isInstalled = await this.isFontInstalled(config.fontFamily);

      if (isInstalled) {
        toast.style = Toast.Style.Success;
        toast.title = `${config.name} is already installed`;
        return true;
      }

      toast.title = `Installing ${config.name}...`;
      toast.message = "This may take a few minutes...";

      switch (this.platform) {
        case "darwin":
          await this.installFontMacOS(config);
          break;
        case "win32":
          await this.installFontWindows(config);
          break;
        case "linux":
          await this.installFontLinux(config);
          break;
        default:
          throw new Error(`Unsupported platform: ${this.platform}`);
      }

      toast.style = Toast.Style.Success;
      toast.title = `${config.name} installed successfully`;
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = `Failed to install ${config.name}`;
      toast.message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Font installation failed for ${config.name}:`, error);
      return false;
    }
  }

  async ensureRequiredFonts(): Promise<void> {
    const requiredFonts: FontConfig[] = [
      {
        name: "FiraCode Nerd Font",
        fontFamily: "FiraCode Nerd Font Mono", // Exact name Rio config expects
        brewCask: "font-fira-code-nerd-font",
        chocoPackage: "nerd-fonts-firacode",
        downloadUrl: "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/FiraCode.zip",
      },
      {
        name: "Nerd Fonts Symbols",
        fontFamily: "Symbols Nerd Font",
        brewCask: "font-symbols-only-nerd-font",
        chocoPackage: "nerd-fonts-symbols",
        downloadUrl: "https://github.com/ryanoasis/nerd-fonts/releases/latest/download/NerdFontsSymbolsOnly.zip",
      },
      {
        name: "Noto Sans CJK",
        fontFamily: "Noto Sans TC",
        brewCask: "font-noto-sans-cjk-tc",
        chocoPackage: "noto",
        downloadUrl: "https://noto-website-2.storage.googleapis.com/pkgs/NotoSansCJKtc-hinted.zip",
      },
    ];

    for (const font of requiredFonts) {
      await this.installFont(font);
    }
  }
}
