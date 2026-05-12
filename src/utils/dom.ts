export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function safe(id: string, evt: string, fn: EventListenerOrEventListenerObject) {
  const el = $(id);
  if (el) el.addEventListener(evt, fn);
}
