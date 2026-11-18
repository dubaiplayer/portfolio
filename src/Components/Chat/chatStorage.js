/**
 * Conversation persistence.
 *
 * sessionStorage rather than localStorage on purpose: a visitor returning next
 * week does not want a month-old transcript reappearing, and session scope
 * sidesteps any consent question entirely.
 *
 * Note the widget never unmounts (it lives outside <Routes>), so this is only
 * needed for full page reloads — not for route changes.
 */

const KEY = 'dgchat:v1:thread';
const MAX_MESSAGES = 40;
const MAX_BYTES = 32 * 1024;

/** Every access is wrapped: Safari private mode throws on setItem, and some
 *  embedded webviews throw on read too. Storage is a convenience, never a
 *  dependency — the widget must work perfectly with all of it failing. */
function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadThread() {
  return safe(() => {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || !Array.isArray(data.messages)) return null;

    const messages = data.messages
      // A reload mid-request leaves a message stuck in 'streaming'. Left alone
      // it renders as a bubble that pulses forever. Drop it if it never got any
      // text, otherwise settle it as done.
      .filter((m) => m.status !== 'streaming' || (m.content && m.content.trim()))
      .map((m) => (m.status === 'streaming' ? { ...m, status: 'done' } : m));

    return { messages, threadId: data.threadId || null };
  }, null);
}

export function saveThread({ messages, threadId }) {
  safe(() => {
    let trimmed = messages.slice(-MAX_MESSAGES);
    let payload = JSON.stringify({ v: 1, threadId, messages: trimmed });

    // Drop from the front until it fits rather than failing the write.
    while (payload.length > MAX_BYTES && trimmed.length > 2) {
      trimmed = trimmed.slice(2);
      payload = JSON.stringify({ v: 1, threadId, messages: trimmed });
    }

    sessionStorage.setItem(KEY, payload);
  });
}

export function clearThread() {
  safe(() => sessionStorage.removeItem(KEY));
}
