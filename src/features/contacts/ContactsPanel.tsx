import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useContacts } from '@/hooks/useContacts';
import { useUnread } from '@/hooks/useUnread';
import { groupByPresence, removeContact } from '@/services/contactService';
import { confirmAction } from '@/services/confirm';
import { Spinner } from '@/components/ui/Spinner';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState, ErrorState } from '@/components/ui/StatusStates';
import { ContactRow } from './ContactRow';
import { ChatsPanel } from './ChatsPanel';
import type { ChatPeer } from './ChatsPanel';
import type { Contact } from '@/models';

interface ContactsPanelProps {
  onSelect: (c: Contact) => void;
  onOpenChat: (peer: ChatPeer) => void;
}

/** Contacts (grouped by presence, searchable) and the chat inbox. */
export function ContactsPanel({ onSelect, onOpenChat }: ContactsPanelProps) {
  const { contacts, loading, error, reload } = useContacts();
  const unread = useUnread();
  const unreadTotal = Object.values(unread).reduce((a, b) => a + b, 0);
  const [tab, setTab] = useState(unreadTotal > 0 ? 'chats' : 'contacts');
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
      <Segmented value={tab} onChange={setTab} pad={9} style={{ marginBottom: 14, flexShrink: 0 }}
        options={[
          { id: 'contacts', label: t('contacts.tabContacts') },
          { id: 'chats', label: unreadTotal > 0 ? `${t('contacts.tabChats')} · ${unreadTotal}` : t('contacts.tabChats') },
        ]} />
      {tab === 'contacts' ? renderContacts() : <ChatsPanel onOpenChat={onOpenChat} />}
    </div>
  );
}
