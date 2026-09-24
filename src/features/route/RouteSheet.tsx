import { Fragment, useState, useRef, useEffect } from 'react';
import { T, TEAL_GRADIENT } from '@/constants/theme';
import { t } from '@/i18n';
import { TASHKENT } from '@/constants/map';
import { geocode, placeLabel, reverseGeocode, suggestionToPlace } from '@/services/geocodingService';
import type { PlaceSuggestion } from '@/services/geocodingService';
import { getRoute } from '@/services/routeService';
import type { OsrmRoute } from '@/services/routeService';
import { InlineSpinner } from '@/components/ui/Spinner';
import { MapPickOverlay } from './MapPickOverlay';
import type { LatLng, Place } from '@/models';
import type { MapHook } from '@/hooks/mapHook';

interface Waypoint { value: string; latlng: LatLng | null; placeholder: string }

interface RouteSheetProps {
  onClose: () => void;
  onShowRoute: (route: OsrmRoute, waypoints: Waypoint[]) => void;
  mapHook: MapHook;
  userLoc: LatLng | null;
}

const ROUTE_ICONS = ['🏁', '🔀', '🛣️'];

/** Multi-waypoint route planner sheet: input → calculate → choose route. */
export function RouteSheet({ onClose, onShowRoute, mapHook, userLoc }: RouteSheetProps) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { value: '', latlng: userLoc || TASHKENT, placeholder: t('route.startPlaceholder') },
    { value: '', latlng: null, placeholder: t('route.where') },
  ]);
  const [activeIdx, setActiveIdx] = useState(1);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState<'input' | 'calculating' | 'routes'>('input');
  const [routeOptions, setRouteOptions] = useState<OsrmRoute[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [pickingIdx, setPickingIdx] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Label the start point with the user's current address.
  useEffect(() => {
    let alive = true;
    const loc = userLoc || TASHKENT;
    reverseGeocode(loc).then((label) => {
      if (alive) setWaypoints((wp) => wp.map((w, i) => (i === 0 ? { ...w, value: label, latlng: loc } : w)));
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Fill waypoint `idx` and redraw the A/B markers of every placed waypoint.
  const placeWaypoint = (idx: number, { latlng, label }: Place) => {
    const next = waypoints.map((w, i) => (i === idx ? { ...w, value: label, latlng } : w));
    setWaypoints(next);
    mapHook.setWaypointMarkers(next.filter((w) => w.latlng));
  };

  const enterMapPick = (idx: number) => {
    setSuggestions([]);
    setActiveIdx(idx);
    setPickingIdx(idx);
  };

  const confirmPick = (place: Place) => {
    if (pickingIdx !== null) placeWaypoint(pickingIdx, place);
    setPickingIdx(null);
  };

  const handleInput = (idx: number, val: string) => {
    setWaypoints((wp) => wp.map((w, i) => (i === idx ? { ...w, value: val, latlng: null } : w)));
    clearTimeout(debounceRef.current);
    if (val.length < 2) { setSuggestions([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      setSuggestions(await geocode(val));
      setSearching(false);
    }, 400);
  };

  const handleSuggest = (s: PlaceSuggestion) => {
    const place = suggestionToPlace(s);
    setSuggestions([]);
    mapHook.flyTo(place.latlng, 15);
    placeWaypoint(activeIdx, place);
  };

  const addWaypoint = () => {
    setWaypoints((wp) => [...wp.slice(0, -1), { value: '', latlng: null, placeholder: t('route.midPoint') }, wp[wp.length - 1]]);
  };

  const calcRoute = async () => {
    setStep('calculating');
    setSuggestions([]);
    const pts = waypoints.filter((w) => w.latlng);
    if (pts.length >= 2) {
      const routes = await getRoute(pts.map((w) => w.latlng as LatLng));
      setRouteOptions(routes);
      setSelectedRouteIdx(0);
      mapHook.setWaypointMarkers(pts);
      if (routes.length > 0) mapHook.setRouteLines(routes, 0);
    }
    setStep('routes');
  };

  const pickRouteOption = (idx: number) => {
    setSelectedRouteIdx(idx);
    mapHook.setRouteLines(routeOptions, idx);
  };

  const startSelectedRoute = () => {
    // Pass the picked waypoints too so the app can persist the journey (origin/
    // destination labels + coords) as a Live trip, not just draw it.
    const route = routeOptions[selectedRouteIdx];
    if (route) onShowRoute(route, waypoints.filter((w) => w.latlng));
  };

  const canCalc = waypoints.every((w) => w.latlng);
  const picking = pickingIdx !== null;
  const pickLabel = pickingIdx === 0 ? t('route.pickStart')
    : pickingIdx === waypoints.length - 1 ? t('route.pickDest') : t('route.pickMid');
  const routeLabels = [t('route.labelFastest'), t('route.labelAlt1'), t('route.labelAlt2')];
  const routeNotes = [t('route.noteOptimal'), t('route.noteLights'), t('route.noteAlt')];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: (picking || step === 'routes') ? 'none' : 'auto' }}>
      {!picking && step !== 'routes' && (
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      )}

      {picking && (
        <MapPickOverlay
          key={pickingIdx}
          mapHook={mapHook}
          label={pickLabel}
          caption={t('route.pickedAddr')}
          initial={waypoints[pickingIdx].latlng}
          onConfirm={confirmPick}
          onCancel={() => setPickingIdx(null)}
        />
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

              {searching && <InlineSpinner style={{ marginTop: 10, padding: '8px 0' }} />}
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
                        {placeLabel(s.display_name, 3)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <button onClick={calcRoute} disabled={!canCalc}
                style={{ width: '100%', marginTop: 14, padding: '15px', borderRadius: 14,
                  background: canCalc ? TEAL_GRADIENT : T.surface2,
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
                        {ROUTE_ICONS[i]}
                      </div>
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: sel ? T.teal : T.text }}>{routeLabels[i]}</div>
                        <div style={{ fontSize: 12, color: T.muted }}>{routeNotes[i]}</div>
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
                      background: TEAL_GRADIENT,
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
