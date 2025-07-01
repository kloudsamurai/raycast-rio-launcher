/**
 * Quick launch command for Rio terminal
 * This is a no-view command that launches Rio immediately with smart defaults
 */

import { closeMainWindow, showHUD, showToast, Toast, getSelectedFinderItems } from "@raycast/api";
import { homedir } from "os";
import { dirname } from "path";
import { existsSync } from "fs";
import { initializeServices, cleanupServices } from "./services";
import type { ProcessService } from "./services/ProcessService";
import type { ProfileService } from "./services/ProfileService";
import type { DependencyService } from "./services/DependencyService";
import type { ConfigurationService } from "./services/ConfigurationService";
import { getServiceRegistry } from "./services/base/ServiceRegistry";
import { isDefinedString, isNonEmptyArray } from "./utils/type-guards";

// Constants
const CLEANUP_DELAY_MS = 1000;

/**
 * Installs missing required dependencies
 */
async function installMissingDependencies(dependencyService: DependencyService, toast: Toast): Promise<void> {
  toast.message = "Checking dependencies...";
  const dependencies = await dependencyService.checkDependencies();

  for (const [name, dep] of Object.entries(dependencies)) {
    if (!dep.installed && dep.required) {
      toast.message = `Installing ${dep.displayName}...`;
      await dependencyService.installDependency(name);
    }
  }
}

/**
 * Determines working directory from Finder selection or defaults to home
 */
async function getWorkingDirectory(): Promise<string> {
  let workingDirectory = homedir();

  try {
    const finderItems = await getSelectedFinderItems();
    if (isNonEmptyArray(finderItems)) {
      const path = finderItems[0].path;
      if (existsSync(path)) {
        const { stat } = await import("fs/promises");
        const fileStats = await stat(path);
        workingDirectory = fileStats.isDirectory() ? path : dirname(path);
      }
    }
  } catch {
    // Ignore Finder errors - use default home directory
  }

  return workingDirectory;
}

/**
 * Generates success message for HUD display
 */
function generateSuccessMessage(workingDirectory: string): string {
  const parentDir = dirname(workingDirectory);
  const dirName = parentDir === "/" ? "/" : parentDir.split("/").pop();
  return `Rio launched in ${isDefinedString(dirName) ? dirName : "home"}`;
}

/**
 * Schedules cleanup of services with delay
 */
function scheduleCleanup(servicesInitialized: boolean): void {
  setTimeout(() => {
    if (servicesInitialized) {
      cleanupServices().catch(console.error);
    }
  }, CLEANUP_DELAY_MS);
}

/**
 * Handles launch errors by showing toast and cleaning up
 */
async function handleLaunchError(error: unknown, servicesInitialized: boolean): Promise<void> {
  await showToast({
    style: Toast.Style.Failure,
    title: "Failed to launch Rio",
    message: error instanceof Error ? error.message : "Unknown error",
    primaryAction: {
      title: "View Logs",
      onAction: (): void => {
        // Would open error details
      },
    },
  });

  if (servicesInitialized) {
    await cleanupServices();
  }
}

export default async function launchRio(): Promise<void> {
  let servicesInitialized = false;

  try {
    // Show loading toast
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Launching Rio...",
    });

    // Initialize services
    await initializeServices();
    servicesInitialized = true;

    const registry = getServiceRegistry();
    const processService = await registry.get<ProcessService>("process");
    const profileService = await registry.get<ProfileService>("profile");
    const dependencyService = await registry.get<DependencyService>("dependency");
    const configService = await registry.get<ConfigurationService>("configuration");

    // Install missing dependencies
    await installMissingDependencies(dependencyService, toast);

    // Ensure configuration exists
    toast.message = "Loading configuration...";
    await configService.loadConfig();

    // Get working directory
    const workingDirectory = await getWorkingDirectory();

    // Get default profile
    const defaultProfile = await profileService.getDefaultProfile();

    // Launch Rio
    toast.message = "Starting Rio...";
    await closeMainWindow();

    await processService.launchRio({
      workingDirectory,
      profile: defaultProfile.id,
    });

    // Show success HUD
    await showHUD(generateSuccessMessage(workingDirectory));

    // Schedule cleanup after delay
    scheduleCleanup(servicesInitialized);
  } catch (error) {
    await handleLaunchError(error, servicesInitialized);
  }
}
