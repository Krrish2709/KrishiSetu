(() => {
  const root = document.documentElement;
  const themeKey = 'krishisetu-theme';
  let dark = false;

  try {
    dark = localStorage.getItem(themeKey) === 'dark';
  } catch {
    // The controls still work when storage is unavailable.
  }
  root.dataset.theme = dark ? 'dark' : 'light';

  document.addEventListener('DOMContentLoaded', () => {
    const theme = document.getElementById('themeToggle');
    const chat = document.getElementById('chatWidget');
    const launcher = document.getElementById('chatLauncher');
    const preview = document.getElementById('chatPreview');
    const close = document.getElementById('chatClose');

    function syncTheme() {
      theme.setAttribute('aria-pressed', String(dark));
      theme.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }
    syncTheme();

    theme.addEventListener('click', () => {
      dark = !dark;
      root.dataset.theme = dark ? 'dark' : 'light';
      syncTheme();
      try {
        localStorage.setItem(themeKey, root.dataset.theme);
      } catch {
        // The current page keeps the chosen theme.
      }
    });

    function setChat(open, restoreFocus = false) {
      preview.hidden = !open;
      launcher.setAttribute('aria-expanded', String(open));
      if (open) close.focus();
      else if (restoreFocus) launcher.focus();
    }

    launcher.addEventListener('click', () => setChat(preview.hidden));
    close.addEventListener('click', () => setChat(false, true));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !preview.hidden) setChat(false, chat.contains(document.activeElement));
    });
    document.addEventListener('click', event => {
      if (!preview.hidden && !chat.contains(event.target)) setChat(false);
    });
  });
})();
