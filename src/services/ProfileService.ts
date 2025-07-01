/**
 * Profile service for managing Rio launch profiles
 */

import { LocalStorage, Color } from "@raycast/api";
import { BaseService, type IServiceOptions } from "./base/BaseService";
import type { IProfileService } from "../types/services";
import type { RioProfile } from "../types/rio";
import { ValidationError, FileSystemError } from "../types/errors";
import { getEventBus } from "./EventBus";
import { randomUUID } from "crypto";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { isDefinedString, isDefinedObject } from "../utils/type-guards";

const PROFILES_STORAGE_KEY = "rio-profiles";
const DEFAULT_PROFILE_KEY = "rio-default-profile";

export class ProfileService extends BaseService implements IProfileService {
  private readonly profiles: Map<string, RioProfile> = new Map();
  private defaultProfileId: string = "";
  private readonly eventBus: ReturnType<typeof getEventBus> = getEventBus();

  // Default profile used when no specific profile is found
  private readonly defaultProfile: RioProfile = {
    id: "default",
    name: "Default Profile",
    config: {},
  };

  constructor(options?: IServiceOptions) {
    super("ProfileService", options);
  }

  protected async onInitialize(): Promise<void> {
    await this.loadProfiles();
    await this.loadDefaultProfile();

    // Create default profiles if none exist
    if (this.profiles.size === 0) {
      await this.createDefaultProfiles();
    }
  }

  protected async onCleanup(): Promise<void> {
    this.profiles.clear();
    this.defaultProfileId = "";
  }

  /**
   * Get all profiles
   */
  async getProfiles(): Promise<RioProfile[]> {
    return Array.from(this.profiles.values());
  }

  /**
   * Get a specific profile - returns default profile if not found
   */
  async getProfile(id: string): Promise<RioProfile> {
    const profile = this.profiles.get(id);
    if (isDefinedObject(profile)) {
      return profile;
    }

    // Return default profile if specific profile not found
    this.log("debug", `Profile ${id} not found, returning default profile`);
    return this.defaultProfile;
  }

  /**
   * Create a new profile
   */
  async createProfile(profile: Omit<RioProfile, "id">): Promise<RioProfile> {
    return this.trackPerformance("createProfile", async () => {
      // Validate profile
      this.validateProfile(profile);

      // Create profile with ID
      const newProfile: RioProfile = {
        ...profile,
        id: randomUUID(),
      };

      // Save profile
      this.profiles.set(newProfile.id, newProfile);
      await this.saveProfiles();

      // Emit event
      this.eventBus.emit("profile:created", { profile: newProfile });

      // Track event
      await this.trackEvent("profile_created", {
        hasIcon: isDefinedObject(newProfile.icon),
        hasColor: isDefinedObject(newProfile.color),
        hasEnvironment: isDefinedObject(newProfile.environment),
        hasWorkingDirectory: isDefinedString(newProfile.workingDirectory),
      });

      return newProfile;
    });
  }

  /**
   * Update an existing profile
   */
  async updateProfile(id: string, updates: Partial<RioProfile>): Promise<void> {
    return this.trackPerformance("updateProfile", async () => {
      const profile = this.profiles.get(id);
      if (!isDefinedObject(profile)) {
        throw new ValidationError("Profile not found", {
          field: "id",
          value: id,
        });
      }

      // Create updated profile
      const updatedProfile: RioProfile = {
        ...profile,
        ...updates,
        id, // Ensure ID doesn't change
      };

      // Validate updated profile
      this.validateProfile(updatedProfile);

      // Save profile
      this.profiles.set(id, updatedProfile);
      await this.saveProfiles();

      // Emit event
      this.eventBus.emit("profile:updated", { profile: updatedProfile });

      this.log("info", `Profile '${updatedProfile.name}' updated`);
    });
  }

  /**
   * Delete a profile
   */
  async deleteProfile(id: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!isDefinedObject(profile)) {
      throw new ValidationError("Profile not found", {
        field: "id",
        value: id,
      });
    }

    // Don't allow deleting the last profile
    if (this.profiles.size === 1) {
      throw new ValidationError("Cannot delete the last profile");
    }

    // If this is the default profile, clear default
    if (this.defaultProfileId === id) {
      this.defaultProfileId = "";
      await LocalStorage.removeItem(DEFAULT_PROFILE_KEY);
    }

    // Delete profile
    this.profiles.delete(id);
    await this.saveProfiles();

    // Emit event
    this.eventBus.emit("profile:deleted", { profileId: id });

    this.log("info", `Profile '${profile.name}' deleted`);
  }

  /**
   * Export a profile to file
   */
  async exportProfile(id: string, path: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!isDefinedObject(profile)) {
      throw new ValidationError("Profile not found", {
        field: "id",
        value: id,
      });
    }

    try {
      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        profile: {
          ...profile,
          id: undefined, // Don't export ID
        },
      };

      writeFileSync(path, JSON.stringify(exportData, null, 2), "utf-8");

      this.log("info", `Profile '${profile.name}' exported to ${path}`);
    } catch (error) {
      throw new FileSystemError("Failed to export profile", {
        cause: error as Error,
        path,
        operation: "write",
      });
    }
  }

  /**
   * Import a profile from file
   */
  async importProfile(path: string): Promise<RioProfile> {
    try {
      if (!existsSync(path)) {
        throw new FileSystemError("Import file not found", {
          path,
          operation: "read",
          code: "ENOENT",
        });
      }

      const content = readFileSync(path, "utf-8");
      const importData: unknown = JSON.parse(content);

      if (!isDefinedObject(importData) || !("profile" in importData) || !isDefinedObject(importData.profile)) {
        throw new ValidationError("Invalid profile file format");
      }

      // Create new profile from imported data
      return await this.createProfile(importData.profile as Omit<RioProfile, "id">);
    } catch (error) {
      if (error instanceof ValidationError || error instanceof FileSystemError) {
        throw error;
      }

      throw new FileSystemError("Failed to import profile", {
        cause: error as Error,
        path,
        operation: "read",
      });
    }
  }

  /**
   * Set the default profile
   */
  async setDefaultProfile(id: string): Promise<void> {
    const profile = this.profiles.get(id);
    if (!isDefinedObject(profile)) {
      throw new ValidationError("Profile not found", {
        field: "id",
        value: id,
      });
    }

    this.defaultProfileId = id;
    await LocalStorage.setItem(DEFAULT_PROFILE_KEY, id);

    this.log("info", `Default profile set to '${profile.name}'`);
  }

  /**
   * Get the default profile - always returns a valid profile
   */
  async getDefaultProfile(): Promise<RioProfile> {
    if (isDefinedString(this.defaultProfileId) && this.profiles.has(this.defaultProfileId)) {
      const profile = this.profiles.get(this.defaultProfileId);
      if (isDefinedObject(profile)) {
        return profile;
      }
    }

    // Return first available profile if default is not set
    const profiles = Array.from(this.profiles.values());
    if (profiles.length > 0) {
      return profiles[0];
    }

    // Return default profile as fallback
    return this.defaultProfile;
  }

  /**
   * Private helper methods
   */

  private async loadProfiles(): Promise<void> {
    try {
      const stored = await LocalStorage.getItem<string>(PROFILES_STORAGE_KEY);
      if (isDefinedString(stored)) {
        const profiles = JSON.parse(stored) as RioProfile[];
        for (const profile of profiles) {
          this.profiles.set(profile.id, profile);
        }
      }
    } catch (error) {
      this.log("error", "Failed to load profiles", error);
    }
  }

  private async saveProfiles(): Promise<void> {
    const profiles = Array.from(this.profiles.values());
    await LocalStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  }

  private async loadDefaultProfile(): Promise<void> {
    try {
      const defaultId = await LocalStorage.getItem<string>(DEFAULT_PROFILE_KEY);
      if (isDefinedString(defaultId) && this.profiles.has(defaultId)) {
        this.defaultProfileId = defaultId;
      }
    } catch (error) {
      this.log("error", "Failed to load default profile", error);
    }
  }

  private validateProfile(profile: Partial<RioProfile>): void {
    if (!isDefinedString(profile.name) || profile.name.trim().length === 0) {
      throw new ValidationError("Profile name is required", {
        field: "name",
        value: profile.name,
      });
    }

    const MAX_PROFILE_NAME_LENGTH = 50;
    if (profile.name.length > MAX_PROFILE_NAME_LENGTH) {
      throw new ValidationError(`Profile name must be ${MAX_PROFILE_NAME_LENGTH} characters or less`, {
        field: "name",
        value: profile.name,
      });
    }

    // Validate working directory if provided
    if (isDefinedString(profile.workingDirectory) && !existsSync(profile.workingDirectory)) {
      throw new ValidationError("Working directory does not exist", {
        field: "workingDirectory",
        value: profile.workingDirectory,
      });
    }

    // Validate shell command if provided
    if (isDefinedString(profile.shellCommand) && profile.shellCommand.includes(";")) {
      throw new ValidationError("Shell command cannot contain semicolons", {
        field: "shellCommand",
        value: profile.shellCommand,
        suggestion: "Use shellArgs for additional arguments",
      });
    }
  }

  private async createDefaultProfiles(): Promise<void> {
    const defaultProfiles: Omit<RioProfile, "id">[] = [
      {
        name: "Default",
        icon: "🖥️",
        color: Color.Blue,
        config: {},
      },
      {
        name: "Development",
        icon: "👨‍💻",
        color: Color.Green,
        config: {
          fonts: {
            size: 13,
          },
          window: {
            opacity: 0.95,
          },
        },
        environment: {
          NODE_ENV: "development",
        },
      },
      {
        name: "Production",
        icon: "🚀",
        color: Color.Red,
        config: {
          colors: {
            background: "#1a1a1a",
            foreground: "#ffffff",
          },
        },
        environment: {
          NODE_ENV: "production",
        },
      },
      {
        name: "SSH",
        icon: "🔐",
        color: Color.Orange,
        config: {
          window: {
            decorations: "Transparent",
          },
        },
      },
    ];

    for (const profileData of defaultProfiles) {
      await this.createProfile(profileData);
    }

    // Set first profile as default
    const profiles = Array.from(this.profiles.values());
    if (profiles.length > 0) {
      await this.setDefaultProfile(profiles[0].id);
    }
  }
}
