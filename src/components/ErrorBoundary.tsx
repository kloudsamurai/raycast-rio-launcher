/**
 * Error boundary component for catching and handling React errors
 */

import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { Detail, Action, ActionPanel, Icon, Color } from "@raycast/api";
import { RioLauncherError, RecoveryStrategy, type IErrorRecovery } from "../types/errors";
import { getServiceRegistry } from "../services/base/ServiceRegistry";
import type { ITelemetryService } from "../types/services";
import { isDefinedObject, isDefinedString } from "../utils/type-guards";

interface IProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  recovery?: IErrorRecovery;
  showDetails?: boolean;
}

interface IState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  isRecovering: boolean;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

export class ErrorBoundary extends Component<IProps, IState> {
  static getDerivedStateFromError(error: Error): Partial<IState> {
    return {
      hasError: true,
      error,
    };
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  constructor(props: IProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRecovering: false,
    };
  }

  componentDidMount(): void {
    // Try to get telemetry service if available
    this.initializeTelemetry();
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Track error in telemetry
    this.trackError(error, errorInfo);

    // Attempt recovery if configured
    if (isDefinedObject(this.props.recovery)) {
      this.attemptRecovery();
    }
  }

  // eslint-disable-next-line @typescript-eslint/member-ordering
  private telemetry?: ITelemetryService;

  private initializeTelemetry(): void {
    const registry = getServiceRegistry();
    if (registry.has("telemetry")) {
      registry
        .get<ITelemetryService>("telemetry")
        .then((service: ITelemetryService) => {
          this.telemetry = service;
        })
        .catch(() => {
          // Telemetry not available, continue without it
        });
    }
  }

  private trackError(error: Error, errorInfo: ErrorInfo): void {
    if (!isDefinedObject(this.telemetry)) {
      return;
    }

    this.telemetry
      .trackError(error, {
        component: "ErrorBoundary",
        componentStack: errorInfo.componentStack,
        retryCount: this.state.retryCount,
      })
      .catch(() => {
        // Don't let telemetry errors affect error boundary
      });
  }

  private attemptRecovery(): void {
    const { recovery } = this.props;
    if (!isDefinedObject(recovery)) {
      return;
    }

    const { strategy, maxRetries = DEFAULT_MAX_RETRIES, retryDelay = DEFAULT_RETRY_DELAY } = recovery;

    this.setState({ isRecovering: true });

    this.executeRecoveryStrategy(strategy, maxRetries, retryDelay);
    this.handleRecoveryCallback(recovery);
  }

  private executeRecoveryStrategy(strategy: RecoveryStrategy, maxRetries: number, retryDelay: number): void {
    switch (strategy) {
      case RecoveryStrategy.RETRY:
        this.handleRetryRecovery(maxRetries, retryDelay);
        break;

      case RecoveryStrategy.RESET:
        this.handleReset();
        break;

      case RecoveryStrategy.FALLBACK:
        // Fallback is handled in render
        this.setState({ isRecovering: false });
        break;

      case RecoveryStrategy.IGNORE:
        this.handleIgnoreRecovery();
        break;

      case RecoveryStrategy.REPORT:
        // Error is already reported
        this.setState({ isRecovering: false });
        break;

      default:
        // Unknown strategy, just set recovering to false
        this.setState({ isRecovering: false });
        break;
    }
  }

  private handleRetryRecovery(maxRetries: number, retryDelay: number): void {
    if (this.state.retryCount < maxRetries) {
      setTimeout(() => {
        this.setState((prevState: IState) => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: prevState.retryCount + 1,
          isRecovering: false,
        }));
      }, retryDelay);
    }
  }

  private handleIgnoreRecovery(): void {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: false,
    });
  }

  private handleRecoveryCallback(recovery: IErrorRecovery): void {
    if (isDefinedObject(recovery.onRecover) && isDefinedObject(this.state.error)) {
      const rioError = this.normalizeError(this.state.error);
      this.executeRecoveryCallback(recovery.onRecover, rioError);
    }
  }

  private executeRecoveryCallback(
    onRecover: (error: RioLauncherError) => Promise<void>,
    rioError: RioLauncherError,
  ): void {
    try {
      const recoveryPromise = onRecover(rioError);
      if (isDefinedObject(recoveryPromise) && typeof recoveryPromise.catch === "function") {
        recoveryPromise.catch((callbackError: unknown) => {
          this.handleRecoveryCallbackError(callbackError);
        });
      }
    } catch (callbackError: unknown) {
      this.handleRecoveryCallbackError(callbackError);
    }
  }

  private handleRecoveryCallbackError(callbackError: unknown): void {
    if (callbackError instanceof Error) {
      console.error("Recovery callback failed:", callbackError.message);
    } else {
      console.error("Recovery callback failed");
    }
    this.setState({ isRecovering: false });
  }

  private normalizeError(error: Error): RioLauncherError {
    if (error instanceof RioLauncherError) {
      return error;
    }

    return new RioLauncherError(error.message, "REACT_ERROR", {
      cause: error,
      recoverable: true,
      technicalDetails: error.stack ?? "",
      context: {
        componentStack: this.state.errorInfo?.componentStack,
      },
    }) as RioLauncherError;
  }

  private renderErrorState(): React.ReactNode {
    const { error, isRecovering } = this.state;
    const { fallback, showDetails = true, recovery } = this.props;

    // Use custom fallback if provided and recovery allows it
    if (isDefinedObject(fallback) && recovery?.strategy === RecoveryStrategy.FALLBACK) {
      return <>{fallback}</>;
    }

    // Show recovery loading state
    if (isRecovering) {
      return this.renderRecoveryState();
    }

    const rioError = isDefinedObject(error) ? this.normalizeError(error) : null;

    return this.renderErrorDetail(rioError, showDetails);
  }

  private renderRecoveryState(): React.ReactNode {
    return <Detail markdown="# Recovering from error...\n\nPlease wait while we attempt to recover." isLoading />;
  }

  private renderErrorDetail(rioError: RioLauncherError | null, showDetails: boolean): React.ReactNode {
    return (
      <Detail
        actions={this.renderActionPanel(rioError, showDetails)}
        markdown={this.generateErrorMarkdown(rioError)}
        metadata={this.renderMetadata(rioError, showDetails)}
      />
    );
  }

  private renderActionPanel(rioError: RioLauncherError | null, showDetails: boolean): React.ReactNode {
    return (
      <ActionPanel>
        <ActionPanel.Section title="Recovery">
          {this.renderRecoveryActions()}
          {this.renderCustomActions(rioError)}
        </ActionPanel.Section>
        <ActionPanel.Section title="Debug">{this.renderDebugActions(showDetails)}</ActionPanel.Section>
      </ActionPanel>
    );
  }

  private renderRecoveryActions(): React.ReactNode[] {
    return [
      <Action
        icon={Icon.RotateClockwise}
        key="try-again"
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        title="Try Again"
        onAction={this.handleReset}
      />,
      <Action
        icon={Icon.RotateAntiClockwise}
        key="reload"
        shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        title="Reload Extension"
        onAction={this.handleReload}
      />,
    ];
  }

  private renderCustomActions(rioError: RioLauncherError | null): React.ReactNode {
    if (!isDefinedObject(rioError) || !isDefinedObject(rioError.actions)) {
      return null;
    }

    return rioError.actions.map((action: { title: string; action: () => void }) => (
      <Action
        key={`action-${action.title}`}
        title={action.title}
        onAction={() => {
          action.action();
        }}
      />
    ));
  }

  private renderDebugActions(showDetails: boolean): React.ReactNode[] {
    const actions = [
      <Action
        icon={Icon.Clipboard}
        key="copy"
        shortcut={{ modifiers: ["cmd"], key: "c" }}
        title="Copy Error Details"
        onAction={() => {
          this.handleCopyError().catch(() => {
            console.error("Failed to copy error to clipboard");
          });
        }}
      />,
    ];

    if (showDetails) {
      actions.push(
        <Action.OpenInBrowser
          key="report"
          title="Report Issue"
          url="https://github.com/cyrup-ai/rio-launcher/issues/new"
        />,
      );
    }

    return actions;
  }

  private renderMetadata(rioError: RioLauncherError | null, showDetails: boolean): React.ReactNode {
    if (!showDetails || !isDefinedObject(rioError)) {
      return null;
    }

    return (
      <Detail.Metadata>
        <Detail.Metadata.Label
          icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
          text={rioError.code}
          title="Error Code"
        />
        <Detail.Metadata.Label text={rioError.timestamp.toLocaleString()} title="Timestamp" />
        {this.state.retryCount > 0 && (
          <Detail.Metadata.Label text={this.state.retryCount.toString()} title="Retry Attempts" />
        )}
        <Detail.Metadata.Separator />
        <Detail.Metadata.Label
          icon={{
            source: rioError.recoverable ? Icon.CheckCircle : Icon.XMarkCircle,
            tintColor: rioError.recoverable ? Color.Green : Color.Red,
          }}
          text={rioError.recoverable ? "Yes" : "No"}
          title="Recoverable"
        />
        {isDefinedString(rioError.helpUrl) && (
          <Detail.Metadata.Link target={rioError.helpUrl} text="View Documentation" title="Help" />
        )}
      </Detail.Metadata>
    );
  }

  private readonly handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRecovering: false,
    });
  };

  private readonly handleReload = (): void => {
    // In Raycast environment, we can't use window.location.reload()
    // Instead, restart the component tree by forcing a complete re-render
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRecovering: false,
    });
  };

  private readonly handleCopyError = async (): Promise<void> => {
    if (!isDefinedObject(this.state.error)) {
      return;
    }

    const errorDetails = {
      message: this.state.error.message,
      stack: this.state.error.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };

    // Use Raycast's clipboard API instead of navigator.clipboard
    try {
      const { Clipboard } = await import("@raycast/api");
      await Clipboard.copy(JSON.stringify(errorDetails, null, 2));
    } catch (clipboardError) {
      console.error("Unable to copy error details to clipboard", clipboardError);
    }
  };

  private generateErrorMarkdown(error: RioLauncherError | null): string {
    if (!isDefinedObject(error)) {
      return "# An error occurred\n\nNo error details available.";
    }

    const sections = this.buildErrorSections(error);
    return sections.filter(Boolean).join("\n");
  }

  private buildErrorSections(error: RioLauncherError): string[] {
    const sections = [
      `# ${error.userMessage ?? "An error occurred"}`,
      "",
      error.userMessage !== error.message ? `**Technical details:** ${error.message}` : "",
      "",
    ];

    this.addStackTraceSection(sections, error);
    this.addComponentStackSection(sections);
    this.addContextSection(sections, error);

    return sections;
  }

  private addStackTraceSection(sections: string[], error: RioLauncherError): void {
    if (this.props.showDetails === true && isDefinedString(error.technicalDetails)) {
      sections.push("## Stack Trace", "", "```", error.technicalDetails, "```", "");
    }
  }

  private addComponentStackSection(sections: string[]): void {
    if (isDefinedObject(this.state.errorInfo) && isDefinedString(this.state.errorInfo.componentStack)) {
      sections.push("## Component Stack", "", "```", this.state.errorInfo.componentStack, "```", "");
    }
  }

  private addContextSection(sections: string[], error: RioLauncherError): void {
    if (isDefinedObject(error.context) && Object.keys(error.context).length > 0) {
      sections.push("## Context", "", "```json", JSON.stringify(error.context, null, 2), "```", "");
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.renderErrorState();
    }

    return this.props.children;
  }
}

// Higher-order component for easy error boundary wrapping
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<IProps, "children">,
): React.ComponentType<P> {
  const WithErrorBoundaryComponent = (props: P): React.ReactElement => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryComponent.displayName = `withErrorBoundary(${Component.displayName ?? Component.name})`;

  return WithErrorBoundaryComponent;
}

// Hook for error handling in functional components
export function useErrorHandler(): (error: Error, errorInfo?: ErrorInfo) => never {
  return (error: Error, errorInfo?: ErrorInfo): never => {
    console.error("useErrorHandler:", error, errorInfo);

    // You can add custom error handling logic here
    // For now, we'll throw to let the nearest error boundary catch it
    throw error;
  };
}
