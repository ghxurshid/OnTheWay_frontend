import { describe, it, expect } from 'vitest';
import { createPresenceState } from './presenceState';

describe('presence state replay', () => {
  it('replays nothing the app has not decided yet', () => {
    expect(createPresenceState().replay()).toEqual([]);
  });

  it('rebuilds a sharing, banded walker with a route — band before the position', () => {
    const s = createPresenceState();
    s.setMode('driver');
    s.located({ lat: 41.3, lng: 69.2, heading: 90 });
    s.setRoute({ points: [1] });
    s.located({ lat: 41.31, lng: 69.21, heading: null }); // the latest fix wins
    s.setEngaged(true);

    expect(s.replay()).toEqual([
      ['SetRole', 'driver'],
      ['MarkEngaged'],
      ['PublishRoute', { points: [1] }],
      ['UpdateLocation', 41.31, 69.21, null],
    ]);
  });

  it('replays the "off" decisions too — a stop made while offline must still land', () => {
    const s = createPresenceState();
    s.setMode('passenger');
    s.located({ lat: 41.3, lng: 69.2, heading: null });
    s.stopSharing();
    s.setRoute({ points: [1] });
    s.setRoute(null);
    s.setEngaged(false);

    expect(s.replay()).toEqual([
      ['SetRole', 'passenger'],
      ['MarkAvailable'],
      ['ClearRoute'],
      ['StopSharing'],
    ]);
  });

  it('re-follows watched routes and repeats unfollows the server may still remember', () => {
    const s = createPresenceState();
    s.watch('7');
    s.watch('8');
    s.unwatch('8');

    expect(s.replay()).toEqual([['WatchRoute', '7'], ['UnwatchRoute', '8']]);
  });
});
