import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProgressStore, SavedBoard, Snapshot, SolvedRecord } from './types';

interface Schema extends DBSchema {
  boards: { key: string; value: SavedBoard };
  solved: { key: string; value: SolvedRecord };
}

const DB_NAME = 'cellmates';
const DB_VERSION = 1;

/** Progress stored on this device in IndexedDB (survives reloads and app restarts). */
export function createLocalStore(name = DB_NAME): ProgressStore {
  let db: Promise<IDBPDatabase<Schema>> | null = null;
  const open = () =>
    (db ??= openDB<Schema>(name, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore('boards', { keyPath: 'puzzleId' });
        d.createObjectStore('solved', { keyPath: 'puzzleId' });
      },
    }));

  return {
    async load(): Promise<Snapshot> {
      const d = await open();
      const [boards, solved] = await Promise.all([d.getAll('boards'), d.getAll('solved')]);
      return { boards, solved };
    },
    async saveBoard(b) {
      await (await open()).put('boards', b);
    },
    async deleteBoard(id) {
      await (await open()).delete('boards', id);
    },
    async saveSolved(r) {
      await (await open()).put('solved', r);
    },
  };
}

/** Fallback when the browser blocks storage: the app works, but nothing survives a reload. */
export function createMemoryStore(): ProgressStore {
  const boards = new Map<string, SavedBoard>();
  const solved = new Map<string, SolvedRecord>();
  return {
    async load() {
      return { boards: [...boards.values()], solved: [...solved.values()] };
    },
    async saveBoard(b) {
      boards.set(b.puzzleId, b);
    },
    async deleteBoard(id) {
      boards.delete(id);
    },
    async saveSolved(r) {
      solved.set(r.puzzleId, r);
    },
  };
}
