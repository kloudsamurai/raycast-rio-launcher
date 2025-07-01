/**
 * Rio launcher entry point
 */

import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import LaunchRio from "./components/LaunchRio";

export default function LaunchRioCommand(): React.ReactElement {
  return (
    <ErrorBoundary
      recovery={{
        strategy: "retry" as const,
        maxRetries: 3,
        retryDelay: 1000,
      }}
      showDetails
    >
      <LaunchRio />
    </ErrorBoundary>
  );
}
