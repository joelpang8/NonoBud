import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Counts seconds of active play: runs only while `running` and the app is visible,
 * so leaving the phone on the table doesn't inflate the time.
 * `catchUp(s)` moves the clock forward to s (the partner's clock in co-op); it never goes back.
 */
export function useActiveTimer(running: boolean, initialSeconds = 0): [number, (s: number) => void] {
  const [seconds, setSeconds] = useState(initialSeconds);
  const base = useRef(initialSeconds);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    const now = () => base.current + (startedAt.current === null ? 0 : (Date.now() - startedAt.current) / 1000);
    const start = () => {
      if (startedAt.current === null && running && document.visibilityState === 'visible') startedAt.current = Date.now();
    };
    const stop = () => {
      if (startedAt.current !== null) {
        base.current = now();
        startedAt.current = null;
      }
      setSeconds(Math.floor(base.current));
    };
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    const id = window.setInterval(() => setSeconds(Math.floor(now())), 500);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, [running]);

  const catchUp = useCallback((s: number) => {
    const current = base.current + (startedAt.current === null ? 0 : (Date.now() - startedAt.current) / 1000);
    if (s <= current) return;
    base.current = s;
    if (startedAt.current !== null) startedAt.current = Date.now();
    setSeconds(Math.floor(s));
  }, []);

  return [seconds, catchUp];
}
