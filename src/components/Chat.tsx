import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuth } from '../auth/AuthGate';
import { useChat, useChatEngine } from '../chat/ChatProvider';
import { MAX_LENGTH } from '../chat/engine';
import { REACTIONS, type ChatMessage } from '../chat/types';
import type { Player, Puzzle } from '../game';
import type { Route } from '../hooks/useHashRoute';
import { feel } from '../lib/feedback';
import { other, PLAYER_NAMES } from '../lib/players';
import { puzzleRoute } from '../lib/routes';
import { findPuzzle } from '../puzzles/library';
import { useLive } from '../realtime/LiveProvider';
import { useSync } from '../sync/SyncProvider';

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
const PREVIEW_MS = 4500;
const TYPING_EVERY_MS = 2000;

function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return DAY.format(d);
}

function BubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/** The chat button (with unread badge and a preview of new messages) and the chat panel. */
export function Chat({ puzzle, go }: { puzzle: Puzzle | null; go: (r: Route) => void }) {
  const auth = useAuth();
  const engine = useChatEngine();
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ChatMessage | null>(null);
  const me: Player | null = auth.mode === 'cloud' ? auth.player : null;

  // A short preview (and a buzz) when the other person writes while the chat is closed.
  // The newest message when the chat first loaded (or '' if there were none) doesn't pop up.
  const lastSeen = useRef<string | null>(null);
  const latest = chat.messages[chat.messages.length - 1];
  useEffect(() => {
    if (!engine || me === null) return;
    if (lastSeen.current === null) {
      lastSeen.current = latest?.id ?? '';
      return;
    }
    if (!latest || latest.id === lastSeen.current) return;
    lastSeen.current = latest.id;
    if (open || latest.author === me || latest.pending) return;
    feel('message');
    setPreview(latest);
    const id = window.setTimeout(() => setPreview(null), PREVIEW_MS);
    return () => window.clearTimeout(id);
  }, [engine, latest, open, me]);

  if (!engine || me === null) return null;
  const partner = PLAYER_NAMES[other(me)];

  return (
    <>
      {preview && !open && (
        <button type="button" className="chat-preview" onClick={() => (setPreview(null), setOpen(true))}>
          <b>{PLAYER_NAMES[preview.author]}:</b> {preview.body.length > 80 ? preview.body.slice(0, 80) + '…' : preview.body}
        </button>
      )}
      {!open && (
        <button
          type="button"
          className="chat-fab"
          onClick={() => setOpen(true)}
          aria-label={chat.unread ? `Chat with ${partner}, ${chat.unread} unread` : `Chat with ${partner}`}
        >
          <BubbleIcon />
          {chat.unread > 0 && <span className="badge">{chat.unread > 9 ? '9+' : chat.unread}</span>}
        </button>
      )}
      {open && <ChatPanel me={me} puzzle={puzzle} go={go} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatPanel({ me, puzzle, go, onClose }: { me: Player; puzzle: Puzzle | null; go: (r: Route) => void; onClose: () => void }) {
  const engine = useChatEngine()!;
  const chat = useChat();
  const { typing } = useLive();
  const { solved } = useSync();
  const [text, setText] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);
  const partner = other(me);

  // Escape closes; the message box gets focus when the panel opens.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Stay scrolled to the newest message unless you've scrolled up to read older ones.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.partnerTyping]);

  // Everything on screen counts as read.
  const newest = chat.messages[chat.messages.length - 1]?.createdAt ?? 0;
  useEffect(() => {
    if (newest && stick.current && document.visibilityState === 'visible') engine.markRead(newest);
  }, [engine, newest]);

  const onScroll = () => {
    const el = listRef.current!;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (stick.current && newest) engine.markRead(newest);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!engine.send(text, puzzle ? { id: puzzle.id, n: puzzle.n, seed: puzzle.seed } : null)) return;
    setText('');
    stick.current = true;
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v.trim() && now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      typing();
    }
  };

  // My newest delivered message that the other person has seen.
  const theirRead = chat.reads.get(partner) ?? 0;
  const seenId = useMemo(() => {
    const mine = chat.messages.filter((m) => m.author === me && !m.pending);
    const last = mine[mine.length - 1];
    return last && last.createdAt <= theirRead ? last.id : null;
  }, [chat.messages, me, theirRead]);

  const puzzleLabel = (m: ChatMessage) => {
    if (!m.puzzleId || !m.puzzleN) return null;
    const lib = findPuzzle(m.puzzleId);
    const name = m.puzzleSeed !== null ? `random ${m.puzzleN}×${m.puzzleN}` : lib && solved.has(lib.id) ? lib.name : `${m.puzzleN}×${m.puzzleN} puzzle`;
    return name;
  };

  let lastDay = '';
  return (
    <div className="chat-sheet" role="dialog" aria-modal="false" aria-labelledby="chat-title">
      <div className="chat-head">
        <h2 id="chat-title">
          <i style={{ background: `var(--p${partner})` }} aria-hidden="true" />
          {PLAYER_NAMES[partner]}
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="chat-list" ref={listRef} onScroll={onScroll} aria-live="polite" aria-relevant="additions">
        {chat.messages.length === 0 && (
          <p className="chat-empty">
            Say hi to {PLAYER_NAMES[partner]}. Messages here are just between the two of you.
          </p>
        )}
        {chat.messages.map((m) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.author === me;
          const reacts = chat.reactions.get(m.id);
          const label = puzzleLabel(m);
          return (
            <div key={m.id}>
              {showDay && <p className="chat-day">{day}</p>}
              <div className={mine ? 'msg mine' : 'msg theirs'}>
                <button
                  type="button"
                  className={`bubble p${m.author}`}
                  onClick={() => setPicking(picking === m.id ? null : m.id)}
                  aria-label={`${PLAYER_NAMES[m.author]} at ${TIME.format(m.createdAt)}: ${m.body}. Tap to react.`}
                  aria-expanded={picking === m.id}
                >
                  {m.body}
                </button>
                {picking === m.id && (
                  <div className="react-pick" role="group" aria-label="React">
                    {REACTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={reacts?.get(me) === r}
                        onClick={() => {
                          engine.react(m.id, r);
                          setPicking(null);
                        }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                {reacts && reacts.size > 0 && (
                  <div className="reacts">
                    {[...reacts.entries()].map(([p, r]) => (
                      <span key={p} title={`${PLAYER_NAMES[p]} reacted ${r}`} className={p === me ? 'mine' : undefined}>
                        {r}
                      </span>
                    ))}
                  </div>
                )}
                <div className="meta">
                  {label && (
                    <button
                      type="button"
                      className="puzzle-tag"
                      onClick={() => {
                        go(puzzleRoute({ puzzleId: m.puzzleId!, n: m.puzzleN!, seed: m.puzzleSeed ?? undefined }));
                        onClose();
                      }}
                    >
                      🧩 {label}
                    </button>
                  )}
                  <span>{m.pending ? 'Sending…' : TIME.format(m.createdAt)}</span>
                  {m.id === seenId && <span>· Seen</span>}
                </div>
              </div>
            </div>
          );
        })}
        {chat.partnerTyping && (
          <p className="chat-typing" aria-live="polite">
            {PLAYER_NAMES[partner]} is typing…
          </p>
        )}
      </div>

      <form className="chat-compose" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={MAX_LENGTH}
          placeholder={`Message ${PLAYER_NAMES[partner]}`}
          aria-label={`Message ${PLAYER_NAMES[partner]}`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="send"
        />
        <button type="submit" className="pri-btn" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
