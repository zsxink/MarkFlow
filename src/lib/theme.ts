type Theme = 'light' | 'dark' | 'sepia';

const THEMES: Theme[] = ['light', 'dark', 'sepia'];
const THEME_ICONS: Record<Theme, string> = {
  light: '☀️',
  dark: '🌙',
  sepia: '📖',
};

let currentTheme: Theme = 'light';

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = THEME_ICONS[theme];
  const sbTheme = document.getElementById('sb-theme');
  if (sbTheme) sbTheme.textContent = THEME_ICONS[theme];
}

export function cycleTheme() {
  const idx = THEMES.indexOf(currentTheme);
  setTheme(THEMES[(idx + 1) % THEMES.length]);
}

export function initTheme() {
  const saved = localStorage.getItem('markflow-theme') as Theme | null;
  if (saved && THEMES.includes(saved)) {
    setTheme(saved);
  }
}
