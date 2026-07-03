import { Fragment, useState, useRef, useEffect } from 'react';
import { T } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { geocode, reverseGeocode } from '@/services/geocodingService';
import { getRoute } from '@/services/routeService';

/** Multi-waypoint route planner sheet: input → calculate → choose route. */
export function RouteSheet({ onClose, onShowRoute, mapHook, userLoc, onPickModeChange }) {
  const [waypoints, setWaypoints] = useState([
    { value: '', latlng: userLoc || TASHKENT, placeholder: t('route.startPlaceholder') },
    { value: '', latlng: null, placeholder: t('route.where') },
  ]);
  const [activeIdx, setActiveIdx] = useState(1);
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState('input');
  const [routeOptions, setRouteOptions] = useState([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [pickingIdx, setPickingIdx] = useState(null);
  const [pickAddr, setPickAddr] = useState('');
  const [pickLoading, setPickLoading] = useState(false);
  const debounceRef = useRef(null);
  const pickCenterRef = useRef(null);
  const moveCleanupRef = useRef(null);
  const revDebRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const loc = userLoc || TASHKENT;
      const label = await reverseGeocode(loc);
      if (alive) setWaypoints((wp) => wp.map((w, i) => (i === 0 ? { ...w, value: label, latlng: loc } : w)));
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (moveCleanupRef.current) moveCleanupRef.current();
    clearTimeout(revDebRef.current);
  }, []);

  const refreshPickAddr = () => {
    const c = mapHook.getCenter(); if (!c) return;
    pickCenterRef.current = c;
    setPickLoading(true);
    clearTimeout(revDebRef.current);
    revDebRef.current = setTimeout(async () => {
      const here = mapHook.getCenter() || c;
      const label = await reverseGeocode(here);
      pickCenterRef.current = here;
      setPickAddr(label);
      setPickLoading(false);
    }, 400);
  };

  const enterMapPick = (idx) => {
    setSuggestions([]);
    setActiveIdx(idx);
    setPickingIdx(idx);
    onPickModeChange && onPickModeChange(true);
    const wp = waypoints[idx];
    const hasLoc = wp && wp.latlng;
    if (hasLoc) mapHook.flyTo(wp.latlng, 16);
    setPickAddr('');
    setPickLoading(true);
    setTimeout(() => {
      if (moveCleanupRef.current) moveCleanupRef.current();
      const c1 = mapHook.onMove(() => setPickLoading(true));
      const c2 = mapHook.onMoveEnd(() => refreshPickAddr());
      moveCleanupRef.current = () => { c1 && c1(); c2 && c2(); };
      refreshPickAddr();
    }, hasLoc ? 850 : 60);
  };

  const exitMapPick = () => {
    if (moveCleanupRef.current) { moveCleanupRef.current(); moveCleanupRef.current = null; }
    clearTimeout(revDebRef.current);
    setPickingIdx(null);
    setPickAddr('');
    setPickLoading(false);
    onPickModeChange && onPickModeChange(false);
  };

  const confirmPick = () => {
    const idx = pickingIdx;
    const c = pickCenterRef.current || mapHook.getCenter();
    if (idx !== null && c) {
      const label = pickAddr || `${c[0].toFixed(4)}, ${c[1].toFixed(4)}`;
      setWaypoints((wp) => {
        const next = wp.map((w, i) => (i === idx ? { ...w, value: label, latlng: c } : w));
        mapHook.setWaypointMarkers(next.filter((w) => w.latlng));
        return next;
      });
    }
    exitMapPick();
  };

  const handleInput = (idx, val) => {
    setWaypoints((wp) => wp.map((w, i) => (i === idx ? { ...w, value: val, latlng: null } : w)));
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res = await geocode(val);
      setSuggestions(res.slice(0, 5));
      setSearching(false);
    }, 400);
  };

  const handleSuggest = (s) => {
    const latlng = [parseFloat(s.lat), parseFloat(s.lon)];
    const label = s.display_name.split(',').slice(0, 2).join(', ');
    setWaypoints((wp) => wp.map((w, i) => (i === activeIdx ? { ...w, value: label, latlng } : w)));
    setSuggestions([]);
    mapHook.flyTo(latlng, 15);
    mapHook.setWaypointMarkers(waypoints.map((w, i) => (i === activeIdx ? { ...w, value: label, latlng } : w)));
  };

  const addWaypoint = () => {
    setWaypoints((wp) => [...wp.slice(0, -1), { value: '', latlng: null, placeholder: t('route.midPoint') }, wp[wp.length - 1]]);
  };

  const calcRoute = async () => {
    setStep('calculating');
    setSuggestions([]);
    const pts = waypoints.filter((w) => w.latlng);
    if (pts.length >= 2) {
      const routes = await getRoute(pts.map((w) => w.latlng));
      setRouteOptions(routes);
      setSelectedRouteIdx(0);
      mapHook.setWaypointMarkers(pts);
      if (routes.length > 0) mapHook.setRouteLines(routes, 0);
    }
    setStep('routes');
  };

  const pickRouteOption = (idx) => {
    setSelectedRouteIdx(idx);
    mapHook.setRouteLines(routeOptions, idx);
  };

  const startSelectedRoute = () => {
    // Pass the picked waypoints too so the app can persist the journey (origin/
    // destination labels + coords) as a Live trip, not just draw it.
    if (routeOptions[selectedRouteIdx]) {
      onShowRoute(routeOptions[selectedRouteIdx], waypoints.filter((w) => w.latlng));
    }
  };

  const canCalc = waypoints.every((w) => w.latlng);
  const picking = pickingIdx !== null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: (picking || step === 'routes') ? 'none' : 'auto' }}>
      {!picking && step !== 'routes' && (
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      )}

      {picking && (
        <>
          <div style={{ position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
            background: T.glass2, backdropFilter: 'blur(12px)',
            borderRadius: 20, padding: '7px 16px', border: `1px solid ${T.teal}40`,
            pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>
              {pickingIdx === 0 ? t('route.pickStart') : pickingIdx === waypoints.length - 1 ? t('route.pickDest') : t('route.pickMid')} — {t('route.dragMap')}
            </span>
          </div>

          <div style={{ position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%,-100%)', pointerEvents: 'none', zIndex: 5,
            display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ maxWidth: 230, background: T.glass2, backdropFilter: 'blur(12px)',
              borderRadius: 12, padding: '8px 12px', marginBottom: 8,
              border: `1px solid ${T.border}`, boxShadow: '0 6px 20px rgba(0,0,0,.5)' }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 600, textAlign: 'center',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pickLoading ? t('route.detecting') : (pickAddr || t('route.pickPlace'))}
              </div>
            </div>
            <svg width="34" height="42" viewBox="0 0 34 42" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.5))' }}>
              <path d="M17 1C8.7 1 2 7.7 2 16c0 10.5 15 25 15 25s15-14.5 15-25C32 7.7 25.3 1 17 1z"
                fill={T.teal} stroke="#fff" strokeWidth="2" />
              <circle cx="17" cy="16" r="5.5" fill="#fff" />
            </svg>
          </div>
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            width: 8, height: 8, borderRadius: 4, background: 'rgba(0,0,0,.4)',
            border: '1px solid rgba(255,255,255,.5)', pointerEvents: 'none', zIndex: 4 }} />

          <div className="otw-sheet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0,
            background: T.surface, borderRadius: '20px 20px 0 0',
            padding: '16px 20px calc(28px + env(safe-area-inset-bottom,0px))', borderTop: `1px solid ${T.border}`,
            pointerEvents: 'auto', zIndex: 6,
            animation: 'slideUp .3s cubic-bezier(.34,1.2,.64,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: T.tealDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📍</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T.muted }}>{t('route.pickedAddr')}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pickLoading ? t('route.detecting') : (pickAddr || t('route.dragMapShort'))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={exitMapPick}
                style={{ padding: '13px 18px', borderRadius: 13, border: `1px solid ${T.border}`,
                  background: 'transparent', color: T.muted, fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
                {t('common.cancel')}
              </button>
              <button onClick={confirmPick} disabled={pickLoading || !pickAddr}
                style={{ flex: 1, padding: '13px', borderRadius: 13, border: 'none',
                  background: (pickLoading || !pickAddr) ? T.surface2 : `linear-gradient(135deg,${T.teal},#0e9e97)`,
                  color: (pickLoading || !pickAddr) ? T.muted : 'white', fontSize: 15, fontWeight: 600,
                  cursor: (pickLoading || !pickAddr) ? 'not-allowed' : 'pointer',
                  boxShadow: (pickLoading || !pickAddr) ? 'none' : `0 4px 18px ${T.tealGlow}`,
                  fontFamily: 'DM Sans,sans-serif', transition: 'all .2s ease' }}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </>
      )}

      {!picking && (
        <div className="otw-sheet" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, pointerEvents: 'auto',
          background: T.surface, borderRadius: '24px 24px 0 0',
          animation: 'slideUp .35s cubic-bezier(.34,1.2,.64,1)',
          maxHeight: '82%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>

          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: '12px auto 0' }} />

          <div style={{ padding: '14px 20px 12px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10,
              border: `1px solid ${T.border}`, background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7 H11 M7 3 L3 7 L7 11" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{t('route.title')}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{t('route.subtitle')}</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {step === 'input' && <>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: T.teal,
                    border: `2px solid ${T.surface}`, boxShadow: `0 0 0 2px ${T.teal}` }} />
                  {waypoints.slice(0, -1).map((_, i) => (
                    <Fragment key={i}>
                      <div style={{ width: 2, flex: 1, minHeight: 28,
                        background: `linear-gradient(to bottom,${T.teal},${T.muted}40)` }} />
                      {i < waypoints.length - 2 &&
                        <div style={{ width: 8, height: 8, borderRadius: 4, background: T.teal + '80' }} />}
                    </Fragment>
                  ))}
                  <div style={{ width: 2, flex: 1, minHeight: 28, background: `${T.muted}40` }} />
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: T.red,
                    border: `2px solid ${T.surface}`, boxShadow: `0 0 0 2px ${T.red}` }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {waypoints.map((wp, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <input value={wp.value}
                        placeholder={wp.placeholder}
                        onChange={(e) => handleInput(idx, e.target.value)}
                        onFocus={() => { setActiveIdx(idx); setSuggestions([]); }}
                        style={{ width: '100%', padding: '12px 68px 12px 14px', borderRadius: 12,
                          background: activeIdx === idx ? T.surface2 : T.bg,
                          border: `1.5px solid ${activeIdx === idx ? T.teal + '60' : T.border}`,
                          color: T.text, fontSize: 14, outline: 'none',
                          transition: 'all .2s ease', fontFamily: 'DM Sans,sans-serif' }} />
                      {wp.value && (
                        <button onClick={() => handleInput(idx, '')}
                          style={{ position: 'absolute', right: 36, top: '50%', transform: 'translateY(-50%)',
                            background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', padding: 4, fontSize: 13 }}>
                          ✕
                        </button>
                      )}
                      <button onClick={() => enterMapPick(idx)}
                        title={t('form.pickOnMap')}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          width: 24, height: 24, borderRadius: 7, border: 'none', cursor: 'pointer',
                          background: T.surface2,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background .15s ease' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <circle cx="6" cy="5" r="3" stroke={T.muted} strokeWidth="1.4" />
                          <path d="M6 9 L6 11" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M6 1 L6 2" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M1 5 L2 5" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round" />
                          <path d="M10 5 L11 5" stroke={T.muted} strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={addWaypoint}
                style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 12,
                  background: 'transparent', border: `1px dashed ${T.border}`,
                  color: T.muted, fontSize: 13, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'DM Sans,sans-serif' }}>
                <span style={{ fontSize: 16 }}>+</span> {t('route.addMidPoint')}
              </button>

              {searching && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${T.tealDim}`,
                    borderTop: `2px solid ${T.teal}`, animation: 'spin .7s linear infinite' }} />
                  <span style={{ fontSize: 12, color: T.muted }}>{t('form.searching')}</span>
                </div>
              )}
              {suggestions.length > 0 && (
                <div style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => handleSuggest(s)}
                      style={{ width: '100%', padding: '11px 14px',
                        background: i % 2 === 0 ? T.surface2 : T.surface,
                        border: 'none', borderBottom: i < suggestions.length - 1 ? `1px solid ${T.border}` : 'none',
                        color: T.text, fontSize: 13, textAlign: 'left', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'DM Sans,sans-serif' }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="7" cy="6" r="3" stroke={T.muted} strokeWidth="1.5" />
                        <path d="M7 10 L7 13" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.display_name.split(',').slice(0, 3).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <button onClick={calcRoute} disabled={!canCalc}
                style={{ width: '100%', marginTop: 14, padding: '15px', borderRadius: 14,
                  background: canCalc ? `linear-gradient(135deg,${T.teal},#0e9e97)` : T.surface2,
                  border: 'none', color: canCalc ? 'white' : T.muted,
                  fontSize: 15, fontWeight: 600, cursor: canCalc ? 'pointer' : 'not-allowed',
                  boxShadow: canCalc ? `0 4px 20px ${T.tealGlow}` : 'none',
                  transition: 'all .2s ease', fontFamily: 'DM Sans,sans-serif' }}>
                {t('route.show')}
              </button>
            </>}

            {step === 'calculating' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 16, padding: '40px 0' }}>
                <div style={{ width: 48, height: 48, borderRadius: 24,
                  border: `3px solid ${T.tealDim}`, borderTop: `3px solid ${T.teal}`,
                  animation: 'spin .8s linear infinite' }} />
                <div style={{ fontSize: 14, color: T.muted }}>{t('route.calculating')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: 3, background: T.teal,
                      animation: `dotBounce .8s ${i * .15}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {step === 'routes' && (
              <>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>
                  {t('route.foundCount', { n: routeOptions.length })}
                </div>
                {routeOptions.length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
                    {t('route.none')}
                  </div>
                )}
                {routeOptions.map((rt, i) => {
                  const mins = Math.round(rt.duration / 60);
                  const km = (rt.distance / 1000).toFixed(1);
                  const labels = [t('route.labelFastest'), t('route.labelAlt1'), t('route.labelAlt2')];
                  const notes = [t('route.noteOptimal'), t('route.noteLights'), t('route.noteAlt')];
                  const sel = i === selectedRouteIdx;
                  return (
                    <button key={i} onClick={() => pickRouteOption(i)}
                      style={{ width: '100%', marginBottom: 8, padding: '14px 16px', borderRadius: 14,
                        background: sel ? T.tealDim : T.bg,
                        border: `1.5px solid ${sel ? T.teal + '60' : T.border}`,
                        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif',
                        boxShadow: sel ? `0 0 0 1px ${T.teal}30` : 'none',
                        transition: 'all .15s ease' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10,
                        background: sel ? T.teal : T.surface2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
                        {i === 0 ? '🏁' : i === 1 ? '🔀' : '🛣️'}
                      </div>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: sel ? T.teal : T.text }}>{labels[i]}</div>
                        <div style={{ fontSize: 12, color: T.muted }}>{notes[i]}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: sel ? T.teal : T.text }}>{mins} min</div>
                        <div style={{ fontSize: 11, color: T.muted }}>{km} km</div>
                      </div>
                      <div style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, marginLeft: 2,
                        border: `2px solid ${sel ? T.teal : T.border}`,
                        background: sel ? T.teal : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {sel && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6 L5 9 L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}

                {routeOptions.length > 0 && (
                  <button onClick={startSelectedRoute}
                    style={{ width: '100%', marginTop: 6, padding: '15px', borderRadius: 14, border: 'none',
                      background: `linear-gradient(135deg,${T.teal},#0e9e97)`,
                      color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      boxShadow: `0 4px 20px ${T.tealGlow}`, fontFamily: 'DM Sans,sans-serif' }}>
                    <svg width="17" height="17" viewBox="0 0 22 22" fill="none">
                      <path d="M11 2 L19 20 L11 15 L3 20 Z" fill="white" />
                    </svg>
                    {t('route.start')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
