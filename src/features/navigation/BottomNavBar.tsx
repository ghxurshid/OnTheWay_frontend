import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { SavedPanel } from '@/features/saved/SavedPanel';
import { HistoryPanel } from '@/features/history/HistoryPanel';
import { SchedulePanel } from '@/features/schedule/SchedulePanel';
import { ContactsPanel } from '@/features/contacts/ContactsPanel';
import { ContactMinimized } from '@/features/contacts/ContactMinimized';
import type { Contact, LatLng, MapTask, PartyType } from '@/models';

type PanelState = 'idle' | 'opening' | 'open' | 'closing';
interface TabDef { id: string; label: string; icon: ((c: string) => ReactNode) | null }

interface BottomNavBarProps {
  onRouteSheet: () => void;
  mode: PartyType;
  routeActive: boolean;
  userLoc: LatLng | null;
  onMapTask?: (task: MapTask) => void;
  hidden?: boolean;
  onContactCall?: (c: Contact) => void;
  onContactSms?: (c: Contact) => void;
  engaged?: boolean;
  onTripCreated?: (trip: unknown) => void;
}

/** Bottom navigation bar + expanding panel host (saved/history/schedule/contacts). */
export function BottomNavBar({ onRouteSheet, mode, routeActive, userLoc, onMapTask, hidden, onContactCall, onContactSms, engaged, onTripCreated }: BottomNavBarProps) {
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [active, setActive] = useState<string | null>(null);
  const [, setNextActive] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearContactFocus = () => {
    setSelectedContact(null);
    onMapTask && onMapTask({ type: 'contactClear' });
  };
  const selectContact = (c: Contact) => {
    setSelectedContact(c);
    onMapTask && onMapTask({ type: 'contactFocus', contact: c });
  };

  const OPEN_DUR = 380;
  const CLOSE_DUR = 280;

  const openPanel = (id: string) => {
    clearTimeout(timerRef.current);
    if (selectedContact) clearContactFocus();
    if (panelState === 'open' || panelState === 'opening') {
      if (active === id) { closePanel(); return; }
      setPanelState('closing');
      setNextActive(id);
      timerRef.current = setTimeout(() => {
        setActive(id);
        setNextActive(null);
        setPanelState('opening');
        timerRef.current = setTimeout(() => setPanelState('open'), OPEN_DUR);
      }, CLOSE_DUR);
      return;
    }
    setActive(id);
    setPanelState('opening');
    timerRef.current = setTimeout(() => setPanelState('open'), OPEN_DUR);
  };

  const closePanel = () => {
    clearTimeout(timerRef.current);
    if (selectedContact) clearContactFocus();
    setPanelState('closing');
    timerRef.current = setTimeout(() => {
      setActive(null);
      setPanelState('idle');
    }, CLOSE_DUR);
  };

  // Once the viewer is engaged the Planned Trips board is hidden (spec §17); if it
  // was open when engagement flips on, close it.
  useEffect(() => {
    if (engaged && active === 'schedule') closePanel();
  }, [engaged, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCenter = () => {
    if (routeActive) return;
    if (panelState !== 'idle') { closePanel(); }
    onRouteSheet();
  };

  const isVisible = panelState !== 'idle';
  const navHidden = panelState !== 'idle';

  const TABS: TabDef[] = [
    { id: 'saved', label: t('nav.saved'),
      icon: (c) => <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 3h10a1 1 0 011 1v13l-6-3-6 3V4a1 1 0 011-1z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      </svg> },
    { id: 'history', label: t('nav.history'),
      icon: (c) => <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke={c} strokeWidth="1.6" />
        <path d="M10 6v4l3 2" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg> },
    { id: 'center', label: t('nav.new'), icon: null },
    { id: 'schedule', label: t('nav.schedule'),
      icon: (c) => <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4" width="14" height="13" rx="2" stroke={c} strokeWidth="1.6" />
        <path d="M7 2v3M13 2v3M3 9h14" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg> },
    { id: 'contacts', label: t('nav.contacts'),
      icon: (c) => <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="7.5" cy="7" r="3" stroke={c} strokeWidth="1.6" />
        <path d="M2.5 16.5c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13.4 5.3a2.6 2.6 0 010 5M14.6 16.5c0-2.4-1.3-4.1-3-4.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg> },
  ];

  const panelTitles: Record<string, string> = {
    saved: t('nav.titleSaved'), history: t('nav.titleHistory'),
    schedule: t('nav.titleSchedule'), contacts: t('nav.titleContacts'),
  };
  const panelMap: Record<string, ReactNode> = {
    saved: <SavedPanel />, history: <HistoryPanel />,
    schedule: <SchedulePanel mode={mode} userLoc={userLoc} onMapTask={onMapTask ?? (() => {})} onTripCreated={onTripCreated} />,
    contacts: <ContactsPanel onSelect={selectContact} />,
  };

  const renderCenterButton = (size: number, fab: boolean) => (
    <button onClick={handleCenter} disabled={routeActive} style={{
      width: size, height: size, borderRadius: '50%',
      background: routeActive ? T.glassMid : `linear-gradient(135deg,${T.teal},#0e9e97)`,
      border: `${fab ? 3 : 2.5}px solid ${fab ? T.glass : T.glassSolid}`,
      cursor: routeActive ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: routeActive ? 'none' : (fab ? `0 0 24px ${T.tealGlow}, 0 4px 12px rgba(0,0,0,.5)` : `0 0 16px ${T.tealGlow}, 0 4px 10px rgba(0,0,0,.4)`),
      transform: fab ? 'translateY(-14px)' : 'none',
      transition: fab ? 'transform .3s cubic-bezier(.34,1.3,.64,1), width .3s, height .3s' : 'transform .2s ease',
      flexShrink: 0, zIndex: 3, position: 'relative',
    }}>
      {routeActive ? (
        <svg width={fab ? 20 : 17} height={fab ? 20 : 17} viewBox="0 0 22 22" fill="none">
          <rect x="5" y="10" width="12" height="9" rx="2" stroke={T.muted} strokeWidth="2" />
          <path d="M8 10 V7 a3 3 0 0 1 6 0 V10" stroke={T.muted} strokeWidth="2" />
        </svg>
      ) : (
        <svg width={fab ? 22 : 18} height={fab ? 22 : 18} viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="9" r="5" stroke="white" strokeWidth="2" />
          <path d="M11 15L11 20" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 20H15" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );

  const renderTab = (tab: TabDef, isPanel: boolean) => {
    const isAct = active === tab.id;
    // Planned Trips ("schedule") is disabled (not removed, so the bar layout is
    // preserved) once the viewer is Engaged (spec §17).
    const disabled = tab.id === 'schedule' && engaged;
    const color = disabled ? T.border : (isAct ? T.teal : T.muted);
    return (
      <button key={tab.id} onClick={disabled ? undefined : () => openPanel(tab.id)}
        disabled={disabled} aria-disabled={disabled} style={{
        flex: 1, background: 'transparent', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: isPanel ? '6px 0' : '10px 0 8px', fontFamily: 'DM Sans,sans-serif',
        color,
        transition: 'color .2s ease, opacity .2s ease',
      }}>
        {tab.icon?.(color)}
        <span style={{ fontSize: 9, fontWeight: isAct ? 600 : 400, letterSpacing: .3 }}>
          {tab.label}
        </span>
        <div style={{ width: isAct ? 16 : 0, height: 2, borderRadius: 1,
          background: T.teal, transition: 'width .25s cubic-bezier(.34,1.3,.64,1)' }} />
      </button>
    );
  };

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      pointerEvents: 'auto', zIndex: 5,
      display: hidden ? 'none' : 'block',
    }}>
      {/* ── Full-width panel ── */}
      {isVisible && (selectedContact ? (
        <ContactMinimized contact={selectedContact} onBack={clearContactFocus}
          onCall={(c) => onContactCall && onContactCall(c)}
          onSms={(c) => onContactSms && onContactSms(c)} />
      ) : (
        <div className="otw-sheet" style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          maxHeight: '760px',
          background: T.glassSolid, backdropFilter: 'blur(28px)',
          borderRadius: '24px 24px 0 0',
          border: `1px solid ${T.border}`,
          borderBottom: 'none',
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom,0px)',
          animation: panelState === 'closing'
            ? `nb-panel-out ${CLOSE_DUR}ms cubic-bezier(.4,0,.6,1) forwards`
            : `nb-panel-in ${OPEN_DUR}ms cubic-bezier(.22,1,.36,1) forwards`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 20px 14px',
            borderBottom: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: T.teal }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
                {active ? panelTitles[active] : ''}
              </span>
            </div>
            <button onClick={closePanel} style={{
              width: 32, height: 32, borderRadius: 10,
              border: `1px solid ${T.border}`, background: T.hover,
              color: T.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background .15s ease',
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {active && panelMap[active]}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '8px 16px 28px',
            borderTop: `1px solid ${T.border}`,
            gap: 4, flexShrink: 0,
          }}>
            {TABS.map((tab) => tab.id === 'center' ? (
              <div key="center" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                {renderCenterButton(46, false)}
              </div>
            ) : renderTab(tab, true))}
          </div>
        </div>
      ))}

      {/* ── Nav bar (hidden when panel open) ── */}
      <div className="otw-navbar" style={{
        margin: '0 16px 20px',
        background: T.glass, backdropFilter: 'blur(20px)',
        borderRadius: 24,
        border: `1px solid ${T.border}`,
        position: 'relative',
        paddingBottom: 4,
        animation: panelState === 'opening'
          ? `nb-bar-out ${CLOSE_DUR}ms cubic-bezier(.4,0,.6,1) forwards`
          : panelState === 'closing'
            ? `nb-bar-in ${OPEN_DUR}ms cubic-bezier(.22,1,.36,1) forwards`
            : 'none',
        opacity: (panelState === 'open') ? 0 : 1,
        visibility: (panelState === 'open') ? 'hidden' : 'visible',
        pointerEvents: navHidden ? 'none' : 'auto',
      }}>
        <svg style={{ position: 'absolute', top: -1, left: 0, width: '100%',
          overflow: 'visible', pointerEvents: 'none', zIndex: 2 }}
          height="36" viewBox="0 0 358 36" preserveAspectRatio="none">
          <defs>
            <linearGradient id="arcGrad2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={T.teal} stopOpacity="0.3" />
              <stop offset="40%" stopColor={T.teal} stopOpacity="0.9" />
              <stop offset="60%" stopColor={T.teal} stopOpacity="0.9" />
              <stop offset="100%" stopColor={T.teal} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <path d="M0,1 L132,1 Q179,-30 226,1 L358,1"
            stroke="url(#arcGrad2)" strokeWidth="1.5" fill="none"
            style={{ filter: `drop-shadow(0 0 5px ${T.teal}88)` }} />
        </svg>

        <div style={{ display: 'flex', alignItems: 'flex-end', paddingTop: 6 }}>
          {TABS.map((tab) => tab.id === 'center' ? (
            <div key="center" style={{ flex: 1, display: 'flex', justifyContent: 'center',
              alignItems: 'flex-end', paddingBottom: 4 }}>
              {renderCenterButton(56, true)}
            </div>
          ) : renderTab(tab, false))}
        </div>
      </div>
    </div>
  );
}
