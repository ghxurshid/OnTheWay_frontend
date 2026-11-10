import { useEffect, useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useContacts } from '@/hooks/useContacts';
import { useSaved } from '@/hooks/useSaved';
import { partyColor } from '@/constants/theme';
import { useStoreEvent } from '@/hooks/useStoreEvent';
import { BLOCK_EVENT, blockStore } from '@/services/blockStore';
import { groupByPresence, removeContact, unavailablePeople } from '@/services/contactService';
import { idOf } from '@/utils/ids';
import { confirmAction } from '@/services/confirm';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorState } from '@/components/ui/StatusStates';
import { ContactRow } from './ContactRow';
import type { ChatPeer } from './ChatsPanel';
import type { Contact } from '@/models';

interface ContactsPanelProps {
  onSelect: (c: Contact) => void;
  onOpenChat: (peer: ChatPeer) => void;
}

/** Favourites (★ saved companions) on top, then contacts grouped by presence
    and searchable. The chat inbox has its own bottom-bar tab. */
export function ContactsPanel({ onSelect, onOpenChat }: ContactsPanelProps) {
  const { contacts, loading, error, reload } = useContacts();
  const partners = useSaved().filter((p) => p.type === 'partner' && p.userId);
  // Hidden, never deleted (they come back after an unblock): people I blocked,
  // and — checked when the panel opens — people the server no longer shows me
  // (they blocked me). Offline they stay listed.
  const blocked = useStoreEvent(BLOCK_EVENT, blockStore.list);
  const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());
  const partnerIds = partners.map((p) => idOf(p.userId)).join(',');
  const blockedIds = blocked.join(',');
  useEffect(() => {
    let alive = true;
    if (!partnerIds) return undefined;
    unavailablePeople(partnerIds.split(','))
      .then((gone) => { if (alive) setUnavailable(gone); })
      .catch(() => { /* keep them listed */ });
    return () => { alive = false; };
  }, [partnerIds, blockedIds]);
  const favourites = partners.filter((p) => !blocked.includes(idOf(p.userId)) && !unavailable.has(idOf(p.userId)));
  const [query, setQuery] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [removeError, setRemoveError] = useState(false);

  // Optimistically hide a removed contact; bring it back and say so on failure.
  const handleRemove = async (c: Contact) => {
    const ok = await confirmAction({
      title: t('contacts.confirmRemove'), body: c.name,
      confirmLabel: t('common.remove'), danger: true,
    });
    if (!ok) return;
    setRemoveError(false);
    setRemoved((s) => new Set(s).add(c.id));
    removeContact(c.id).catch(() => {
      setRemoved((s) => { const n = new Set(s); n.delete(c.id); return n; });
      setRemoveError(true);
    });
  };

  const q = query.trim().toLowerCase();
  const visible = contacts.filter((c) => !removed.has(c.id) && (!q || c.name.toLowerCase().includes(q)));
  const { online, offline } = groupByPresence(visible);
  const section = (label: string, dot: string, n: number) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, margin: '14px 0 10px',
      textTransform: 'uppercase', letterSpacing: .8, display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: dot }} />
      {label} · {n}
    </div>
  );

  const renderContacts = () => {
    if (loading) return <Spinner label={null} />;
    if (error) return <ErrorState error={error} onRetry={reload} />;
    if (contacts.length === 0) {
      return <EmptyState icon="👥" title={t('contacts.emptyTitle')} body={t('contacts.emptyBody')} />;
    }
    return (
      <>
        <label htmlFor="contact-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {t('contacts.search')}
        </label>
        <div style={{ height: 42, background: T.surface2, borderRadius: 12,
          border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" stroke={T.muted} strokeWidth="1.5" />
            <path d="M9.5 9.5 L13 13" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input id="contact-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('contacts.search')}
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: T.text,
              fontSize: 13, fontFamily: 'DM Sans,sans-serif' }} />
        </div>
        {removeError && (
          <div role="alert" style={{ marginTop: 10, fontSize: 12.5, color: T.red }}>{t('contacts.removeFailed')}</div>
        )}
        {visible.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.muted, fontSize: 13, padding: '24px 0' }}>{t('contacts.noResults')}</div>
        ) : (
          <>
            {online.length > 0 && section(t('contacts.online'), T.green, online.length)}
            {online.map((c) => <ContactRow key={c.id} c={c} onSelect={onSelect} onRemove={handleRemove} />)}
            {offline.length > 0 && section(t('contacts.offline'), T.muted, offline.length)}
            {offline.map((c) => <ContactRow key={c.id} c={c} onSelect={onSelect} onRemove={handleRemove} />)}
          </>
        )}
      </>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column' }}>
      {favourites.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: .8 }}>
            ★ {t('contacts.favourites')} · {favourites.length}
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {favourites.map((p) => {
              const color = partyColor(p.partyType);
              return (
                <button key={p.id} onClick={() => onOpenChat({ id: p.userId!, name: p.label, initials: p.initials || '?', type: p.partyType || 'passenger' })}
                  aria-label={`${p.label} · ${t('saved.openChat')}`}
                  style={{ flexShrink: 0, width: 84, minHeight: 92, padding: '10px 6px', borderRadius: 14, border: `1px solid ${T.border}`,
                    background: T.surface2, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    fontFamily: 'DM Sans,sans-serif' }}>
                  <span style={{ width: 42, height: 42, borderRadius: 13, background: `${color}22`, border: `1.5px solid ${color}55`,
                    color, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.initials || '?'}</span>
                  <span style={{ fontSize: 12, color: T.text, fontWeight: 600, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {renderContacts()}
    </div>
  );
}
