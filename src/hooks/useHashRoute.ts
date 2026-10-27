import { SIZES } from '../puzzles/library';
import { useCallback, useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'gallery' } | { name: 'settings' } | { name: 'puzzle'; id: string } | { name: 'random'; n: number; seed: number };

/**
 * Tiny hash router. Hash URLs work on any static host with no server config,
 * and make the phone's back gesture return to the level list.
 *   #/            home
 *   #/gallery     finished pictures
 *   #/settings    sound, vibration, theme, account
 *   #/p/<id>      library puzzle
 *   #/r/<n>/<seed> random puzzle (rebuilt from its seed)
 */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'gallery') return { name: 'gallery' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'p' && parts[1]) return { name: 'puzzle', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'r' && parts[1] && parts[2]) {
    const n = Number(parts[1]);
    const seed = Number(parts[2]);
    if ((SIZES as readonly number[]).includes(n) && Number.isInteger(seed) && seed >= 0) return { name: 'random', n, seed };
  }
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  if (r.name === 'gallery') return '#/gallery';
  if (r.name === 'settings') return '#/settings';
  if (r.name === 'puzzle') return `#/p/${encodeURIComponent(r.id)}`;
  if (r.name === 'random') return `#/r/${r.n}/${r.seed}`;
  return '#/';
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    window.location.hash = routeHash(r);
  }, []);
  return [route, go];
}
