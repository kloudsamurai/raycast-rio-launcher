/**
 * Advanced Rio launcher with smart features
 */

import React, { useState, useCallback, useEffect } from "react";
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
import { getServiceRegistry } from "../services/base/ServiceRegistry";
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
  action: () => Promise<void>;
  keywords?: string[];
  accessories?: { text: string; icon?: Icon }[];
}

function LaunchRioComponent(): React.ReactElement {
  const { push, pop } = useNavigation();
  const eventBus = useEventBus();
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Services
  const { data: services, isLoading: servicesLoading } = usePromise(async () => {
    const registry = getServiceRegistry();
    await registry.initializeAll();

    return {
      process: await registry.get<ProcessService>("process"),
      profile: await registry.get<ProfileService>("profile"),
      config: await registry.get<ConfigurationService>("configuration"),
    };
  });

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
      if (services !== undefined) {
        return services.process.getRioProcesses();
      }
      return [];
    },
    [],
    {
      execute: services !== undefined,
      keepPreviousData: true,
    },
  );

  // Frecency sorting for launch options
  const { data: sortedOptions, visitItem } = useFrecencySorting(buildLaunchOptions(), {
    key: (option: ILaunchOption) => option.id,
    namespace: "rio-launch-options",
  });

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

      visitItem(profile.id).catch(() => {
        console.error("Failed to track frecency for profile");
      });
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
    [services, getWorkingDirectory, visitItem, pop, addToRecentDirectories],
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

  // Build launch options
  function buildLaunchOptions(): ILaunchOption[] {
    if (services === undefined) {
      return [];
    }

    const options: ILaunchOption[] = [
      // Quick launch
      {
        id: "quick-launch",
        title: "Quick Launch",
        subtitle: "Launch Rio in current directory",
        icon: Icon.Rocket,
        color: Color.Green,
        action: handleQuickLaunch,
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
        action: async () => handleLaunchInDirectory(homedir()),
        keywords: ["browse", "folder", "directory", "pick"],
      },

      // Sessions
      {
        id: "manage-sessions",
        title: "Manage Sessions",
        subtitle: `${runningProcesses.length} active sessions`,
        icon: Icon.Window,
        color: Color.Purple,
        action: async () => {
          push(<SessionManager />);
        },
        keywords: ["session", "window", "running"],
        accessories: [{ text: runningProcesses.length.toString() }],
      },

      // Launch history
      {
        id: "launch-history",
        title: "Launch History",
        subtitle: "Recent launches and frecency",
        icon: Icon.Clock,
        color: Color.Orange,
        action: async () =>
          push(
            <LaunchHistory
              history={recentDirectories}
              onSelect={(item: IRecentItem) => {
                (async (): Promise<void> => {
                  await services.process.launchRio({
                    workingDirectory: item.value,
                  });
                  await addToRecentDirectories(item.value);
                  pop();
                })().catch(() => {
                  console.error("Failed to launch Rio from history");
                });
              }}
            />,
          ),
        keywords: ["history", "recent", "frecency"],
      },
    ];

    // Add profile options
    for (const profile of profiles) {
      options.push({
        id: profile.id,
        title: `Launch with ${profile.name}`,
        subtitle: profile.workingDirectory ?? "Default directory",
        icon: profile.icon ?? Icon.Terminal,
        color: profile.color,
        action: async () => handleLaunchWithProfile(profile),
        keywords: ["profile", profile.name.toLowerCase()],
        accessories: isDefinedString(profile.workingDirectory)
          ? [{ text: basename(profile.workingDirectory) }]
          : undefined,
      });
    }

    // Add recent directories
    if (recentDirectories.length > 0) {
      options.push({
        id: "recent-separator",
        title: "Recent Directories",
        icon: Icon.Clock,
        action: async () => {},
      });

      const MAX_RECENT_TO_SHOW = 5;
      for (const recent of recentDirectories.slice(0, MAX_RECENT_TO_SHOW)) {
        options.push({
          id: `recent-${recent.value}`,
          title: isDefinedString(recent.label) ? recent.label : basename(recent.value),
          subtitle: recent.value,
          icon: Icon.Folder,
          action: async () => {
            await services.process.launchRio({
              workingDirectory: recent.value,
            });
            await addToRecentDirectories(recent.value);
            pop();
          },
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

  return (
    <List
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by type" storeValue onChange={() => {}}>
          <List.Dropdown.Item title="All" value="all" />
          <List.Dropdown.Item title="Profiles" value="profiles" />
          <List.Dropdown.Item title="Recent" value="recent" />
          <List.Dropdown.Item title="Sessions" value="sessions" />
        </List.Dropdown>
      }
      searchBarPlaceholder="Search launch options..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {sortedOptions.map((option: ILaunchOption) => (
        <List.Item
          accessories={option.accessories}
          actions={
            <ActionPanel>
              <Action
                icon={option.icon}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
                title={option.title}
                onAction={() => {
                  option.action().catch(() => {
                    console.error("Action failed");
                  });
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
      ))}
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
