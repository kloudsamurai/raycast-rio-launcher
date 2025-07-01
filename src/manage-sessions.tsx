/**
 * Manage Rio sessions command
 */

import React from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SessionManager } from "./components/SessionManager";

export default function ManageSessions(): React.ReactElement {
  return (
    <ErrorBoundary
      recovery={{
        strategy: "retry" as const,
        maxRetries: 3,
        retryDelay: 1000,
      }}
      showDetails
    >
      <SessionManager />
    </ErrorBoundary>
  );
}
