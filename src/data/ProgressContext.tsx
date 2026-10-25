import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createLocalStore, createMemoryStore } from './local';
import type { ProgressStore, SavedBoard, SolvedRecord } from './types';

type Status = 'loading' | 'ready' | 'unsaved';

interface Progress {
  status: Status;
  boards: ReadonlyMap<string, SavedBoard>;
  solved: ReadonlyMap<string, SolvedRecord>;
  saveBoard: (b: SavedBoard) => void;
  deleteBoard: (puzzleId: string) => void;
  markSolved: (r: SolvedRecord) => void;
  /** Set when a save failed, so the UI can say so. Cleared on the next successful save. */
  saveError: string | null;
}

const Ctx = createContext<Progress | null>(null);

export function ProgressProvider({ children, store: injected }: { children: ReactNode; store?: ProgressStore }) {
  const [store, setStore] = useState<ProgressStore>(() => injected ?? createLocalStore());
  const [status, setStatus] = useState<Status>('loading');
  const [boards, setBoards] = useState<Map<string, SavedBoard>>(new Map());
  const [solved, setSolved] = useState<Map<string, SolvedRecord>>(new Map());
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    store
      .load()
      .then((snap) => {
        if (!live) return;
        setBoards(new Map(snap.boards.map((b) => [b.puzzleId, b])));
        setSolved(new Map(snap.solved.map((r) => [r.puzzleId, r])));
        setStatus('ready');
      })
      .catch(() => {
        // Storage blocked (some private-browsing modes). Keep playing in memory.
        if (!live) return;
        setStore(createMemoryStore());
        setStatus('unsaved');
      });
    return () => {
      live = false;
    };
    // Only on first mount; a fallback store starts empty and needs no load.
  }, []);

  const persist = useCallback(
    (p: Promise<void>) =>
      p.then(
        () => setSaveError(null),
        () => setSaveError("Couldn't save on this device. Your moves are kept while the app stays open."),
      ),
    [],
  );

  const saveBoard = useCallback(
    (b: SavedBoard) => {
      setBoards((m) => new Map(m).set(b.puzzleId, b));
      persist(store.saveBoard(b));
    },
    [store, persist],
  );

  const deleteBoard = useCallback(
    (id: string) => {
      setBoards((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
      persist(store.deleteBoard(id));
    },
    [store, persist],
  );

  const markSolved = useCallback(
    (r: SolvedRecord) => {
      setSolved((m) => new Map(m).set(r.puzzleId, r));
      persist(store.saveSolved(r));
    },
    [store, persist],
  );

  const value = useMemo(
    () => ({ status, boards, solved, saveBoard, deleteBoard, markSolved, saveError }),
    [status, boards, solved, saveBoard, deleteBoard, markSolved, saveError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): Progress {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProgress must be used inside <ProgressProvider>');
  return v;
}
