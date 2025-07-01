/**
 * Advanced Rio launcher with smart features
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  showToast,
  Toast,
  useNavigation,
  getSelectedFinderItems,
  LocalStorage,
} from "@raycast/api";
import { useFrecencySorting, usePromise, useCachedPromise } from "@raycast/utils";
import type { ProcessService } from "../services/ProcessService";
import type { ProfileService } from "../services/ProfileService";
import type { ConfigurationService } from "../services/ConfigurationService";
import { getServiceRegistry, areServicesInitialized } from "../services";
import { useEventBus } from "../services/EventBus";
import type { IRioProfile } from "../types/rio";
import type { IRecentItem } from "../types/preferences";
import { withErrorBoundary } from "./ErrorBoundary";
import { DirectoryPicker } from "./DirectoryPicker";
import { LaunchHistory } from "./LaunchHistory";
import { SessionManager } from "./SessionManager";
import { ConfigureRio } from "./ConfigureRio";
import { ProfileManager } from "./ProfileManager";
import { isDefinedString, isDefinedObject } from "../utils/type-guards";
import { homedir } from "os";
import { basename, dirname } from "path";

interface ILaunchOption {
  id: string;
  title: string;
  subtitle?: string;
  icon: Icon | string;
  color?: Color;
  type: "quick-launch" | "pick-directory" | "manage-sessions" | "launch-history" | "profile" | "recent";
  keywords?: string[];
  accessories?: { text: string; icon?: Icon }[];
  // Additional data for specific types
  profileId?: string;
  directory?: string;
}

function LaunchRioComponent(): React.ReactElement {
  const { push, pop } = useNavigation();
  const eventBus = useEventBus();
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Services initialization
  const { data: servicesInitialized, isLoading: servicesLoading, error: servicesError } = usePromise(async () => {
    try {
      const { initializeServices } = await import("../services");
      await initializeServices();
      return true;
    } catch (error) {
      console.error("Service initialization failed:", error);
      throw error;
    }
  });

  // Get services directly from registry (maintains prototype chain)
  const getServices = (): {
    process: ProcessService;
    profile: ProfileService;
    config: ConfigurationService;
  } | null => {
    // Check both initialization status and servicesInitialized flag
    if (!servicesInitialized || !areServicesInitialized()) {
      return null;
    }
    
    const registry = getServiceRegistry();
    
    // Use tryGetSync to safely get services
    const processService = registry.tryGetSync<ProcessService>("process");
    const profileService = registry.tryGetSync<ProfileService>("profile");
    const configService = registry.tryGetSync<ConfigurationService>("configuration");
    
    if (!processService || !profileService || !configService) {
      return null;
    }
    
    return {
      process: processService,
      profile: profileService,
      config: configService,
    };
  };

  const services = getServices();
  
  // Debug logging
  console.log("LaunchRio - servicesInitialized:", servicesInitialized);
  console.log("LaunchRio - areServicesInitialized():", areServicesInitialized());
  console.log("LaunchRio - services:", services ? "AVAILABLE" : "NULL");

  // Profiles with caching
  const { data: profiles = [], revalidate: reloadProfiles } = useCachedPromise(
    async () => services?.profile.getProfiles() ?? [],
    [],
    {
      initialData: [],
      keepPreviousData: true,
    },
  );

  // Recent directories
  const { data: recentDirectories = [], revalidate: reloadRecent } = useCachedPromise(
    async (): Promise<IRecentItem[]> => {
      const stored = await LocalStorage.getItem<string>("recent-directories");
      if (isDefinedString(stored) && stored !== "") {
        return JSON.parse(stored) as IRecentItem[];
      }
      return [];
    },
    [],
    {
      initialData: [],
    },
  );

  // Running processes
  const { data: runningProcesses = [] } = useCachedPromise(
    async () => {
      if (services?.process?.getRioProcesses) {
        return await services.process.getRioProcesses();
      }
      return [];
    },
    [],
    {
      execute: services !== null && services !== undefined && services.process !== null && services.process !== undefined,
      keepPreviousData: true,
    },
  );


  // Build launch options using useMemo for stable reference
  const launchOptionsMemo = useMemo(() => {
    if (!services) {
      return [];
    }
    return buildLaunchOptions();
  }, [profiles, recentDirectories, runningProcesses, services]);

  // For now, skip frecency sorting to get it working
  const sortedOptions = launchOptionsMemo || [];
  const visitItem = (_id: string): Promise<void> => Promise.resolve();

  // Add to recent directories
  const addToRecentDirectories = useCallback(
    async (directory: string) => {
      const recent: IRecentItem[] = recentDirectories.filter((item: IRecentItem) => item.value !== directory);

      recent.unshift({
        value: directory,
        label: basename(directory),
        lastUsed: new Date(),
        frequency: 1,
      });

      // Keep only last 10
      const MAX_RECENT_DIRECTORIES = 10;
      if (recent.length > MAX_RECENT_DIRECTORIES) {
        recent.pop();
      }

      await LocalStorage.setItem("recent-directories", JSON.stringify(recent));
      reloadRecent();
    },
    [recentDirectories, reloadRecent],
  );

  // Get current working directory
  const getWorkingDirectory = useCallback(async (): Promise<string> => {
    try {
      const finderItems = await getSelectedFinderItems();
      if (finderItems.length > 0) {
        const path = finderItems[0].path;
        const stat = await import("fs/promises").then(
          async (m: { stat: (path: string) => Promise<{ isDirectory: () => boolean }> }) => m.stat(path),
        );
        return stat.isDirectory() ? path : dirname(path);
      }
    } catch {
      // Ignore error and return home directory
    }
    return homedir();
  }, []);

  // Quick launch
  const handleQuickLaunch = useCallback(async () => {
    if (services === undefined) {
      return;
    }

    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Launching Rio...",
    });

    try {
      const workingDirectory = await getWorkingDirectory();
      const defaultProfile = await services.profile.getDefaultProfile();

      await services.process.launchRio({
        workingDirectory,
        profile: isDefinedObject(defaultProfile) ? defaultProfile.id : undefined,
      });

      // Add to recent directories
      await addToRecentDirectories(workingDirectory);

      toast.style = Toast.Style.Success;
      toast.title = "Rio launched!";
      toast.message = `Working directory: ${basename(workingDirectory)}`;

      pop();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to launch Rio";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    } finally {
      setIsLoading(false);
    }
  }, [services, getWorkingDirectory, pop, addToRecentDirectories]);

  // Launch with profile
  const handleLaunchWithProfile = useCallback(
    async (profile: IRioProfile) => {
      if (services === undefined) {
        return;
      }

      try {
        await visitItem(profile.id);
      } catch (error) {
        console.error("Failed to track frecency for profile:", error);
      }
      setIsLoading(true);

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Launching Rio with ${profile.name} profile...`,
      });

      try {
        const workingDirectory = profile.workingDirectory ?? (await getWorkingDirectory());

        await services.process.launchRio({
          workingDirectory,
          profile: profile.id,
          environment: profile.environment,
          command: profile.shellCommand,
          args: profile.shellArgs,
        });

        await addToRecentDirectories(workingDirectory);

        toast.style = Toast.Style.Success;
        toast.title = "Rio launched!";
        toast.message = `Profile: ${profile.name}`;

        pop();
      } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to launch Rio";
        toast.message = error instanceof Error ? error.message : "Unknown error";
      } finally {
        setIsLoading(false);
      }
    },
    [services, getWorkingDirectory, pop, addToRecentDirectories, visitItem],
  );

  // Launch in directory
  const handleLaunchInDirectory = useCallback(
    async (directory: string) => {
      if (services === undefined) {
        return;
      }

      push(
        <DirectoryPicker
          initialDirectory={directory}
          onSelect={async (selectedDir: string) => {
            setIsLoading(true);
            try {
              await services.process.launchRio({
                workingDirectory: selectedDir,
              });
              await addToRecentDirectories(selectedDir);
              pop();
            } catch (error) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Failed to launch Rio",
                message: error instanceof Error ? error.message : "Unknown error",
              });
            } finally {
              setIsLoading(false);
            }
          }}
        />,
      );
    },
    [services, push, pop, addToRecentDirectories],
  );

  // Build launch options - pure data, no functions
  function buildLaunchOptions(): ILaunchOption[] {
    const options: ILaunchOption[] = [
      // Quick launch
      {
        id: "quick-launch",
        title: "Quick Launch",
        subtitle: "Launch Rio in current directory",
        icon: Icon.Rocket,
        color: Color.Green,
        type: "quick-launch",
        keywords: ["quick", "fast", "now"],
        accessories: [{ text: "⌘↵" }],
      },

      // Launch with directory picker
      {
        id: "pick-directory",
        title: "Choose Directory...",
        subtitle: "Browse and select working directory",
        icon: Icon.Folder,
        color: Color.Blue,
        type: "pick-directory",
        keywords: ["browse", "folder", "directory", "pick"],
      },

      // Sessions
      {
        id: "manage-sessions",
        title: "Manage Sessions",
        subtitle: `${runningProcesses?.length || 0} active sessions`,
        icon: Icon.Window,
        color: Color.Purple,
        type: "manage-sessions",
        keywords: ["session", "window", "running"],
        accessories: [{ text: (runningProcesses?.length || 0).toString() }],
      },

      // Launch history
      {
        id: "launch-history",
        title: "Launch History",
        subtitle: "Recent launches and frecency",
        icon: Icon.Clock,
        color: Color.Orange,
        type: "launch-history",
        keywords: ["history", "recent", "frecency"],
      },
    ];

    // Add profile options
    for (const profile of profiles || []) {
      options.push({
        id: profile.id,
        title: `Launch with ${profile.name}`,
        subtitle: profile.workingDirectory ?? "Default directory",
        icon: profile.icon ?? Icon.Terminal,
        color: profile.color,
        type: "profile",
        profileId: profile.id,
        keywords: ["profile", profile.name.toLowerCase()],
        accessories: isDefinedString(profile.workingDirectory)
          ? [{ text: basename(profile.workingDirectory) }]
          : undefined,
      });
    }

    // Add recent directories
    if (recentDirectories && recentDirectories.length > 0) {
      const MAX_RECENT_TO_SHOW = 5;
      for (const recent of recentDirectories.slice(0, MAX_RECENT_TO_SHOW)) {
        options.push({
          id: `recent-${recent.value}`,
          title: isDefinedString(recent.label) ? recent.label : basename(recent.value),
          subtitle: recent.value,
          icon: Icon.Folder,
          type: "recent",
          directory: recent.value,
          keywords: ["recent", basename(recent.value).toLowerCase()],
          accessories: [{ date: new Date(recent.lastUsed), tooltip: "Last used" }],
        });
      }
    }

    return options;
  }

  // Event listeners
  useEffect(() => {
    const unsubscribe = eventBus.on("profile:created", () => {
      reloadProfiles();
    });

    return unsubscribe;
  }, [eventBus, reloadProfiles]);

  // Render
  if (servicesLoading) {
    return <List searchBarPlaceholder="Loading..." isLoading />;
  }

  if (servicesError) {
    return (
      <List>
        <List.Item 
          title="Failed to initialize services" 
          subtitle={servicesError.message}
          icon={Icon.ExclamationMark}
        />
      </List>
    );
  }

  if (!services) {
    return (
      <List>
        <List.Item 
          title="Services not available" 
          subtitle="Unable to load Rio services"
          icon={Icon.ExclamationMark}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search launch options..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {sortedOptions.length === 0 ? (
        <List.Item 
          title="No launch options available" 
          subtitle="Services may still be initializing..."
          icon={Icon.ExclamationMark}
        />
      ) : (
        sortedOptions.map((option: ILaunchOption) => (
        <List.Item
          key={option.id}
          accessories={option.accessories}
          actions={
            <ActionPanel>
              <Action
                icon={option.icon}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
                title={option.title}
                onAction={async () => {
                  try {
                    switch (option.type) {
                      case "quick-launch":
                        await handleQuickLaunch();
                        break;
                      case "pick-directory":
                        await handleLaunchInDirectory(homedir());
                        break;
                      case "manage-sessions":
                        push(<SessionManager />);
                        break;
                      case "launch-history":
                        push(
                          <LaunchHistory
                            history={recentDirectories}
                            onSelect={async (item: IRecentItem) => {
                              if (services) {
                                await services.process.launchRio({
                                  workingDirectory: item.value,
                                });
                                await addToRecentDirectories(item.value);
                                pop();
                              }
                            }}
                          />,
                        );
                        break;
                      case "profile":
                        if (option.profileId) {
                          const profile = profiles.find((p) => p.id === option.profileId);
                          if (profile) {
                            await handleLaunchWithProfile(profile);
                          }
                        }
                        break;
                      case "recent":
                        if (option.directory && services) {
                          await services.process.launchRio({
                            workingDirectory: option.directory,
                          });
                          await addToRecentDirectories(option.directory);
                          pop();
                        }
                        break;
                    }
                  } catch (error) {
                    console.error("Action failed:", error);
                  }
                }}
              />
              {option.id.startsWith("recent-") && (
                <Action
                  icon={Icon.Trash}
                  shortcut={{ modifiers: ["cmd"], key: "delete" }}
                  style={Action.Style.Destructive}
                  title="Remove from Recent"
                  onAction={() => {
                    (async (): Promise<void> => {
                      const dir = option.id.replace("recent-", "");
                      const filtered = recentDirectories.filter((item: IRecentItem) => item.value !== dir);
                      await LocalStorage.setItem("recent-directories", JSON.stringify(filtered));
                      reloadRecent();
                    })().catch(() => {
                      console.error("Failed to remove from recent directories");
                    });
                  }}
                />
              )}
              <ActionPanel.Section>
                <Action
                  icon={Icon.Gear}
                  shortcut={{ modifiers: ["cmd"], key: "comma" }}
                  title="Configure Rio"
                  onAction={() => {
                    push(<ConfigureRio />);
                  }}
                />
                <Action
                  icon={Icon.PersonCircle}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                  title="Manage Profiles"
                  onAction={() => {
                    push(<ProfileManager />);
                  }}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
          icon={option.icon}
          key={option.id}
          keywords={option.keywords}
          subtitle={option.subtitle}
          title={option.title}
        />
      )))}
    </List>
  );
}

// Export with error boundary
export default withErrorBoundary(LaunchRioComponent, {
  fallback: (
    <List>
      <List.Item title="Error loading launcher" />
    </List>
  ),
});
