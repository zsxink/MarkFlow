import { render } from 'solid-js/web';
import { AppShell } from './AppShell';

const SOLID_SHELL_ROOT_ID = 'solid-shell-root';

export function shouldBootSolidShell(env: ImportMetaEnv = import.meta.env): boolean {
  return env.VITE_MARKFLOW_SOLID_SHELL === 'true' || env.VITE_MARKFLOW_SOLID_SHELL === '1';
}

export function bootSolidShellIfEnabled(doc: Document = document): (() => void) | null {
  if (!shouldBootSolidShell()) return null;

  let root = doc.getElementById(SOLID_SHELL_ROOT_ID);
  if (!root) {
    root = doc.createElement('div');
    root.id = SOLID_SHELL_ROOT_ID;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    doc.body.append(root);
  }

  return render(() => <AppShell />, root);
}

