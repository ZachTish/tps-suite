import type { App, Plugin, PluginSettingTab } from 'obsidian';

export type ModuleId = 'notes' | 'navigator' | 'calendar' | 'controller' | 'health' | 'finances' | 'linter' | 'notifier' | 'ai';
export type Destination = 'notes' | 'calendar' | 'health' | 'finances' | 'connections';
export type ModuleState = 'disabled' | 'starting' | 'ready' | 'failed' | 'dependency-failed' | 'stopping' | 'stopped';

export interface ModuleContext {
  readonly app: App;
  readonly signal: AbortSignal;
  getApi<T>(module: ModuleId): T | undefined;
  onError(module: ModuleId, error: unknown): void;
}

export interface ModuleOwner<TApi = unknown> {
  readonly api: Readonly<TApi>;
  start(): Promise<void>;
  /** Must invalidate callbacks/mutations synchronously; no awaited work here. */
  stop(): void;
  /** Drain existing work and dispose resources; never initiate new work. */
  dispose(): Promise<void>;
}

export interface ModuleDefinition<TApi = unknown> {
  readonly id: ModuleId;
  readonly requires: readonly ModuleId[];
  create(context: ModuleContext): ModuleOwner<TApi>;
}

export interface SettingsSection {
  readonly id: string;
  readonly module: ModuleId;
  readonly destination: Destination;
  readonly label: string;
  readonly keywords: readonly string[];
  /** Load configuration only; must not initialize the execution owner. */
  render(container: HTMLElement, host: Plugin): Promise<() => void>;
}

export interface SuiteApi {
  readonly version: 1;
  readonly ready: boolean;
  moduleState(module: ModuleId): ModuleState;
  /** Only public domain APIs, never ModuleOwner or old Plugin instances. */
  domain<T>(module: ModuleId): Readonly<T> | undefined;
  openSettings(destination?: Destination): void;
}

export interface SettingsHost extends Plugin {
  api: SuiteApi;
  settingsTab: PluginSettingTab;
}
