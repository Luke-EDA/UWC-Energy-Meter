'use strict';

(() => {
  const STORAGE_KEY = 'uwc-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === DARK ? DARK : LIGHT;
    } catch {
      return LIGHT;
    }
  }

  function applyTheme(theme, persist = true) {
    const selectedTheme = theme === DARK ? DARK : LIGHT;
    document.documentElement.dataset.theme = selectedTheme;
    document.documentElement.style.colorScheme = selectedTheme;

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, selectedTheme);
      } catch {
        // The theme still applies for this page when browser storage is unavailable.
      }
    }

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const isDark = selectedTheme === DARK;
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      button.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    });

    window.dispatchEvent(new CustomEvent('uwc-theme-change', { detail: { theme: selectedTheme } }));
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === DARK ? DARK : LIGHT;
    applyTheme(current === DARK ? LIGHT : DARK);
  }

  function initialiseThemeControls() {
    applyTheme(getStoredTheme(), false);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', toggleTheme);
    });
  }

  window.UwcTheme = { applyTheme, getStoredTheme, toggleTheme };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiseThemeControls, { once: true });
  } else {
    initialiseThemeControls();
  }
})();
