import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { useContacts } from '@/hooks/useContacts';
import { groupByPresence, removeContact } from '@/services/contactService';
import { Spinner } from '@/components/ui/Spinner';
import { ContactRow } from './ContactRow';
import type { Contact } from '@/models';

interface ContactsPanelProps {
  onSelect: (c: Contact) => void;
}

/** Contacts list grouped by online/offline presence. */
export function ContactsPanel({ onSelect }: ContactsPanelProps) {
  const { contacts, loading } = useContacts();
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  // Optimistically hide a removed contact; revert if the request fails.
  const handleRemove = (c: Contact) => {
    if (!confirm(t('contacts.confirmRemove'))) return;
    setRemoved((s) => new Set(s).add(c.id));
    removeContact(c.id).catch(() =>
      setRemoved((s) => { const n = new Set(s); n.delete(c.id); return n; }));
  };

  const visible = contacts.filter((c) => !removed.has(c.id));
  const { online, offline } = groupByPresence(visible);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 32px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 42, background: T.surface2, borderRadius: 12,
          border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke={T.muted} strokeWidth="1.5" />
            <path d="M9.5 9.5 L13 13" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 13, color: T.muted }}>{t('contacts.search')}</span>
        </div>
        <button style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          border: `1px solid ${T.teal}45`, background: T.tealDim, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 4v10M4 9h10" stroke={T.teal} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 10,
            textTransform: 'uppercase', letterSpacing: .8, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.green }} />
            {t('contacts.online')} · {online.length}
          </div>
          {online.map((c) => <ContactRow key={c.id} c={c} onSelect={onSelect} onRemove={handleRemove} />)}

          <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, margin: '14px 0 10px',
            textTransform: 'uppercase', letterSpacing: .8, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.muted }} />
            {t('contacts.offline')} · {offline.length}
          </div>
          {offline.map((c) => <ContactRow key={c.id} c={c} onSelect={onSelect} onRemove={handleRemove} />)}
        </>
      )}
    </div>
  );
}
