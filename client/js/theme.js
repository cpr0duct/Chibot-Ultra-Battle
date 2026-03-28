/**
 * ChUB 2000 — Theme Toggle (Light / Dark)
 *
 * Reads preference from localStorage on load, applies it.
 * Toggle function switches between light and dark.
 */

(function () {
  const STORAGE_KEY = 'chub-theme';

  /** Apply theme on page load */
  function applyStoredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    updateToggleLabel();
  }

  /** Toggle between light and dark */
  function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
    updateToggleLabel();
  }

  /** Update the toggle button icon if present */
  function updateToggleLabel() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const isLight = document.body.classList.contains('light-theme');
    btn.textContent = isLight ? 'D' : 'L';
    btn.title = isLight ? 'Switch to Dark theme' : 'Switch to Light theme';
  }

  // Apply immediately
  applyStoredTheme();

  // Bind toggle button when DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    applyStoredTheme();
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  });

  // Expose globally
  window.ChubTheme = { toggle: toggleTheme };
})();
