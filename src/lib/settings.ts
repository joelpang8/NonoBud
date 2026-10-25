import { useSyncExternalStore } from 'react';
import { readLocal, writeLocal } from './storage';

/** Per-device preferences. These are conveniences, so they live on the device, not in Supabase. */
export interface Settings {
  sound: boolean;
  vibration: boolean;
  theme: 'system' | 'light' | 'dark';
}

const KEY = 'cellmates-settings';
const DEFAULTS: Settings = { sound: false, vibration: true, theme: 'system' };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readLocal(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  writeLocal(KEY, JSON.stringify(current));
  applyTheme(current.theme);
  listeners.forEach((fn) => fn());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSettings,
  );
}

/** Light/dark: the stylesheet follows the phone unless data-theme pins it. */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}
