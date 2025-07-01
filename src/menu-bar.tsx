/**
 * Rio menu bar status command
 */

import React, { useState } from "react";
import { MenuBarExtra, showHUD, open, showToast, Toast, Icon, Color, getPreferenceValues } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getServiceRegistry } from "./services/base/ServiceRegistry";
import type { ProcessService } from "./services/ProcessService";
import type { SessionService } from "./services/SessionService";
import type { MultiplexerService } from "./services/MultiplexerService";
import type { RioProcess, RioSession } from "./types/rio";
import type { IMultiplexerSession } from "./types/services";
import type { ExtensionPreferences } from "./types/preferences";
import { isDefinedString, isDefinedObject, getErrorMessage } from "./utils/type-guards";

export default function RioMenuBar(): React.JSX.Element {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const [isLoading, setIsLoading] = useState(true);

  // Initialize services
  const { data: services } = useCachedPromise(
    async () => {
      const registry = getServiceRegistry();

      try {
        // Initialize all services
        await registry.initializeAll();

        return {
          process: await registry.get<ProcessService>("process"),
          session: await registry.get<SessionService>("session"),
          multiplexer: await registry.get<MultiplexerService>("multiplexer"),
        };
      } catch (error) {
        console.error("Failed to initialize services:", error);
        return null;
      }
    },
    [],
    {
      keepPreviousData: true,
      onData: () => setIsLoading(false),
    },
  );

  // Get running processes
  const { data: processes = [] } = useCachedPromise<RioProcess[]>(
    async (): Promise<RioProcess[]> => services?.process.getRioProcesses() ?? [],
    [],
    {
      execute: services !== undefined,
      keepPreviousData: true,
    },
  );

  // Get sessions
  const { data: sessions = [] } = useCachedPromise<RioSession[]>(
    async (): Promise<RioSession[]> => services?.session.getSessions() ?? [],
    [],
    {
      execute: services !== undefined,
      keepPreviousData: true,
    },
  );

  // Get multiplexer sessions
  const { data: tmuxSessions = [] } = useCachedPromise<IMultiplexerSession[]>(
    async (): Promise<IMultiplexerSession[]> => services?.multiplexer.getSessions("tmux") ?? [],
    [],
    {
      execute: services !== undefined,
      keepPreviousData: true,
    },
  );

  // Build menu bar icon and title
  const runningCount = processes.length;
  const sessionCount = sessions.filter((s: RioSession) => s.active === true).length;
  const tmuxCount = tmuxSessions.length;

  const getIcon = (): { source: Icon; tintColor: Color } => {
    if (runningCount === 0) {
      return { source: Icon.Terminal, tintColor: Color.SecondaryText };
    }
    return { source: Icon.Terminal, tintColor: Color.Green };
  };

  const getTitle = (): string | undefined => {
    if (preferences.showCountInMenuBar !== true) {
      return undefined;
    }

    if (runningCount === 0) {
      return "";
    }

    return `${runningCount}`;
  };

  const getSubtitle = (): string => {
    const parts: string[] = [];

    if (runningCount > 0) {
      parts.push(`${runningCount} process${runningCount !== 1 ? "es" : ""}`);
    }

    if (sessionCount > 0) {
      parts.push(`${sessionCount} session${sessionCount !== 1 ? "s" : ""}`);
    }

    if (tmuxCount > 0) {
      parts.push(`${tmuxCount} tmux`);
    }

    const result = parts.join(" • ");
    return result !== "" ? result : "No active terminals";
  };

  const handleLaunchRio = async (): Promise<void> => {
    try {
      await showHUD("Launching Rio...");
      if (isDefinedObject(services) && isDefinedObject(services.process)) {
        await services.process.launchRio();
      } else {
        await showHUD("Process service not available");
      }
    } catch (error: unknown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch Rio",
        message: getErrorMessage(error),
      });
    }
  };

  const handleAttachSession = async (session: RioSession | IMultiplexerSession): Promise<void> => {
    try {
      if (isDefinedObject(session) && "type" in session && session.type === "tmux") {
        // Tmux session
        const sessionName = isDefinedString(session.name) ? session.name : "";
        if (isDefinedObject(services) && isDefinedObject(services.multiplexer)) {
          const command = await services.multiplexer.attachSession(sessionName, { type: "tmux" });
          if (isDefinedString(command) && isDefinedObject(services.process)) {
            await services.process.launchRio({ command });
            await showHUD(`Attached to tmux session: ${sessionName}`);
          }
        }
      } else {
        // Rio session
        const rioSession = session as RioSession;
        if (isDefinedObject(services) && isDefinedObject(services.session)) {
          await services.session.restoreSession(rioSession.id);
          await showHUD(`Attached to session: ${rioSession.name}`);
        }
      }
    } catch (error: unknown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to attach session",
        message: getErrorMessage(error),
      });
    }
  };

  const handleKillProcess = async (process: RioProcess): Promise<void> => {
    try {
      if (isDefinedObject(services) && isDefinedObject(services.process)) {
        await services.process.killProcess(process.pid);
        await showHUD(`Terminated Rio process ${process.pid}`);
      } else {
        await showHUD("Process service not available");
      }
    } catch (error: unknown) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to terminate process",
        message: getErrorMessage(error),
      });
    }
  };

  if (isLoading || services === null || services === undefined) {
    return <MenuBarExtra isLoading />;
  }

  return (
    <MenuBarExtra icon={getIcon()} title={getTitle()} tooltip={`Rio Terminal: ${getSubtitle()}`}>
      {/* Quick Actions */}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          icon={Icon.Terminal}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
          title="Launch Rio"
          onAction={() => {
            handleLaunchRio().catch((error: unknown) => {
              console.error("Failed to launch Rio:", getErrorMessage(error));
            });
          }}
        />
        <MenuBarExtra.Item
          icon={Icon.Wand}
          title="Launch Advanced..."
          onAction={() => {
            open("raycast://extensions/cyrup-ai/rio-launcher/launch-advanced").catch((error: unknown) => {
              console.error("Failed to open launch advanced:", getErrorMessage(error));
            });
          }}
        />
      </MenuBarExtra.Section>

      {/* Running Processes */}
      {processes.length > 0 && (
        <MenuBarExtra.Section title="Running Processes">
          {processes.map((process: RioProcess) => (
            <MenuBarExtra.Submenu
              icon={{ source: Icon.Terminal, tintColor: Color.Green }}
              key={process.pid}
              title={`PID ${process.pid}`}
            >
              <MenuBarExtra.Item icon={Icon.Folder} title={`Working Dir: ${process.workingDirectory}`} />
              <MenuBarExtra.Item
                icon={Icon.Clock}
                title={`Started: ${new Date(process.startTime).toLocaleTimeString()}`}
              />
              <MenuBarExtra.Separator />
              <MenuBarExtra.Item
                icon={Icon.Window}
                title="Focus Window"
                onAction={() => {
                  (async (): Promise<void> => {
                    try {
                      // Use the ProcessService to focus the Rio window
                      if (isDefinedObject(services) && isDefinedObject(services.process)) {
                        await services.process.attachToProcess(process.pid);
                        await showHUD(`Focused Rio window (PID ${process.pid})`);
                      } else {
                        await showHUD("Process service not available");
                      }
                    } catch (error: unknown) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Failed to focus window",
                        message: getErrorMessage(error),
                      });
                    }
                  })().catch((error: unknown) => {
                    console.error("Failed to focus window:", getErrorMessage(error));
                  });
                }}
              />
              <MenuBarExtra.Item
                icon={{ source: Icon.XMarkCircle, tintColor: Color.Red }}
                title="Terminate"
                onAction={() => {
                  handleKillProcess(process).catch((error: unknown) => {
                    console.error("Failed to kill process:", getErrorMessage(error));
                  });
                }}
              />
            </MenuBarExtra.Submenu>
          ))}
        </MenuBarExtra.Section>
      )}

      {/* Active Sessions */}
      {sessions.filter((s: RioSession) => s.active === true).length > 0 && (
        <MenuBarExtra.Section title="Active Sessions">
          {sessions
            .filter((s: RioSession) => s.active === true)
            .map((session: RioSession) => (
              <MenuBarExtra.Item
                icon={{ source: Icon.Window, tintColor: Color.Blue }}
                key={session.id}
                title={session.name}
                onAction={() => {
                  handleAttachSession(session).catch((error: unknown) => {
                    console.error("Failed to attach session:", getErrorMessage(error));
                  });
                }}
              />
            ))}
        </MenuBarExtra.Section>
      )}

      {/* Tmux Sessions */}
      {tmuxSessions.length > 0 && (
        <MenuBarExtra.Section title="Tmux Sessions">
          {tmuxSessions.map((session: IMultiplexerSession) => {
            const sessionName = isDefinedString(session.name) ? session.name : "Unknown";
            const isAttached = isDefinedObject(session) && session.attached;
            return (
              <MenuBarExtra.Item
                icon={{
                  source: Icon.AppWindowGrid2x2,
                  tintColor: isAttached ? Color.Green : Color.SecondaryText,
                }}
                key={sessionName}
                subtitle={isAttached ? "attached" : undefined}
                title={sessionName}
                onAction={() => {
                  handleAttachSession(session).catch((error: unknown) => {
                    console.error("Failed to attach session:", getErrorMessage(error));
                  });
                }}
              />
            );
          })}
        </MenuBarExtra.Section>
      )}

      {/* Configuration */}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          icon={Icon.Gear}
          title="Configure Rio..."
          onAction={() => {
            open("raycast://extensions/cyrup-ai/rio-launcher/configure-rio").catch((error: unknown) => {
              console.error("Failed to open configure rio:", getErrorMessage(error));
            });
          }}
        />
        <MenuBarExtra.Item
          icon={Icon.List}
          title="Manage Sessions..."
          onAction={() => {
            open("raycast://extensions/cyrup-ai/rio-launcher/manage-sessions").catch((error: unknown) => {
              console.error("Failed to open manage sessions:", getErrorMessage(error));
            });
          }}
        />
      </MenuBarExtra.Section>

      {/* Quick Settings */}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          icon={Icon.Eye}
          title={preferences.showCountInMenuBar === true ? "Hide Count" : "Show Count"}
          onAction={() => {
            (async (): Promise<void> => {
              // In Raycast, preferences can't be modified at runtime
              // Direct user to the extension preferences instead
              await showToast({
                style: Toast.Style.Animated,
                title: "Opening Extension Preferences...",
              });
              await open("raycast://extensions/cyrup-ai/rio-launcher");
            })().catch((error: unknown) => {
              console.error("Failed to open preferences:", getErrorMessage(error));
            });
          }}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
