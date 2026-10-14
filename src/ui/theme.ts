import type { Theme } from '../render/colors';

/**
 * Light/dark mode for the page. The page's colours are CSS custom properties
 * keyed off `<html data-theme="...">` (see the top of style.css); this module
 * only decides which theme is active, remembers the choice, and keeps every
 * toggle button's label in sync.
 *
 * index.html has a tiny inline copy of `resolveInitialTheme` in <head> that
 * sets data-theme before first paint — without it, someone on a light-mode OS
 * would see a flash of the dark page while the module scripts load. Keep
 * STORAGE_KEY in step with it.
 */

const STORAGE_KEY = 'gcode-review-theme';

/** Saved choice if there is one, else the OS preference. */
export function resolveInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked (private mode, sandboxed preview) — fall through to the OS preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export interface ThemeController {
  readonly theme: Theme;
  toggle(): void;
}

/**
 * Applies the initial theme and wires every `.theme-toggle` button.
 * `onChange` runs after the page has switched, for repainting the 3D scene.
 */
export function initThemeToggle(buttons: Iterable<HTMLButtonElement>, onChange: (theme: Theme) => void): ThemeController {
  const toggles = Array.from(buttons);
  let theme = resolveInitialTheme();

  function apply(next: Theme, persist: boolean): void {
    theme = next;
    document.documentElement.dataset.theme = next;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not fatal — the theme still applies for this visit.
      }
    }
    const target = next === 'dark' ? 'light' : 'dark';
    for (const button of toggles) {
      button.setAttribute('aria-label', `Switch to ${target} mode`);
      button.title = `Switch to ${target} mode`;
      button.dataset.current = next;
    }
    onChange(next);
  }

  function toggle(): void {
    apply(theme === 'dark' ? 'light' : 'dark', true);
  }

  for (const button of toggles) button.addEventListener('click', toggle);
  apply(theme, false);

  return {
    get theme() {
      return theme;
    },
    toggle,
  };
}
