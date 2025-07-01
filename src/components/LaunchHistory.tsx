/**
 * Launch history component
 */

import React from "react";
import { List, Action, ActionPanel, Icon } from "@raycast/api";
import type { IRecentItem } from "../types/preferences";

interface ILaunchHistoryProps {
  history: IRecentItem[];
  onSelect: (item: IRecentItem) => void;
}

export function LaunchHistory({ history, onSelect }: ILaunchHistoryProps): React.ReactElement {
  return (
    <List.Section title="Recent Launches">
      {history.map((item: IRecentItem, _index: number) => (
        <List.Item
          accessories={[{ text: new Date(item.lastUsed).toLocaleDateString() }]}
          actions={
            <ActionPanel>
              <Action
                icon={Icon.Terminal}
                title="Launch"
                onAction={() => {
                  onSelect(item);
                }}
              />
            </ActionPanel>
          }
          icon={Icon.Clock}
          key={`history-item-${item.value}-${String(item.lastUsed)}`}
          subtitle={item.value}
          title={item.label ?? item.value}
        />
      ))}
    </List.Section>
  );
}
