import { useState } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { COMPLAINT_CATS } from '@/constants/app';
import { FullScreenPanel } from '@/components/ui/FullScreenPanel';
import { feedbackApi } from '@/api/feedbackApi';

// Map the screen's topic to a backend FeedbackCategory (Suggestion/Complaint/BugReport).
const BACKEND_CATEGORY = { app: 'BugReport', other: 'Suggestion' };
const APP_VERSION = '1.0.0';

/** Complaint / feedback form with category, subject, detail and a sent state. */
export function ComplaintScreen({ onClose }) {
  const [cat, setCat] = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const valid = cat && subject.trim().length >= 3 && body.trim().length >= 10;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const topicLabel = t('complaint.cat' + cat.charAt(0).toUpperCase() + cat.slice(1));
      await feedbackApi.submit({
        category: BACKEND_CATEGORY[cat] || 'Complaint',
        title: subject.trim(),
        description: `[${topicLabel}] ${body.trim()}`,
        appVersion: APP_VERSION,
      });
      setSent(true);
    } catch (e) {
      setError(e?.message || t('common.error'));
    } finally {
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
          <div style={{ marginTop: 6, fontSize: 12, color: T.muted, padding: '7px 16px',
            borderRadius: 20, border: `1px solid ${T.border}`, background: T.surface2,
            fontVariantNumeric: 'tabular-nums' }}>
            {t('complaint.ticketNo', { id: Math.floor(100000 + Math.random() * 900000) })}
          </div>
          <button onClick={onClose} style={{ marginTop: 20, padding: '13px 28px', borderRadius: 13, border: 'none',
            background: `linear-gradient(135deg,${T.teal},#0e9e97)`, color: 'white', fontSize: 14.5,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
            boxShadow: `0 4px 18px ${T.tealGlow}` }}>{t('complaint.backToMap')}</button>
        </div>
      </FullScreenPanel>
    );
  }

  const labelStyle = { fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: .6, display: 'block' };
  const inputStyle = { width: '100%', background: T.surface2, border: `1px solid ${T.border}`,
    borderRadius: 12, padding: '12px 14px', color: T.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif',
    outline: 'none', resize: 'none' };

  return (
    <FullScreenPanel title={t('complaint.title')} accent={T.amber} onClose={onClose}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 28px' }}>
        <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginBottom: 20 }}>
          {t('complaint.intro')}
        </div>

        <label style={labelStyle}>{t('complaint.catType')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {COMPLAINT_CATS.map((c) => {
            const act = cat === c.id;
            return (
              <button key={c.id} onClick={() => setCat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 9,
                padding: '11px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                border: `1.5px solid ${act ? T.amber + '70' : T.border}`,
                background: act ? T.amberDim : T.surface2, textAlign: 'left', transition: 'all .15s ease' }}>
                <span style={{ fontSize: 16 }}>{c.icon}</span>
                <span style={{ fontSize: 13, fontWeight: act ? 600 : 500, color: act ? T.amber : T.text }}>{t('complaint.cat' + c.id.charAt(0).toUpperCase() + c.id.slice(1))}</span>
              </button>
            );
          })}
        </div>

        <label style={labelStyle}>{t('complaint.subject')}</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder={t('complaint.subjectPlaceholder')} maxLength={80}
          style={{ ...inputStyle, marginBottom: 20 }} />

        <label style={labelStyle}>{t('complaint.detail')}</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
          placeholder={t('complaint.detailPlaceholder')}
          style={{ ...inputStyle, minHeight: 130, lineHeight: 1.5 }} />
        <div style={{ textAlign: 'right', fontSize: 11, color: T.muted, marginTop: 6, marginBottom: 18 }}>
          {body.length}/600
        </div>

        <button disabled className="att-btn" style={{ width: '100%', padding: '12px', borderRadius: 12,
          border: `1px dashed ${T.border}`, background: 'transparent', color: T.muted, fontSize: 13,
          cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {t('complaint.attach')}
        </button>

        {error && (
          <div style={{ fontSize: 12.5, color: T.amber, marginBottom: 12, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button onClick={submit} disabled={!valid || busy} style={{ width: '100%', padding: '15px',
          borderRadius: 14, border: 'none', cursor: (valid && !busy) ? 'pointer' : 'not-allowed', fontFamily: 'DM Sans,sans-serif',
          background: (valid && !busy) ? `linear-gradient(135deg,${T.teal},#0e9e97)` : T.surface2,
          color: (valid && !busy) ? 'white' : T.muted, fontSize: 15, fontWeight: 600,
          boxShadow: (valid && !busy) ? `0 4px 20px ${T.tealGlow}` : 'none', transition: 'all .2s ease' }}>
          {busy ? t('common.sending') : t('common.send')}
        </button>
      </div>
    </FullScreenPanel>
  );
}
