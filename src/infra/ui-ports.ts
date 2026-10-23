// ── UI ports ──────────────────────────────────────────────────────────
//
// Engine/render/export layers must never import the UI layer. When they need a
// user-visible capability they call a port from here; `src/main.ts` registers
// the real implementations once at startup.
//
// Every port has a safe default (structured warn + skip) so unit tests can run
// the engine without mounting any UI.

import { logWarn } from './logger';

/** Toast-style transient message. */
export type NotifyPort = (message: string, duration?: number) => void;

export interface ConfirmDialogButton {
  label: string;
  value: string;
  primary?: boolean;
}

export interface ConfirmDialogOptions {
  title: string;
  body: string;
  buttons: ConfirmDialogButton[];
  width?: string;
  padding?: string;
}

/** Modal dialog; resolves to the chosen button value or null when dismissed. */
export type ConfirmPort = (options: ConfirmDialogOptions) => Promise<string | null>;

/** Open a file path in the editor. Resolves false when the open was cancelled. */
export type OpenDocumentPort = (path: string) => Promise<boolean>;

export interface DiagramMenuState {
  svg: string;
  defaultName: string;
}

export type DiagramContextMenuPort = (
  x: number,
  y: number,
  state: DiagramMenuState,
) => void;

export interface TableMenuState {
  cell: HTMLElement;
}

export type TableContextMenuPort = (x: number, y: number, state: TableMenuState) => void;

export interface ImageMenuState {
  src: string;
  originalSrc: string;
  docPath: string | null;
}

export type ImageContextMenuPort = (x: number, y: number, state: ImageMenuState) => void;

/** Re-render the frontmatter panel for the given markdown (or the live doc). */
export type RefreshFrontmatterPort = (markdown?: string) => void;

export type MountFrontmatterPort = (container: HTMLElement) => void;

export interface DegradationInfo {
  tier: 'large' | 'huge';
  size: string;
  lines: number;
  readOnly?: boolean;
}

export type ShowDegradationPort = (info: DegradationInfo) => void;
export type HideDegradationPort = () => void;

/** Save-or-discard confirmation before leaving a dirty document. */
export type ConfirmTransitionPort = () => Promise<boolean>;

/**
 * External-modification resolution. The returned label mirrors the conflict
 * handler's own vocabulary so callers can report the outcome to the user.
 */
export type ExternalModificationOutcome = 'reloaded' | 'kept' | 'none' | 'ignored' | 'failed' | 'saved-as';
export type ExternalModificationPort = () => Promise<ExternalModificationOutcome>;

export type ExternalDeletionOutcome = 'discarded' | 'resaved' | 'kept' | 'ignored' | 'failed';
export type ExternalDeletionPort = (path: string) => Promise<ExternalDeletionOutcome>;

interface UiPorts {
  notify: NotifyPort;
  confirm: ConfirmPort;
  openDocument: OpenDocumentPort;
  showDiagramContextMenu: DiagramContextMenuPort;
  showTableContextMenu: TableContextMenuPort;
  showImageContextMenu: ImageContextMenuPort;
  refreshFrontmatter: RefreshFrontmatterPort;
  mountFrontmatter: MountFrontmatterPort;
  showDegradationBar: ShowDegradationPort;
  hideDegradationBar: HideDegradationPort;
  confirmDocumentTransition: ConfirmTransitionPort;
  handleExternalModification: ExternalModificationPort;
  handleExternalDeletion: ExternalDeletionPort;
}

const defaults: UiPorts = {
  notify: (message) => logWarn('ui-ports', 'notify port not registered', { message }),
  confirm: async (options) => {
    logWarn('ui-ports', 'confirm port not registered', { title: options.title });
    return null;
  },
  openDocument: async (path) => {
    logWarn('ui-ports', 'openDocument port not registered', { path });
    return false;
  },
  showDiagramContextMenu: (x, y, state) => {
    logWarn('ui-ports', 'diagram context menu port not registered', { x, y, name: state.defaultName });
  },
  showTableContextMenu: (x, y) => {
    logWarn('ui-ports', 'table context menu port not registered', { x, y });
  },
  showImageContextMenu: (x, y, state) => {
    logWarn('ui-ports', 'image context menu port not registered', { x, y, src: state.src });
  },
  refreshFrontmatter: () => logWarn('ui-ports', 'frontmatter refresh port not registered', {}),
  mountFrontmatter: () => logWarn('ui-ports', 'frontmatter mount port not registered', {}),
  showDegradationBar: (info) => logWarn('ui-ports', 'degradation bar port not registered', { tier: info.tier }),
  hideDegradationBar: () => logWarn('ui-ports', 'degradation bar port not registered', {}),
  confirmDocumentTransition: async () => {
    logWarn('ui-ports', 'document transition port not registered', {});
    return true;
  },
  handleExternalModification: async () => {
    logWarn('ui-ports', 'external modification port not registered', {});
    return 'none';
  },
  handleExternalDeletion: async (path) => {
    logWarn('ui-ports', 'external deletion port not registered', { path });
    return 'ignored' as const;
  },
};

const ports: UiPorts = { ...defaults };

/** Register the real UI implementations. Called once from `src/main.ts`. */
export function registerUiPorts(implementations: Partial<UiPorts>): void {
  Object.assign(ports, implementations);
}

/** Restore defaults; used by tests to isolate port state. */
export function resetUiPorts(): void {
  Object.assign(ports, defaults);
}

export const uiPorts = {
  notify: (message: string, duration?: number) => ports.notify(message, duration),
  confirm: (options: ConfirmDialogOptions) => ports.confirm(options),
  openDocument: (path: string) => ports.openDocument(path),
  showDiagramContextMenu: (x: number, y: number, state: DiagramMenuState) =>
    ports.showDiagramContextMenu(x, y, state),
  showTableContextMenu: (x: number, y: number, state: TableMenuState) =>
    ports.showTableContextMenu(x, y, state),
  showImageContextMenu: (x: number, y: number, state: ImageMenuState) =>
    ports.showImageContextMenu(x, y, state),
  refreshFrontmatter: (markdown?: string) => ports.refreshFrontmatter(markdown),
  mountFrontmatter: (container: HTMLElement) => ports.mountFrontmatter(container),
  showDegradationBar: (info: DegradationInfo) => ports.showDegradationBar(info),
  hideDegradationBar: () => ports.hideDegradationBar(),
  confirmDocumentTransition: () => ports.confirmDocumentTransition(),
  handleExternalModification: () => ports.handleExternalModification(),
  handleExternalDeletion: (path: string) => ports.handleExternalDeletion(path),
};
