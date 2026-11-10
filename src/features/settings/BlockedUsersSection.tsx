import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { SettSection } from '@/components/ui/Settings';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/StatusStates';
import { useStoreEvent } from '@/hooks/useStoreEvent';
import { BLOCK_EVENT, blockStore } from '@/services/blockStore';
import type { BlockedUser } from '@/services/blockStore';
import { haptic } from '@/services/telegram';
import { USE_MOCKS } from '@/api/client';
import { colorForId, initialsOf } from '@/utils/avatar';
import { fmtDate } from '@/utils/datetime';
import { errorMessage } from '@/utils/errors';

/** Settings → Blocked users: the people I blocked, each with Unblock (a block
    is always reversible). The list is refreshed from the server when the
    section opens; the cached copy shows meanwhile. */
export function BlockedUsersSection() {
  const people = useStoreEvent(BLOCK_EVENT, blockStore.entries);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(USE_MOCKS ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // A ref, not `busyId`: taps in the same frame all see the stale state.
  const inflightRef = useRef(new Set<string>());

  const load = useCallback(() => {
    let alive = true;
    setPhase('loading');
    setLoadError(null);
    blockStore.hydrate().then(
      () => { if (alive) setPhase('ready'); },
      (e) => { if (alive) { setLoadError(e); setPhase('error'); } },
    );
    return () => { alive = false; };
  }, []);
  useEffect(() => (USE_MOCKS ? undefined : load()), [load]);

  const unblock = (u: BlockedUser) => {
    if (inflightRef.current.has(u.userId)) return;
    inflightRef.current.add(u.userId);
    setBusyId(u.userId);
    setActionError(null);
    blockStore.remove(u.userId)
      .then(() => haptic('success'), (e) => {
        haptic('error');
        setActionError(`${t('blocks.unblockFailed')} — ${errorMessage(e)}`);
      })
      .finally(() => { inflightRef.current.delete(u.userId); setBusyId(null); });
  };

  return (
    <SettSection title={t('blocks.title')}>
      {phase === 'error' && <ErrorState compact error={loadError} onRetry={load} />}
      {phase === 'loading' && people.length === 0 && <Spinner padding="18px 0" />}
      {phase === 'ready' && people.length === 0 && (
        <EmptyState icon="🚫" title={t('blocks.emptyTitle')} body={t('blocks.emptyBody')} />
      )}
      {people.map((u) => {
        const at = Date.parse(u.blockedAt);
        const busy = busyId === u.userId;
        const name = u.name || t('common.user');
        return (
          <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: `1px solid ${T.border}` }}>
            <div aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
              background: colorForId(u.userId), display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
              {u.photoUrl ? <img src={u.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initialsOf(name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              {at > 0 && <div style={{ fontSize: 11, color: T.muted }}>{t('blocks.since', { date: fmtDate(new Date(at)) })}</div>}
            </div>
            <button onClick={() => unblock(u)} disabled={busy} aria-label={`${t('blocks.unblock')}: ${name}`}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${T.teal}55`, flexShrink: 0,
                background: T.tealDim, color: T.teal, fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
                fontFamily: 'DM Sans,sans-serif', opacity: busy ? 0.6 : 1 }}>
              {busy ? t('blocks.unblocking') : t('blocks.unblock')}
            </button>
          </div>
        );
      })}
      {actionError && (
        <div role="alert" style={{ fontSize: 12.5, color: T.red, padding: '10px 0', textAlign: 'center' }}>{actionError}</div>
      )}
    </SettSection>
  );
}
