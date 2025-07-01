/**
 * Profile manager component
 */

import React from "react";
import { Detail, Action, ActionPanel, Icon } from "@raycast/api";

export function ProfileManager(): React.ReactElement {
  return (
    <Detail
      actions={
        <ActionPanel>
          <Action.OpenInBrowser icon={Icon.Globe} title="Open Rio Documentation" url="https://raphamorim.io/rio/" />
        </ActionPanel>
      }
      markdown="# Profile Manager

Profile management interface is under development.

Features will include:
- Create and edit profiles
- Profile templates
- Import/export profiles
- Default profile settings"
    />
  );
}
