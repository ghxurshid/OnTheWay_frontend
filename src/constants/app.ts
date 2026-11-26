/* ════════════════════════════════════════════════════════════════
   APP-WIDE STATIC CONSTANTS
   Label keys that get translated at render time via t(...).
   ════════════════════════════════════════════════════════════════ */

// The most upcoming plans one owner may have open (the server's default for
// TripOptions.MaxOpenPlannedPerOwner — the server enforces it; this is only the
// number its refusal is explained with).
export const MAX_OPEN_PLANS = 10;

// How close to a plan's departure, before or after it, going live is travelling
// that plan (the server's default for TripOptions.StartGraceMinutes). The server
// cancels such a plan when a Live trip is created; the app only asks first.
export const START_GRACE_MINUTES = 60;

// Time-of-day presets for the schedule "when" field.
export const TIME_PRESETS = [
  { id: 'morning', s: 7, e: 10 },
  { id: 'noon', s: 11, e: 14 },
  { id: 'evening', s: 17, e: 21 },
];

// Complaint categories (icon + i18n key suffix).
export const COMPLAINT_CATS = [
  { id: 'driver', icon: '🚗' },
  { id: 'passenger', icon: '🧑‍✈️' },
  { id: 'safety', icon: '🛡️' },
  { id: 'payment', icon: '💳' },
  { id: 'app', icon: '🐞' },
  { id: 'other', icon: '💬' },
];

// Quick-reply / auto-reply translation keys used by the chat screen.
export const CHAT_QUICK_KEYS = ['chat.quick1', 'chat.quick2', 'chat.quick3', 'chat.quick4', 'chat.quick5', 'chat.quick6', 'chat.quick7', 'chat.quick8'];
export const CHAT_REPLY_KEYS = ['chat.reply1', 'chat.reply2', 'chat.reply3', 'chat.reply4', 'chat.reply5', 'chat.reply6'];
export const randomChatReplyKey = (): string => CHAT_REPLY_KEYS[Math.floor(Math.random() * CHAT_REPLY_KEYS.length)];

// Privacy policy sections — body text resolved via t('privacy.sNTitle/Body').
export const PRIVACY_SECTION_ICONS = ['📍', '🧭', '🤝', '👥', '🔒', '⚙️'];

// "Me" — the app owner's profile shown on the call screen.
export const ME = { initials: 'AK', name: 'Alisher Karimov', sub: '@alisher_k · Toshkent' };

