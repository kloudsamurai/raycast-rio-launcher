import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfigurationEditor } from "./components/ConfigurationEditor";

export default function ConfigureRioCommand(): React.ReactElement {
  return (
    <ErrorBoundary
      recovery={{
        strategy: "retry" as const,
        maxRetries: 3,
        retryDelay: 1000,
      }}
      showDetails
    >
      <ConfigurationEditor />
    </ErrorBoundary>
  );
}