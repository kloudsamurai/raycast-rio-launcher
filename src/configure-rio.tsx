import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useState, useEffect, type JSX } from "react";
import { RIO_FEATURES, RioFeatureDetector, type RioFeature } from "./utils/rio-features";
import { RioConfigManager } from "./utils/rio-config-manager";

export default function ConfigureRio(): JSX.Element {
  const [supportedFeatures, setSupportedFeatures] = useState<Set<string>>(new Set());
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function detectFeatures(): Promise<void> {
      const detector = new RioFeatureDetector();
      const configManager = new RioConfigManager();

      try {
        // Detect supported features
        const supported = await detector.detectSupportedFeatures();
        setSupportedFeatures(supported);

        // Load current configuration or use defaults
        const currentConfig = await configManager.readConfig();
        if (currentConfig !== null) {
          // Parse existing config to determine enabled features
          const enabled = new Set<string>();
          for (const feature of RIO_FEATURES) {
            if (feature.configKey !== undefined && feature.configKey !== "") {
              const configValue = configManager.getConfigValue(currentConfig, feature.configKey);
              if (configValue !== undefined && configValue !== false && configValue !== "" && configValue !== 0) {
                enabled.add(feature.id);
              }
            }
          }
          setSelectedFeatures(enabled.size > 0 ? enabled : detector.getDefaultEnabledFeatures());
        } else {
          // Use defaults for new installation
          setSelectedFeatures(detector.getDefaultEnabledFeatures());
        }
      } catch (error) {
        console.error("Failed to detect features:", error);
        setSelectedFeatures(detector.getDefaultEnabledFeatures());
      } finally {
        setIsLoading(false);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    detectFeatures();
  }, []);

  const handleApplyConfiguration = async (): Promise<void> => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Configuring Rio...",
    });

    try {
      const detector = new RioFeatureDetector();
      const configManager = new RioConfigManager();

      // Build configuration from selected features
      const featureConfig = detector.buildConfigFromFeatures(selectedFeatures);

      // Apply configuration
      await configManager.updateConfig(featureConfig);

      toast.style = Toast.Style.Success;
      toast.title = "Rio configured successfully!";
      toast.message = `${selectedFeatures.size} features enabled`;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Configuration failed";
      toast.message = error instanceof Error ? error.message : "Unknown error";
    }
  };

  const toggleFeature = (featureId: string): void => {
    const newSelected = new Set(selectedFeatures);
    if (newSelected.has(featureId)) {
      newSelected.delete(featureId);
    } else {
      newSelected.add(featureId);
    }
    setSelectedFeatures(newSelected);
  };

  const groupedFeatures = RIO_FEATURES.reduce<Record<string, typeof RIO_FEATURES>>(
    (acc: Record<string, typeof RIO_FEATURES>, feature: RioFeature) => {
      acc[feature.category] ??= [];
      acc[feature.category].push(feature);
      return acc;
    },
    {},
  );

  const categoryIcons = {
    navigation: "󰗧",
    display: "󰍹",
    input: "󰌋",
    performance: "󰍛",
    integration: "󰆍",
  };

  const categoryTitles = {
    navigation: "Navigation",
    display: "Display",
    input: "Input",
    performance: "Performance",
    integration: "Integration",
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search features...">
      {Object.entries(groupedFeatures).map(([category, features]: [string, RioFeature[]]) => (
        <List.Section
          key={category}
          title={`${categoryTitles[category as keyof typeof categoryTitles]}  ${categoryIcons[category as keyof typeof categoryIcons]}`}
        >
          {features.map((feature: RioFeature) => {
            const isSupported = supportedFeatures.has(feature.id);
            const isSelected = selectedFeatures.has(feature.id);

            if (!isSupported) {
              return null;
            }

            return (
              <List.Item
                accessories={[
                  {
                    text: isSelected ? "Enabled" : "Disabled",
                    icon: isSelected ? Icon.Checkmark : undefined,
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      icon={isSelected ? Icon.XMarkCircle : Icon.CheckCircle}
                      title={isSelected ? "Disable" : "Enable"}
                      onAction={() => toggleFeature(feature.id)}
                    />
                    <Action
                      icon={Icon.Upload}
                      shortcut={{ modifiers: ["cmd"], key: "s" }}
                      title="Apply Configuration"
                      onAction={() => {
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        handleApplyConfiguration();
                      }}
                    />
                    <ActionPanel.Section>
                      <Action
                        icon={Icon.CheckCircle}
                        shortcut={{ modifiers: ["cmd"], key: "a" }}
                        title="Enable All"
                        onAction={() => setSelectedFeatures(new Set(RIO_FEATURES.map((f: RioFeature) => f.id)))}
                      />
                      <Action
                        icon={Icon.ArrowClockwise}
                        shortcut={{ modifiers: ["cmd"], key: "d" }}
                        title="Reset to Defaults"
                        onAction={() => setSelectedFeatures(new RioFeatureDetector().getDefaultEnabledFeatures())}
                      />
                      <Action
                        icon={Icon.XMarkCircle}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
                        title="Disable All"
                        onAction={() => setSelectedFeatures(new Set())}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
                icon={isSelected ? Icon.CheckCircle : Icon.Circle}
                key={feature.id}
                subtitle={feature.description}
                title={feature.name}
              />
            );
          })}
        </List.Section>
      ))}
      <List.Section
        title={`${selectedFeatures.size} features selected • ${supportedFeatures.size} features available`}
      />
    </List>
  );
}
