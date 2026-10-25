import { useSync } from '../sync/SyncProvider';

/** One short line saying whether moves are safely saved. */
export function SyncBadge() {
  const { status, pending, error } = useSync();
  const text =
    status === 'local'
      ? 'Saved on this device'
      : status === 'synced'
        ? 'All saved'
        : status === 'syncing'
          ? 'Saving…'
          : status === 'offline'
            ? pending
              ? "Offline. Your moves are safe and will sync when you're back online."
              : "Offline. You can keep playing; moves sync when you're back online."
            : "Can't sync right now. Your moves are safe on this device and will be sent later.";
  return (
    <p className={`sync-badge ${status}`} role="status" title={error ?? undefined}>
      <i aria-hidden="true" />
      {text}
    </p>
  );
}
