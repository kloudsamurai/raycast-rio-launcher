/**
 * Session manager for active Rio processes
 */

import React, { useState, useEffect } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  showToast,
  Toast,
  confirmAlert,
  Alert,
  Detail,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import type { ProcessService } from "../services/ProcessService";
import type { SessionService } from "../services/SessionService";
import { getServiceRegistry } from "../services/base/ServiceRegistry";
import { useEventBus } from "../services/EventBus";
import type { RioProcess, RioSession } from "../types/rio";
import type { ProcessInfo } from "../types/system";
import { formatDistanceToNow } from "../utils/date";
import { isDefinedString, isDefinedObject } from "../utils/type-guards";

export function SessionManager(): React.ReactElement {
  const { push } = useNavigation();
  const eventBus = useEventBus();
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);

  // Load services
  const { data: services } = useCachedPromise(async () => {
    const registry = getServiceRegistry();
    return {
      process: await registry.get<ProcessService>("process"),
      session: await registry.get<SessionService>("session"),
    };
  });

  // Load processes and sessions
  const {
    data: processes = [],
    isLoading: processesLoading,
    revalidate: reloadProcesses,
  } = useCachedPromise<RioProcess[]>(async (): Promise<RioProcess[]> => services?.process.getRioProcesses() ?? [], [], {
    execute: services !== undefined,
    keepPreviousData: true,
  });

  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    revalidate: reloadSessions,
  } = useCachedPromise<RioSession[]>(async (): Promise<RioSession[]> => services?.session.getSessions() ?? [], [], {
    execute: services !== undefined,
    keepPreviousData: true,
  });

  // Get process info for selected process
  const { data: processInfo } = useCachedPromise<ProcessInfo | null>(
    async (): Promise<ProcessInfo | null> => {
      if (!isDefinedObject(services) || !isDefinedString(selectedProcess)) {
        return null;
      }
      const pid = parseInt(selectedProcess, 10);
      return services.process.getProcessInfo(pid);
    },
    [selectedProcess],
    {
      execute: isDefinedObject(services) && isDefinedString(selectedProcess),
    },
  );

  // Event listeners
  useEffect(() => {
    const unsubscribes = [
      eventBus.on("rio:launched", () => reloadProcesses()),
      eventBus.on("rio:terminated", () => reloadProcesses()),
      eventBus.on("session:created", () => reloadSessions()),
      eventBus.on("session:deleted", () => reloadSessions()),
    ];

    return () => {
      unsubscribes.forEach((unsub: () => void) => unsub());
    };
  }, [eventBus, reloadProcesses, reloadSessions]);

  // Actions
  const handleAttach = async (process: RioProcess): Promise<void> => {
    if (!isDefinedObject(services)) {
      return;
    }

    try {
      await services.process.attachToProcess(process.pid);
      await showToast({
        style: Toast.Style.Success,
        title: "Attached to process",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to attach",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleTerminate = async (process: RioProcess): Promise<void> => {
    if (!isDefinedObject(services)) {
      return;
    }

    const confirmed = await confirmAlert({
      title: "Terminate Rio Process?",
      message: `This will close the Rio window (PID: ${process.pid})`,
      icon: Icon.ExclamationMark,
      primaryAction: {
        title: "Terminate",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) {
      return;
    }

    try {
      await services.process.killProcess(process.pid);
      await showToast({
        style: Toast.Style.Success,
        title: "Process terminated",
      });
      reloadProcesses();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to terminate",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleSaveSession = async (process: RioProcess): Promise<void> => {
    if (!isDefinedObject(services)) {
      return;
    }

    try {
      const session = await services.session.createSession(`Session - ${new Date().toLocaleString()}`, undefined);

      await services.session.saveSessionState({
        ...session,
        windowIds: [process.windowId],
      });

      await showToast({
        style: Toast.Style.Success,
        title: "Session saved",
      });
      reloadSessions();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save session",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleRestoreSession = async (session: RioSession): Promise<void> => {
    if (!isDefinedObject(services)) {
      return;
    }

    try {
      await services.session.restoreSession(session.id);
      await showToast({
        style: Toast.Style.Success,
        title: "Session restored",
      });
      reloadProcesses();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to restore session",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleRecordSession = async (session: RioSession): Promise<void> => {
    if (!isDefinedObject(services)) {
      return;
    }

    try {
      await services.session.recordSession(session.id);
      await showToast({
        style: Toast.Style.Success,
        title: "Recording started",
        message: "Session activity is being recorded",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to start recording",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const isLoading = Boolean(processesLoading) || Boolean(sessionsLoading);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search sessions..."
      selectedItemId={selectedProcess}
      onSelectionChange={setSelectedProcess}
    >
      {/* Active Processes */}
      <List.Section subtitle={`${processes.length} running`} title="Active Processes">
        {processes.map((process: RioProcess) => (
          <List.Item
            accessories={[
              {
                text: `PID: ${process.pid}`,
              },
              {
                text: formatDistanceToNow(process.startTime),
                tooltip: `Started: ${process.startTime.toLocaleString()}`,
              },
              isDefinedObject(processInfo) &&
                processInfo.pid === process.pid &&
                processInfo.cpuUsage !== undefined && {
                  text: `${(processInfo.cpuUsage as number).toFixed(1)}% CPU`,
                  icon: Icon.Gauge,
                },
              isDefinedObject(processInfo) &&
                processInfo.pid === process.pid &&
                processInfo.memoryUsage !== undefined && {
                  text: `${(processInfo.memoryUsage as number).toFixed(1)}% MEM`,
                  icon: Icon.MemoryChip,
                },
            ].filter(
              (
                item: { text: string; icon?: Icon; tooltip?: string } | false | undefined,
              ): item is { text: string; icon?: Icon; tooltip?: string } => item !== false && item !== undefined,
            )}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Process">
                  <Action
                    icon={Icon.Window}
                    title="Attach to Process"
                    onAction={() => {
                      handleAttach(process).catch(() => {
                        console.error("Failed to attach");
                      });
                    }}
                  />
                  <Action
                    icon={Icon.Eye}
                    shortcut={{ modifiers: ["cmd"], key: "i" }}
                    title="View Details"
                    onAction={() => {
                      push(<ProcessDetails process={process} />);
                    }}
                  />
                  <Action
                    icon={Icon.SaveDocument}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                    title="Save as Session"
                    onAction={() => {
                      handleSaveSession(process).catch(() => {
                        console.error("Failed to save session");
                      });
                    }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    icon={Icon.XMarkCircle}
                    shortcut={{ modifiers: ["cmd"], key: "delete" }}
                    style={Action.Style.Destructive}
                    title="Terminate Process"
                    onAction={() => {
                      handleTerminate(process).catch(() => {
                        console.error("Failed to terminate");
                      });
                    }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard content={process.pid.toString()} title="Copy PID" />
                  <Action.CopyToClipboard content={process.workingDirectory} title="Copy Working Directory" />
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={{ source: Icon.Terminal, tintColor: Color.Green }}
            id={process.pid.toString()}
            key={process.pid.toString()}
            subtitle={process.workingDirectory}
            title={process.title}
          />
        ))}
      </List.Section>

      {/* Saved Sessions */}
      <List.Section subtitle={`${sessions.length} sessions`} title="Saved Sessions">
        {sessions.map((session: RioSession) => (
          <List.Item
            accessories={[
              {
                text: formatDistanceToNow(session.lastAccessedAt),
                tooltip: `Last accessed: ${session.lastAccessedAt.toLocaleString()}`,
              },
              isDefinedObject(session.profile) && {
                tag: {
                  value: session.profile.name,
                  color: session.profile.color ?? Color.Blue,
                },
              },
            ].filter(
              (
                item: { text?: string; tooltip?: string; tag?: { value: string; color: Color } } | false,
              ): item is { text?: string; tooltip?: string; tag?: { value: string; color: Color } } => item !== false,
            )}
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Session">
                  <Action
                    icon={Icon.RotateClockwise}
                    title="Restore Session"
                    onAction={() => {
                      handleRestoreSession(session).catch(() => {
                        console.error("Failed to restore session");
                      });
                    }}
                  />
                  <Action
                    icon={Icon.Video}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    title="Start Recording"
                    onAction={() => {
                      handleRecordSession(session).catch(() => {
                        console.error("Failed to record session");
                      });
                    }}
                  />
                  <Action
                    icon={Icon.Eye}
                    shortcut={{ modifiers: ["cmd"], key: "i" }}
                    title="View Details"
                    onAction={() => {
                      push(<SessionDetails session={session} />);
                    }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    icon={Icon.Trash}
                    shortcut={{ modifiers: ["cmd"], key: "delete" }}
                    style={Action.Style.Destructive}
                    title="Delete Session"
                    onAction={() => {
                      if (!isDefinedObject(services)) {
                        return;
                      }
                      services.session
                        .deleteSession(session.id)
                        .then(() => {
                          reloadSessions();
                        })
                        .catch(() => {
                          console.error("Failed to delete session");
                        });
                    }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={{ source: Icon.Layers, tintColor: Color.Blue }}
            key={session.id}
            subtitle={`${session.windowIds.length} windows`}
            title={session.name}
          />
        ))}
      </List.Section>
    </List>
  );
}

// Process details component
function ProcessDetails({ process }: { process: RioProcess }): React.ReactElement {
  const { data: services } = useCachedPromise(async () => {
    const registry = getServiceRegistry();
    return {
      process: await registry.get<ProcessService>("process"),
    };
  });

  const { data: info, isLoading } = useCachedPromise(async () => services?.process.getProcessInfo(process.pid), [], {
    execute: isDefinedObject(services),
  });

  if (isLoading || !isDefinedObject(info)) {
    return <Detail markdown="" isLoading />;
  }

  const markdown = `
# Process Details

## Basic Information
- **PID**: ${info.pid}
- **Name**: ${info.name}
- **Command**: \`${info.command}\`
- **Working Directory**: ${info.workingDirectory}
- **Started**: ${info.startTime.toLocaleString()}

## Resource Usage
- **CPU Usage**: ${info.cpuUsage?.toFixed(2)}%
- **Memory Usage**: ${info.memoryUsage?.toFixed(2)}%
- **State**: ${info.state}

## Arguments
\`\`\`
${info.arguments.join(" ")}
\`\`\`
  `;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label text={info.pid.toString()} title="PID" />
          <Detail.Metadata.Label text={info.name} title="Process Name" />
          <Detail.Metadata.Label text={info.state} title="State" />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label icon={Icon.Gauge} text={`${info.cpuUsage?.toFixed(2)}%`} title="CPU Usage" />
          <Detail.Metadata.Label
            icon={Icon.MemoryChip}
            text={`${info.memoryUsage?.toFixed(2)}%`}
            title="Memory Usage"
          />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label text={info.workingDirectory} title="Working Directory" />
          <Detail.Metadata.Label text={formatDistanceToNow(info.startTime)} title="Started" />
        </Detail.Metadata>
      }
    />
  );
}

// Session details component
function SessionDetails({ session }: { session: RioSession }): React.ReactElement {
  const markdown = `
# Session: ${session.name}

## Information
- **Created**: ${session.createdAt.toLocaleString()}
- **Last Accessed**: ${session.lastAccessedAt.toLocaleString()}
- **Windows**: ${session.windowIds.length}
${isDefinedObject(session.profile) ? `- **Profile**: ${session.profile.name}` : ""}

## Window IDs
${session.windowIds.map((id: string) => `- ${id}`).join("\n")}
  `;

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label text={session.id} title="Session ID" />
          <Detail.Metadata.Label text={session.name} title="Name" />
          <Detail.Metadata.Label text={session.windowIds.length.toString()} title="Windows" />
          {isDefinedObject(session.profile) && (
            <Detail.Metadata.Label
              icon={
                isDefinedObject(session.profile.icon)
                  ? session.profile.icon
                  : {
                      source: Icon.Person,
                      tintColor: session.profile.color,
                    }
              }
              text={session.profile.name}
              title="Profile"
            />
          )}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label text={formatDistanceToNow(session.createdAt)} title="Created" />
          <Detail.Metadata.Label text={formatDistanceToNow(session.lastAccessedAt)} title="Last Accessed" />
        </Detail.Metadata>
      }
    />
  );
}
