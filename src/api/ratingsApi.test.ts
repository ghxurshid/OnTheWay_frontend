import { describe, it, expect } from 'vitest';
import { toRatingBody, toRatingTags } from './ratingsApi';

describe('rating tags', () => {
  it('maps the summary tag ids to the server whitelist, folding duplicates and dropping unknowns', () => {
    expect(toRatingTags(['tagOnTime', 'tagPolite', 'tagClean', 'tagSafe', 'tagEasy']))
      .toEqual(['on_time', 'polite', 'clean', 'safe', 'easy']);
    expect(toRatingTags(['tagOnTime', 'on_time', 'tagFast', 'polite'])).toEqual(['on_time', 'polite']);
  });

  it('builds the POST /ratings body with string ids and an optional comment', () => {
    expect(toRatingBody({ tripId: '5', rateeId: '9', stars: 5, tags: ['tagSafe'] }))
      .toEqual({ tripId: '5', rateeId: '9', stars: 5, tags: ['safe'] });
    expect(toRatingBody({ tripId: '5', rateeId: '9', stars: 4, comment: '  Great ride ' }))
      .toEqual({ tripId: '5', rateeId: '9', stars: 4, tags: [], comment: 'Great ride' });
  });
});
