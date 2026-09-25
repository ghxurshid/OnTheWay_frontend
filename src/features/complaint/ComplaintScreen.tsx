import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { COMPLAINT_CATS } from '@/constants/app';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { feedbackApi } from '@/api/feedbackApi';
import { confirmAction } from '@/services/confirm';
import { errorMessage } from '@/utils/errors';

const MAX_DETAIL = 600;

// Map the screen's topic to a backend FeedbackCategory (Suggestion/Complaint/BugReport).
const BACKEND_CATEGORY: Record<string, string> = { app: 'BugReport', other: 'Suggestion' };
const APP_VERSION = '1.0.0';

interface ComplaintScreenProps {
  onClose: () => void;
}

/** Localised label of a complaint category id ('app' → t('complaint.catApp')). */
const catLabel = (id: string): string => t('complaint.cat' + id.charAt(0).toUpperCase() + id.slice(1));

/** Complaint / feedback form with category, subject, detail and a sent state. */
export function ComplaintScreen({ onClose: close }: ComplaintScreenProps) {
  const [cat, setCat] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  // Leaving with unsent text asks first — the draft would be lost.
  const onClose = async () => {
    if (!sent && (subject.trim() || body.trim())) {
      const ok = await confirmAction({ title: t('complaint.discardTitle'), body: t('complaint.discardBody'),
        confirmLabel: t('complaint.discardBtn'), danger: true });
      if (!ok) return;
    }
    close();
  };
  const valid = cat && subject.trim().length >= 3 && body.trim().length >= 10;

  // A ref, not `busy`: taps in the same frame all see the stale state.
  const inflightRef = useRef(false);
  async function submit() {
    if (!valid || inflightRef.current || !cat) return;
    inflightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await feedbackApi.submit({
        category: BACKEND_CATEGORY[cat] || 'Complaint',
        title: subject.trim(),
        description: `[${catLabel(cat)}] ${body.trim()}`,
        appVersion: APP_VERSION,
      });
      setTicket(saved?.id != null ? String(saved.id) : null);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e, 'errors.sendFailed'));
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <FullScreenPanel title={t('complaint.title')} accent={T.amber} onClose={onClose}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '32px', textAlign: 'center', gap: 8 }}>
          <div style={{ width: 76, height: 76, borderRadius: 24, background: T.tealDim,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
            border: `1.5px solid ${T.teal}40` }}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <path d="M10 18.5l5.5 5.5L26 12" stroke={T.teal} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: T.text }}>{t('complaint.sentTitle')}</div>
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, maxWidth: 280 }}>
            {t('complaint.sentBody')}
          </div>
          {ticket && (
            <div style={{ marginTop: 6, fontSize: 12, color: T.muted, padding: '7px 16px',
              borderRadius: 20, border: `1px solid ${T.border}`, background: T.surface2,
              fontVariantNumeric: 'tabular-nums' }}>
              {t('complaint.ticketNo', { id: ticket })}
            </div>
          )}
          <button onClick={onClose} style={{ marginTop: 20, padding: '13px 28px', borderRadius: 13, border: 'none',
            background: TEAL_GRADIENT, color: 'white', fontSize: 14.5,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            boxShadow: `0 4px 18px ${T.tealGlow}` }}>{t('complaint.backToMap')}</button>
        </div>
      </FullScreenPanel>
    );
  }

  const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: .6, display: 'block' };
  const inputStyle: CSSProperties = { width: '100%', background: T.surface2, border: `1px solid ${T.border}`,
    borderRadius: 12, padding: '12px 14px', color: T.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif',
    outline: 'none', resize: 'none' };

  return (
    <FullScreenPanel title={t('complaint.title')} accent={T.amber} onClose={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 28px' }}>
        <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginBottom: 20 }}>
          {t('complaint.intro')}
        </div>

        <div id="complaint-cat" style={labelStyle}>{t('complaint.catType')}</div>
        <div role="group" aria-labelledby="complaint-cat" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {COMPLAINT_CATS.map((c) => {
            const act = cat === c.id;
            return (
              <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={act} style={{ display: 'flex', alignItems: 'center', gap: 9,
                padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                border: `1.5px solid ${act ? T.amber + '70' : T.border}`,
                background: act ? T.amberDim : T.surface2, textAlign: 'left', transition: 'all .15s ease' }}>
                <span style={{ fontSize: 16 }}>{c.icon}</span>
                <span style={{ fontSize: 13, fontWeight: act ? 600 : 500, color: act ? T.amber : T.text }}>{catLabel(c.id)}</span>
              </button>
            );
          })}
        </div>

        <label htmlFor="complaint-subject" style={labelStyle}>{t('complaint.subject')}</label>
        <input id="complaint-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder={t('complaint.subjectPlaceholder')} maxLength={80}
          style={{ ...inputStyle, marginBottom: 20 }} />

        <label htmlFor="complaint-detail" style={labelStyle}>{t('complaint.detail')}</label>
        <textarea id="complaint-detail" aria-describedby="complaint-req" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={MAX_DETAIL}
          placeholder={t('complaint.detailPlaceholder')}
          style={{ ...inputStyle, minHeight: 130, lineHeight: 1.5 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, color: T.muted, marginTop: 6, marginBottom: 18 }}>
          <span id="complaint-req">{t('complaint.requirements')}</span>
          <span style={{ flexShrink: 0 }}>{body.length}/{MAX_DETAIL}</span>
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 12.5, color: T.amber, marginBottom: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button onClick={submit} disabled={!valid || busy} style={{ width: '100%', padding: '15px',
          borderRadius: 14, border: 'none', cursor: (valid && !busy) ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans,sans-serif',
          background: (valid && !busy) ? TEAL_GRADIENT : T.surface2,
          color: (valid && !busy) ? 'white' : T.muted, fontSize: 15, fontWeight: 600,
          boxShadow: (valid && !busy) ? `0 4px 20px ${T.tealGlow}` : 'none', transition: 'all .2s ease' }}>
          {busy ? t('common.sending') : t('common.send')}
        </button>
      </div>
    </FullScreenPanel>
  );
}
