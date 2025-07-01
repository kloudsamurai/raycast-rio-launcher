/**
 * System-related type definitions
 */

// Dependency Types
export interface IDependency {
  name: string;
  displayName: string;
  version?: string;
  installed: boolean;
  path?: string;
  checkCommand?: string;
  installCommand?: string;
  required: boolean;
}

export interface IDependencyStatus {
  [key: string]: IDependency;
  rust: IDependency;
  cargo: IDependency;
  volta: IDependency;
  rio: IDependency;
}

// Export alias for backward compatibility
export type Dependency = IDependency;

// Installation Types
export interface IInstallationProgress {
  dependency: string;
  status: "pending" | "downloading" | "installing" | "completed" | "failed";
  progress?: number;
  message?: string;
  error?: Error;
}

export interface IInstallationResult {
  success: boolean;
  dependency: string;
  version?: string;
  path?: string;
  duration?: number;
  error?: Error;
}

// Process Types
export interface IProcessInfo {
  pid: number;
  name: string;
  command: string;
  arguments: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  startTime: Date;
  cpuUsage?: number;
  memoryUsage?: number;
  state: "running" | "sleeping" | "stopped" | "zombie";
}

// Export alias for backward compatibility
export type ProcessInfo = IProcessInfo;

// File System Types
export interface IFileSystemItem {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink";
  size?: number;
  modified?: Date;
  created?: Date;
  permissions?: string;
  isHidden: boolean;
}

export interface IProjectInfo {
  path: string;
  name: string;
  type: "node" | "rust" | "python" | "go" | "ruby" | "java" | "unknown";
  mainFile?: string;
  dependencies?: string[];
  scripts?: Record<string, string>;
  lastOpened?: Date;
}

// SSH Types
export interface ISSHHost {
  name: string;
  hostname: string;
  port?: number;
  username?: string;
  identityFile?: string;
  proxyJump?: string;
  extraOptions?: Record<string, string>;
}

// Terminal Multiplexer Types
export interface ITmuxSession {
  name: string;
  windows: number;
  created: Date;
  attached: boolean;
  format?: string;
}

export interface IScreenSession {
  pid: number;
  name: string;
  time: string;
  status: "Attached" | "Detached";
}

// Environment Types
export interface IEnvironmentInfo {
  shell: string;
  shellVersion?: string;
  term: string;
  colorterm?: string;
  lang: string;
  home: string;
  user: string;
  path: string[];
  nodeVersion?: string;
  npmVersion?: string;
  rustVersion?: string;
  cargoVersion?: string;
}

// Font Types
export interface ISystemFont {
  family: string;
  postScriptName: string;
  style?: string;
  weight?: number;
  width?: number;
  italic?: boolean;
  monospace?: boolean;
  path?: string;
}
