/**
 * No-op telemetry service for when telemetry is disabled
 */

import type { ITelemetryService } from "../../types/services";

export class NoOpTelemetryService implements ITelemetryService {
  async initialize(): Promise<void> {
    // Placeholder for initialization logic
    return Promise.resolve();
  }

  async cleanup(): Promise<void> {
    // Placeholder for cleanup logic
    return Promise.resolve();
  }

  isInitialized(): boolean {
    return true;
  }

  async trackEvent(): Promise<void> {
    // No-op implementation for disabled telemetry
    return Promise.resolve();
  }

  async trackError(): Promise<void> {
    // No-op implementation for disabled telemetry
    return Promise.resolve();
  }

  async trackPerformance(): Promise<void> {
    // No-op implementation for disabled telemetry
    return Promise.resolve();
  }

  async setUserProperty(): Promise<void> {
    // No-op implementation for disabled telemetry
    return Promise.resolve();
  }

  isEnabled(): boolean {
    return false;
  }

  async setEnabled(): Promise<void> {
    // No-op implementation for disabled telemetry
    return Promise.resolve();
  }
}
