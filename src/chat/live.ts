import type { Realtime } from '../realtime/types';
import type { ChatEngine } from './engine';

/** Feed live chat updates into the chat engine; on every (re)connect, catch up on anything missed. */
export function watchChatLive(engine: ChatEngine, rt: Realtime): () => void {
  return rt.watchChat({
    onMessage: (m) => engine.receiveMessage(m),
    onReaction: (r) => engine.receiveReaction(r),
    onRead: (r) => engine.receiveRead(r),
    onConnected: () => void engine.refresh(),
  });
}
