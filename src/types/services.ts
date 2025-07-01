/**
 * Service layer type definitions
 */

import type { IRioConfig, IRioProcess, IRioSession, IRioProfile, IRioTheme, IRioAICommand, IRioError } from "./rio";
import type {
  IDependency,
  IInstallationProgress,
  IProcessInfo,
  ISSHHost,
  ITmuxSession,
  IInstallationResult,
} from "./system";

// Type aliases for compatibility
export type InstallationProgress = IInstallationProgress;
export type InstallationResult = IInstallationResult;
export type ConfigDiff = IConfigDiff;
export type ValidationError = IValidationError;

// Base Service Interface
export interface IBaseService {
  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
  isInitialized: () => boolean;
}

// Configuration Service Types
export interface IConfigurationService extends IBaseService {
  loadConfig: () => Promise<IRioConfig>;
  saveConfig: (config: IRioConfig) => Promise<void>;
  updateConfig: (updates: Partial<IRioConfig>) => Promise<void>;
  validateConfig: (config: IRioConfig) => Promise<IValidationResult>;
  getConfigPath: () => string;
  watchConfig: (callback: (config: IRioConfig) => void) => () => void;
  exportConfig: (path: string) => Promise<void>;
  importConfig: (path: string) => Promise<IRioConfig>;
  getDiff: (original: IRioConfig, modified: IRioConfig) => IConfigDiff[];
}

export interface IValidationResult {
  valid: boolean;
  errors: IValidationError[];
  warnings: IValidationWarning[];
}

export interface IValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface IValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

export interface IConfigDiff {
  path: string;
  type: "added" | "removed" | "modified";
  oldValue?: unknown;
  newValue?: unknown;
}

// Process Service Types
export interface IProcessService extends IBaseService {
  launchRio: (options: IRioLaunchOptions) => Promise<IRioProcess>;
  getRioProcesses: () => Promise<IRioProcess[]>;
  killProcess: (pid: number) => Promise<void>;
  attachToProcess: (pid: number) => Promise<void>;
  getProcessInfo: (pid: number) => Promise<IProcessInfo>;
  monitorProcess: (pid: number, callback: (info: IProcessInfo) => void) => () => void;
}

export interface IRioLaunchOptions {
  profile?: string;
  workingDirectory?: string;
  command?: string;
  args?: string[];
  environment?: Record<string, string>;
  sessionId?: string;
}

// Session Service Types
export interface ISessionService extends IBaseService {
  createSession: (name: string, profile?: IRioProfile) => Promise<IRioSession>;
  getSessions: () => Promise<IRioSession[]>;
  getSession: (id: string) => Promise<IRioSession>;
  updateSession: (id: string, updates: Partial<IRioSession>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  saveSessionState: (session: IRioSession) => Promise<void>;
  restoreSession: (id: string) => Promise<void>;
  recordSession: (sessionId: string) => Promise<void>;
  stopRecording: (sessionId: string) => Promise<void>;
  getSessionRecording: (sessionId: string) => Promise<ISessionRecording>;
}

export interface ISessionRecording {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  events: IRecordingEvent[];
  size: number;
}

export interface IRecordingEvent {
  timestamp: number;
  type: "input" | "output" | "resize" | "title";
  data: unknown;
}

// Profile Service Types
export interface IProfileService extends IBaseService {
  getProfiles: () => Promise<IRioProfile[]>;
  getProfile: (id: string) => Promise<IRioProfile>;
  createProfile: (profile: Omit<IRioProfile, "id">) => Promise<IRioProfile>;
  updateProfile: (id: string, updates: Partial<IRioProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  exportProfile: (id: string, path: string) => Promise<void>;
  importProfile: (path: string) => Promise<IRioProfile>;
  setDefaultProfile: (id: string) => Promise<void>;
  getDefaultProfile: () => Promise<IRioProfile>;
}

// Theme Service Types
export interface IThemeService extends IBaseService {
  getThemes: () => Promise<IRioTheme[]>;
  getTheme: (id: string) => Promise<IRioTheme>;
  getCurrentTheme: () => Promise<IRioTheme>;
  setTheme: (id: string) => Promise<void>;
  createTheme: (theme: Omit<IRioTheme, "id">) => Promise<IRioTheme>;
  updateTheme: (id: string, updates: Partial<IRioTheme>) => Promise<void>;
  deleteTheme: (id: string) => Promise<void>;
  importTheme: (path: string) => Promise<IRioTheme>;
  exportTheme: (id: string, path: string) => Promise<void>;
  previewTheme: (theme: IRioTheme) => Promise<string>; // Returns preview image path
}

// Dependency Service Types
export interface IDependencyService extends IBaseService {
  checkDependencies: () => Promise<Record<string, IDependency>>;
  installDependency: (name: string, onProgress?: (progress: IInstallationProgress) => void) => Promise<void>;
  updateDependency: (name: string) => Promise<void>;
  uninstallDependency: (name: string) => Promise<void>;
  getDependencyVersion: (name: string) => Promise<string>;
  checkForUpdates: () => Promise<IDependencyUpdate[]>;
}

export interface IDependencyUpdate {
  name: string;
  currentVersion: string;
  latestVersion: string;
  changeLog?: string;
}

// SSH Service Types
export interface ISSHService extends IBaseService {
  getHosts: () => Promise<ISSHHost[]>;
  addHost: (host: ISSHHost) => Promise<void>;
  updateHost: (name: string, updates: Partial<ISSHHost>) => Promise<void>;
  removeHost: (name: string) => Promise<void>;
  testConnection: (host: ISSHHost) => Promise<boolean>;
  launchSSHSession: (host: ISSHHost) => Promise<void>;
}

// Multiplexer Service Types
export type MultiplexerType = "tmux" | "screen";

export interface IMultiplexerSession extends ITmuxSession {
  type: MultiplexerType;
}

export interface IMultiplexerService extends IBaseService {
  getTmuxSessions: () => Promise<ITmuxSession[]>;
  getSessions: (type: MultiplexerType) => Promise<IMultiplexerSession[]>;
  attachSession: (name: string, options: { type: MultiplexerType }) => Promise<string>;
  createTmuxSession: (name: string) => Promise<void>;
  attachTmuxSession: (name: string) => Promise<void>;
  killTmuxSession: (name: string) => Promise<void>;
  getScreenSessions: () => Promise<unknown[]>;
  isMultiplexerAvailable: (type: "tmux" | "screen") => Promise<boolean>;
}

// AI Service Types
export interface IAIService extends IBaseService {
  suggestCommand: (context: ICommandContext) => Promise<string[]>;
  translateToCommand: (naturalLanguage: string) => Promise<ITranslatedCommand>;
  diagnoseError: (error: string, context?: IErrorContext) => Promise<IErrorDiagnosis>;
  getProjectSuggestions: (projectPath: string) => Promise<IProjectSuggestion[]>;
}

export interface ICommandContext {
  workingDirectory: string;
  recentCommands: string[];
  projectType?: string;
  shellType?: string;
}

export interface ITranslatedCommand {
  command: string;
  explanation: string;
  confidence: number;
  warnings?: string[];
}

export interface IErrorContext {
  command?: string;
  workingDirectory?: string;
  shellType?: string;
  exitCode?: number;
}

export interface IErrorDiagnosis {
  cause: string;
  solutions: ISolution[];
  documentation?: string[];
}

export interface ISolution {
  description: string;
  command?: string;
  confidence: number;
}

export interface IProjectSuggestion {
  title: string;
  command: string;
  description: string;
  category: string;
}

// Telemetry Service Types
export interface ITelemetryService extends IBaseService {
  trackEvent: (event: string, properties?: Record<string, unknown>) => Promise<void>;
  trackError: (error: Error, context?: Record<string, unknown>) => Promise<void>;
  trackPerformance: (metric: string, value: number) => Promise<void>;
  setUserProperty: (key: string, value: unknown) => Promise<void>;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
}

// Cache Service Types
export interface ICacheService extends IBaseService {
  get: <T>(key: string, defaultValue?: T) => Promise<T>;
  set: <T>(key: string, value: T, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  has: (key: string) => Promise<boolean>;
  getStats: () => Promise<ICacheStats>;
}

export interface ICacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

// Notification Service Types
export interface INotificationService extends IBaseService {
  showNotification: (notification: INotification) => Promise<void>;
  scheduleNotification: (notification: INotification, delay: number) => Promise<string>;
  cancelNotification: (id: string) => Promise<void>;
  getNotificationHistory: () => Promise<INotification[]>;
}

export interface INotification {
  id?: string;
  title: string;
  message?: string;
  type: "info" | "success" | "warning" | "error";
  actions?: INotificationAction[];
}

export interface INotificationAction {
  title: string;
  action: string;
}

// AI Service Types (Enhanced)
export type AIModel = "gpt-3.5-turbo" | "gpt-4";

export interface IAISuggestion {
  command: string;
  description: string;
  confidence: number;
}

export interface IAIServiceEnhanced extends IBaseService {
  getSuggestions: (context: string, limit?: number) => Promise<IAISuggestion[]>;
  diagnoseError: (error: IRioError) => Promise<string>;
  generateCommand: (description: string) => Promise<IRioAICommand | null>;
  getModels: () => Promise<AIModel[]>;
  setModel: (model: AIModel) => Promise<void>;
  clearCache: () => Promise<void>;
}

// Export Rio types for AI service compatibility
export type { IRioAICommand, IRioError } from "./rio";
