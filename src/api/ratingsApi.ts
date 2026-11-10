/* REPOSITORY — trip ratings (/ratings). After a completed trip the owner and a
   confirmed companion may rate each other once: stars plus optional quick tags
   (a fixed whitelist on the server) and a comment. */

import { USE_MOCKS, mockResponse, send } from './client';
import { idOf } from '@/utils/ids';

/** The tag keys the server accepts (exact spelling). */
export type RatingTag = 'on_time' | 'polite' | 'clean' | 'safe' | 'easy';

/** The trip summary's tag ids (i18n `summary.<id>`) → server tag keys. */
const UI_TAGS: Record<string, RatingTag> = {
  tagOnTime: 'on_time', tagPolite: 'polite', tagClean: 'clean', tagSafe: 'safe', tagEasy: 'easy',
};
const SERVER_TAGS = new Set<string>(Object.values(UI_TAGS));

/** Server tag keys for the given tags — UI ids or server keys alike; unknown
    ones are dropped and duplicates folded (the server rejects both). */
export function toRatingTags(tags: readonly string[] = []): RatingTag[] {
  const out: RatingTag[] = [];
  for (const tag of tags) {
    const key = UI_TAGS[tag] || (SERVER_TAGS.has(tag) ? (tag as RatingTag) : null);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

export interface RatingSubmission {
  tripId: string;
  rateeId: string;
  /** 1–5. */
  stars: number;
  tags?: readonly string[];
  comment?: string | null;
}

/** The POST /ratings body. */
export function toRatingBody({ tripId, rateeId, stars, tags, comment }: RatingSubmission) {
  const text = (comment || '').trim();
  return { tripId: idOf(tripId), rateeId: idOf(rateeId), stars, tags: toRatingTags(tags), ...(text ? { comment: text } : {}) };
}

export const ratingsApi = {
  /** POST /ratings — rate the other party of a completed trip. 409 = already
      rated; 403/404 = not allowed for this trip/person. */
  submit(rating: RatingSubmission): Promise<unknown> {
    const body = toRatingBody(rating);
    if (USE_MOCKS) return mockResponse({ id: 'rt_' + Date.now().toString(36), ...body });
    return send('POST', '/ratings', body);
  },
};
