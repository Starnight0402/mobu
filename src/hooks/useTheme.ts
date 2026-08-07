import { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'nexus-theme';

function systemDefault(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Applied once, immediately, before React even mounts — avoids a flash of
// the wrong theme while Convex's settings query is still loading.
export function applyStoredThemeOnBoot() {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  applyTheme(stored ?? systemDefault());
}

export function useTheme() {
  const [theme, setLocalTheme] = useState<Theme>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? systemDefault(),
  );
  const remoteSettings = useQuery(api.settings.get);
  const setRemoteTheme = useMutation(api.settings.setTheme);

  // Once Convex's stored preference loads, it's the source of truth
  // (keeps the theme in sync across devices).
  useEffect(() => {
    if (remoteSettings?.theme && remoteSettings.theme !== theme) {
      setLocalTheme(remoteSettings.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteSettings?.theme]);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setLocalTheme(next);
    setRemoteTheme({ theme: next });
  };

  return { theme, toggleTheme };
}
