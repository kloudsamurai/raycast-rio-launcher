/**
 * Environment variable editor component
 */

import React, { useState } from "react";
import { Form, Action, ActionPanel, Icon } from "@raycast/api";

interface IEnvironmentEditorProps {
  environment: Record<string, string>;
  onChange: (environment: Record<string, string>) => void;
}

export function EnvironmentEditor({ environment, onChange }: IEnvironmentEditorProps): React.JSX.Element {
  const [envVars, setEnvVars] = useState(environment);

  const addVariable = (): void => {
    const newKey = `NEW_VAR_${Object.keys(envVars).length + 1}`;
    const updated = { ...envVars, [newKey]: "" };
    setEnvVars(updated);
    onChange(updated);
  };

  const updateVariable = (oldKey: string, newKey: string, value: string): void => {
    const updated = { ...envVars };
    if (oldKey !== newKey) {
      // Remove old key when key name changes
      const { [oldKey]: _removed, ...rest } = updated;
      Object.assign(updated, rest);
    }
    updated[newKey] = value;
    setEnvVars(updated);
    onChange(updated);
  };

  const _removeVariable = (key: string): void => {
    const { [key]: _removed, ...updated } = envVars;
    setEnvVars(updated);
    onChange(updated);
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action icon={Icon.Plus} title="Add Variable" onAction={addVariable} />
        </ActionPanel>
      }
    >
      {Object.entries(envVars).map(([key, value]: [string, string]) => (
        <Form.TextField
          id={key}
          key={key}
          placeholder="Environment variable value"
          title={key}
          value={value}
          onChange={(newValue: string) => updateVariable(key, key, newValue)}
        />
      ))}
    </Form>
  );
}
