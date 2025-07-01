/**
 * Configure Rio component
 */

import React from "react";
import { Detail, Action, ActionPanel, Icon } from "@raycast/api";

export function ConfigureRio(): React.JSX.Element {
  return (
    <Detail
      actions={
        <ActionPanel>
          <Action.OpenInBrowser icon={Icon.Globe} title="Open Rio Documentation" url="https://raphamorim.io/rio/" />
        </ActionPanel>
      }
      markdown="# Configure Rio

Configuration interface is under development.

Please use the Configure Rio (advanced) command for now."
    />
  );
}
