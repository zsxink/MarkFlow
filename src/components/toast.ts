let toastTimer: number | null = null;

export function showToast(message: string, duration = 2000) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toast.textContent = message;
  toast.hidden = false;

  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
    toastTimer = null;
  }, duration);
}
