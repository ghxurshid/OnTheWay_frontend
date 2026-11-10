import { useEffect, useRef, useSyncExternalStore } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { confirmStore } from '@/services/confirm';
import { useBackHandler } from '@/hooks/useBackHandler';

/** Renders the pending confirmAction() question as a modal bottom sheet. */
export function ConfirmHost() {
  const request = useSyncExternalStore(confirmStore.subscribe, confirmStore.get);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useBackHandler(() => confirmStore.settle(false), !!request);
  useEffect(() => { if (request) confirmRef.current?.focus(); }, [request]);
  if (!request) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={() => confirmStore.settle(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={request.body ? 'confirm-body' : undefined}
        className="otw-sheet" style={{ position: 'relative', width: '100%', background: T.surface,
          borderRadius: '22px 22px 0 0', borderTop: `1px solid ${T.border}`,
          padding: '20px 20px calc(24px + env(safe-area-inset-bottom,0px))',
          animation: 'slideUp .25s cubic-bezier(.34,1.2,.64,1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div id="confirm-title" style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{request.title}</div>
        {request.body && <div id="confirm-body" style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>{request.body}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={() => confirmStore.settle(false)} style={{ flex: 1, padding: '13px', borderRadius: 13,
            border: `1px solid ${T.border}`, background: 'transparent', color: T.text, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{request.cancelLabel || t('common.cancel')}</button>
          <button ref={confirmRef} onClick={() => confirmStore.settle(true)} style={{ flex: 1, padding: '13px', borderRadius: 13,
            border: 'none', background: request.danger ? T.red : TEAL_GRADIENT, color: 'white', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>{request.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
