/**
 * Rio configuration component with live preview
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Detail,
  List,
  Form,
  ActionPanel,
  Action,
  Icon,
  Color,
  showToast,
  Toast,
  confirmAlert,
  Alert,
} from "@raycast/api";
import { usePromise, useCachedState } from "@raycast/utils";
import type { ConfigurationService } from "../services/ConfigurationService";
import type { ThemeService } from "../services/ThemeService";
import { getServiceRegistry } from "../services/base/ServiceRegistry";
import type { IRioConfig, IRioTheme } from "../types/rio";
import type { IConfigDiff } from "../types/services";
import { isDefinedObject } from "../utils/type-guards";
import * as toml from "@iarna/toml";

type ViewMode = "form" | "preview" | "diff";

// Configuration window dimensions
const DEFAULT_WINDOW_WIDTH = 600;
const DEFAULT_WINDOW_HEIGHT = 400;
const DEFAULT_FONT_SIZE = 14;

// Helper function to load services
async function loadServices(): Promise<{ config: ConfigurationService; theme: ThemeService }> {
  const { initializeServices } = await import("../services");
  await initializeServices();
  
  const registry = getServiceRegistry();
  return {
    config: await registry.get<ConfigurationService>("configuration"),
    theme: await registry.get<ThemeService>("theme"),
  };
}

// Hook for managing configuration editor state
function useConfigurationEditor(): {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isDirty: boolean;
  draftConfig: IRioConfig | null;
  servicesLoading: boolean;
  configDiff: IConfigDiff[];
  handleConfigChange: (updates: Partial<IRioConfig>) => void;
  handleSave: () => Promise<void>;
  handleReset: () => Promise<void>;
} {
  const [viewMode, setViewMode] = useCachedState<ViewMode>("config-view-mode", "form");
  const [isDirty, setIsDirty] = useState(false);
  const [draftConfig, setDraftConfig] = useState<IRioConfig | null>(null);

  // Load services
  const { data: services, isLoading: servicesLoading } = usePromise(loadServices);

  // Load current configuration
  const { data: currentConfig, revalidate: reloadConfig } = usePromise(
    async () => services?.config.loadConfig() ?? null,
    [],
    {
      execute: services !== undefined,
    },
  );

  // Initialize draft config
  useEffect(() => {
    if (isDefinedObject(currentConfig) && !isDefinedObject(draftConfig)) {
      setDraftConfig(currentConfig);
    }
  }, [currentConfig, draftConfig]);

  // Load themes (currently unused but planned for future implementation)
  const { data: _themes = [] } = usePromise(async () => services?.theme.getThemes() ?? [], [], {
    execute: services !== undefined,
  });

  // Handle configuration changes
  const handleConfigChange = useCallback(
    (updates: Partial<IRioConfig>) => {
      if (draftConfig === null) {
        return;
      }

      const newConfig = { ...draftConfig, ...updates };
      setDraftConfig(newConfig);
      setIsDirty(true);
    },
    [draftConfig],
  );

  // Save configuration
  const handleSave = useCallback(async () => {
    if (!isDefinedObject(services) || !isDefinedObject(draftConfig)) {
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Saving configuration...",
    });

    try {
      const validation = await services.config.validateConfig(draftConfig);
      if (!validation.valid) {
        toast.style = Toast.Style.Failure;
        toast.title = "Invalid configuration";
        toast.message = validation.errors[0]?.message;
        return;
      }

      await services.config.saveConfig(draftConfig);

      toast.style = Toast.Style.Success;
      toast.title = "Configuration saved";
      toast.message = "Rio will use the new settings";

      setIsDirty(false);
      await reloadConfig();
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to save";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  }, [services, draftConfig, reloadConfig]);

  // Reset configuration
  const handleReset = useCallback(async () => {
    const confirmed = await confirmAlert({
      title: "Reset Configuration?",
      message: "This will discard all unsaved changes",
      icon: Icon.ExclamationMark,
      primaryAction: {
        title: "Reset",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (confirmed && isDefinedObject(currentConfig)) {
      setDraftConfig(currentConfig);
      setIsDirty(false);
    }
  }, [currentConfig]);

  // Apply theme (planned for future implementation)
  const _handleApplyTheme = useCallback(
    async (theme: IRioTheme) => {
      if (draftConfig === null) {
        return;
      }

      const newConfig: IRioConfig = {
        ...draftConfig,
        colors: theme.colors,
        cursor: theme.cursor,
        window: { ...draftConfig.window, ...theme.window },
      };

      setDraftConfig(newConfig);
      setIsDirty(true);

      await showToast({
        style: Toast.Style.Success,
        title: "Theme applied",
        message: `${theme.name} theme applied to configuration`,
      });
    },
    [draftConfig],
  );

  // Get configuration diff
  const configDiff =
    isDefinedObject(services) && isDefinedObject(currentConfig) && isDefinedObject(draftConfig) && isDirty
      ? services.config.getDiff(currentConfig, draftConfig)
      : [];

  return {
    viewMode,
    setViewMode,
    isDirty,
    draftConfig,
    servicesLoading,
    configDiff,
    handleConfigChange,
    handleSave,
    handleReset,
  };
}

// Helper function to render the appropriate view based on mode
function renderConfigurationView({
  viewMode,
  draftConfig,
  isDirty,
  configDiff,
  handleConfigChange,
  handleSave,
  handleReset,
  setViewMode,
}: {
  viewMode: ViewMode;
  draftConfig: IRioConfig;
  isDirty: boolean;
  configDiff: IConfigDiff[];
  handleConfigChange: (updates: Partial<IRioConfig>) => void;
  handleSave: () => Promise<void>;
  handleReset: () => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
}): React.JSX.Element {
  switch (viewMode) {
    case "form":
      return (
        <ConfigurationForm
          config={draftConfig}
          isDirty={isDirty}
          onChange={handleConfigChange}
          onReset={handleReset}
          onSave={handleSave}
          onViewModeChange={setViewMode}
        />
      );

    case "preview":
      return (
        <ConfigurationPreview
          config={draftConfig}
          isDirty={isDirty}
          onSave={handleSave}
          onViewModeChange={setViewMode}
        />
      );

    case "diff":
      return (
        <ConfigurationDiff diff={configDiff} onReset={handleReset} onSave={handleSave} onViewModeChange={setViewMode} />
      );

    default:
      return <Detail markdown="Invalid view mode" />;
  }
}

export function ConfigurationEditor(): React.JSX.Element {
  const {
    viewMode,
    setViewMode,
    isDirty,
    draftConfig,
    servicesLoading,
    configDiff,
    handleConfigChange,
    handleSave,
    handleReset,
  } = useConfigurationEditor();

  if (servicesLoading || !isDefinedObject(draftConfig)) {
    return <Detail markdown="" isLoading />;
  }

  return renderConfigurationView({
    viewMode,
    draftConfig,
    isDirty,
    configDiff,
    handleConfigChange,
    handleSave,
    handleReset,
    setViewMode,
  });
}

// Configuration form component
function ConfigurationForm({
  config,
  onChange,
  onSave,
  onReset,
  onViewModeChange,
  isDirty,
}: {
  config: IRioConfig;
  onChange: (updates: Partial<IRioConfig>) => void;
  onSave: () => Promise<void>;
  onReset: () => Promise<void>;
  onViewModeChange: (mode: ViewMode) => void;
  isDirty: boolean;
}): React.JSX.Element {
  return (
    <Form
      actions={
        <ActionPanel>
          <ActionPanel.Section title="Configuration">
            <Action
              icon={Icon.SaveDocument}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
              title="Save Configuration"
              onAction={() => {
                onSave().catch(() => {
                  // Error handling is done in onSave
                });
              }}
            />
            <Action
              icon={Icon.Eye}
              shortcut={{ modifiers: ["cmd"], key: "p" }}
              title="Preview TOML"
              onAction={() => onViewModeChange("preview")}
            />
            {isDirty && (
              <Action
                icon={Icon.Document}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
                title="View Changes"
                onAction={() => onViewModeChange("diff")}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action
              icon={Icon.Brush}
              title="Apply Theme"
              onAction={() => {
                // Would show theme picker
              }}
            />
            <Action
              icon={Icon.RotateAntiClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              style={Action.Style.Destructive}
              title="Reset Changes"
              onAction={() => {
                onReset().catch(() => {
                  // Error handling is done in onReset
                });
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
      navigationTitle={`Configure Rio${isDirty ? " *" : ""}`}
    >
      {/* Window Settings */}
      <Form.Separator />
      <Form.Description text="Window appearance and behavior" title="Window" />

      <Form.TextField
        id="window.width"
        placeholder="600"
        title="Width"
        value={config.window.width.toString()}
        onChange={(value: string) => {
          const parsed = parseInt(value, 10);
          onChange({
            window: { ...config.window, width: Number.isNaN(parsed) ? DEFAULT_WINDOW_WIDTH : parsed },
          });
        }}
      />

      <Form.TextField
        id="window.height"
        placeholder="400"
        title="Height"
        value={config.window.height.toString()}
        onChange={(value: string) => {
          const parsed = parseInt(value, 10);
          onChange({
            window: { ...config.window, height: Number.isNaN(parsed) ? DEFAULT_WINDOW_HEIGHT : parsed },
          });
        }}
      />

      <Form.Dropdown
        id="window.mode"
        title="Window Mode"
        value={config.window.mode}
        onChange={(value: string) =>
          onChange({
            window: { ...config.window, mode: value as "Windowed" | "Maximized" | "Fullscreen" },
          })
        }
      >
        <Form.Dropdown.Item title="Windowed" value="Windowed" />
        <Form.Dropdown.Item title="Maximized" value="Maximized" />
        <Form.Dropdown.Item title="Fullscreen" value="Fullscreen" />
      </Form.Dropdown>

      <Form.TextField
        id="window.opacity"
        info="Value between 0.0 and 1.0"
        placeholder="1.0"
        title="Opacity"
        value={config.window.opacity.toString()}
        onChange={(value: string) => {
          const parsed = parseFloat(value);
          onChange({
            window: { ...config.window, opacity: Number.isNaN(parsed) ? 1.0 : parsed },
          });
        }}
      />

      <Form.Checkbox
        id="window.blur"
        label="Enable window background blur"
        title="Background Blur"
        value={config.window.blur}
        onChange={(value: boolean) =>
          onChange({
            window: { ...config.window, blur: value },
          })
        }
      />

      {/* Font Settings */}
      <Form.Separator />
      <Form.Description text="Font family and size settings" title="Fonts" />

      <Form.TextField
        id="fonts.family"
        placeholder="cascadiacode"
        title="Font Family"
        value={config.fonts.family}
        onChange={(value: string) =>
          onChange({
            fonts: { ...config.fonts, family: value },
          })
        }
      />

      <Form.TextField
        id="fonts.size"
        placeholder="14"
        title="Font Size"
        value={config.fonts.size.toString()}
        onChange={(value: string) => {
          const parsed = parseInt(value, 10);
          onChange({
            fonts: { ...config.fonts, size: Number.isNaN(parsed) ? DEFAULT_FONT_SIZE : parsed },
          });
        }}
      />

      {/* Renderer Settings */}
      <Form.Separator />
      <Form.Description text="Rendering engine and performance" title="Renderer" />

      <Form.Dropdown
        id="renderer.backend"
        title="Backend"
        value={config.renderer.backend}
        onChange={(value: string) =>
          onChange({
            renderer: {
              ...config.renderer,
              backend: value as "Automatic" | "GL" | "Vulkan" | "Metal" | "DX12" | "WebGPU",
            },
          })
        }
      >
        <Form.Dropdown.Item title="Automatic" value="Automatic" />
        <Form.Dropdown.Item title="OpenGL" value="GL" />
        <Form.Dropdown.Item title="Vulkan" value="Vulkan" />
        <Form.Dropdown.Item title="Metal (macOS)" value="Metal" />
        <Form.Dropdown.Item title="WebGPU" value="WebGPU" />
      </Form.Dropdown>

      <Form.Dropdown
        id="renderer.performance"
        title="Performance"
        value={config.renderer.performance}
        onChange={(value: string) =>
          onChange({
            renderer: { ...config.renderer, performance: value as "High" | "Low" },
          })
        }
      >
        <Form.Dropdown.Item title="High" value="High" />
        <Form.Dropdown.Item title="Low" value="Low" />
      </Form.Dropdown>

      <Form.Checkbox
        id="renderer.disable-unfocused-render"
        label="Disable rendering when unfocused"
        title="Unfocused Rendering"
        value={config.renderer["disable-unfocused-render"]}
        onChange={(value: boolean) =>
          onChange({
            renderer: { ...config.renderer, "disable-unfocused-render": value },
          })
        }
      />

      {/* Cursor Settings */}
      <Form.Separator />
      <Form.Description text="Cursor appearance and behavior" title="Cursor" />

      <Form.Dropdown
        id="cursor.shape"
        title="Shape"
        value={config.cursor.shape}
        onChange={(value: string) =>
          onChange({
            cursor: { ...config.cursor, shape: value as "block" | "underline" | "beam" },
          })
        }
      >
        <Form.Dropdown.Item title="Block" value="block" />
        <Form.Dropdown.Item title="Underline" value="underline" />
        <Form.Dropdown.Item title="Beam (|)" value="beam" />
      </Form.Dropdown>

      <Form.Checkbox
        id="cursor.blinking"
        label="Enable cursor blinking"
        title="Blinking"
        value={config.cursor.blinking}
        onChange={(value: boolean) =>
          onChange({
            cursor: { ...config.cursor, blinking: value },
          })
        }
      />
    </Form>
  );
}

// Configuration preview component
function ConfigurationPreview({
  config,
  onViewModeChange,
  onSave,
  isDirty,
}: {
  config: IRioConfig;
  onViewModeChange: (mode: ViewMode) => void;
  onSave: () => Promise<void>;
  isDirty: boolean;
}): React.JSX.Element {
  const tomlContent = toml.stringify(config as unknown);

  const markdown = `
# Rio Configuration Preview

\`\`\`toml
${tomlContent}
\`\`\`
  `;

  return (
    <Detail
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action icon={Icon.ArrowLeft} title="Back to Form" onAction={() => onViewModeChange("form")} />
            {isDirty && (
              <>
                <Action
                  icon={Icon.SaveDocument}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                  title="Save Configuration"
                  onAction={() => {
                    onSave().catch(() => {
                      // Error handling is done in onSave
                    });
                  }}
                />
                <Action
                  icon={Icon.Document}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  title="View Changes"
                  onAction={() => onViewModeChange("diff")}
                />
              </>
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              content={tomlContent}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
              title="Copy TOML"
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
      markdown={markdown}
      navigationTitle={`Rio Configuration${isDirty ? " *" : ""}`}
    />
  );
}

// Configuration diff component
function ConfigurationDiff({
  diff,
  onViewModeChange,
  onSave,
  onReset,
}: {
  diff: IConfigDiff[];
  onViewModeChange: (mode: ViewMode) => void;
  onSave: () => Promise<void>;
  onReset: () => Promise<void>;
}): React.JSX.Element {
  return (
    <List navigationTitle="Configuration Changes" searchBarPlaceholder="Search changes...">
      {diff.length === 0 ? (
        <List.EmptyView
          description="Configuration matches the saved version"
          icon={Icon.CheckCircle}
          title="No Changes"
        />
      ) : (
        diff.map((change: IConfigDiff) => (
          <List.Item
            accessories={[
              change.type === "modified" && {
                text: `${formatValue(change.oldValue)} → ${formatValue(change.newValue)}`,
              },
              change.type === "added" && {
                text: formatValue(change.newValue),
                icon: Icon.Plus,
              },
              change.type === "removed" && {
                text: formatValue(change.oldValue),
                icon: Icon.Minus,
              },
            ].filter(
              (
                item:
                  | false
                  | { text: string; icon?: Icon }
                  | { text: string; icon?: Icon }
                  | { text: string; icon?: Icon },
              ): item is NonNullable<typeof item> => item !== false,
            )}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action icon={Icon.ArrowLeft} title="Back to Form" onAction={() => onViewModeChange("form")} />
                  <Action icon={Icon.Eye} title="Preview TOML" onAction={() => onViewModeChange("preview")} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    icon={Icon.SaveDocument}
                    shortcut={{ modifiers: ["cmd"], key: "s" }}
                    title="Save Changes"
                    onAction={() => {
                      onSave().catch(() => {
                        // Error handling is done in onSave
                      });
                    }}
                  />
                  <Action
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    title="Discard Changes"
                    onAction={() => {
                      onReset().catch(() => {
                        // Error handling is done in onReset
                      });
                    }}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
            icon={getDiffIcon(change)}
            key={change.path}
            subtitle={getDiffDescription(change)}
            title={change.path}
          />
        ))
      )}
    </List>
  );
}

// Helper functions
function getDiffIcon(change: IConfigDiff): { source: Icon; tintColor: Color } {
  switch (change.type) {
    case "added":
      return { source: Icon.PlusCircle, tintColor: Color.Green };
    case "removed":
      return { source: Icon.MinusCircle, tintColor: Color.Red };
    case "modified":
      return { source: Icon.Pencil, tintColor: Color.Orange };
    default:
      return { source: Icon.Circle, tintColor: Color.PrimaryText };
  }
}

function getDiffDescription(change: IConfigDiff): string {
  switch (change.type) {
    case "added":
      return "New configuration value";
    case "removed":
      return "Configuration value removed";
    case "modified":
      return "Configuration value changed";
    default:
      return "Configuration value";
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "unset";
  }
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
