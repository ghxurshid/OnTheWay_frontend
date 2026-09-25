# OnTheWay Frontend — Claude Guide

**React 19 + Vite 6 + TypeScript** single-page app for the OnTheWay ride-matching
platform. Plain React (no router/Redux libraries) with a deliberately **layered
architecture** and lightweight custom stores. All source is `.ts`/`.tsx`.

> Product-wide specs live one level up in [../docs/](../docs/):
> [funksional-spetsifikatsiya.md](../docs/funksional-spetsifikatsiya.md) (what) and
> [texnik-spetsifikatsiya.md](../docs/texnik-spetsifikatsiya.md) (how). The backend it
> talks to is in `../OnTheWay_backend/`. Term/spec differences: the reconciliation
> section (§14) of the technical spec.

## Layers (respect the direction of dependencies)

```
pages / features  →  components (ui, form)
       │
       ▼
  services  ──────────────►  api  ──────────►  backend (REST + SignalR)
 (business,   (HTTP wrappers,
  realtime,    envelope unwrap)
  stores)
```

- `src/api/` — one module per backend area (`authApi`, `chatApi`, `walkerApi`, …).
  All HTTP goes through `src/api/client.ts`, which attaches the JWT, **unwraps the
  `{ success, data, message, errors }` envelope to `data`**, throws `ApiError` on
  failure, and transparently refreshes the token once on a 401. Reads use
  `http(path)`; writes use `send(method, path, body?)`. **Never call `fetch`
  directly from components** — go through an `api/` module.
- `src/services/` — business logic, stateful stores (`authStore`, `savedStore`,
  `unreadStore`, …) and **realtime** (`services/realtime/`: `hubConnection`,
  `presenceClient`, `chatClient`, `callClient`) built on `@microsoft/signalr`.
  Stores persist through `utils/storage` (`readJson`/`writeJson`) and announce
  changes with a window event (`SAVED_EVENT`, `UNREAD_EVENT`, `SIM_COUNT_EVENT`);
  React reads them via `hooks/useStoreEvent` (`useSaved`, `useUnread`, `useSimCount`).
  Hub clients are built with `createHubClient` + `createEmitter` from `hubConnection`.
- `src/features/` — feature slices: `call`, `chat`, `contacts`, `history`, `matching`,
  `navigation`, `route`, `saved`, `schedule`, `settings`, `complaint`, `privacy`.
- `src/components/` — reusable UI (`ui/`, `form/`). `src/pages/` — top-level screens.
- `src/contexts/`, `src/hooks/`, `src/models/`, `src/constants/`, `src/utils/`.
- `src/i18n/` — **custom** i18n (`strings.ts` + `index.ts`). Supported: **uz / ru / en**.
  All user-visible text must come from i18n; never hard-code a language string.

### Shared helpers (reuse, don't re-implement)

| Need | Use |
|---|---|
| Distance / bearing / route split & projection, OSRM → `[lat,lng]` | `utils/geo` (`haversineKm`, `bearing`, `splitRoute`, `projectOnRoute`, `osrmToLatLngs`) |
| Avatar initials / colour | `utils/avatar` (`initialsOf`, `colorForId`, `AVATAR_PALETTE`) |
| Real (numeric) user id vs. mock id, string ids | `utils/ids` (`isRealUserId`, `idOf`) |
| Driver/passenger accent, brand gradient | `constants/theme` (`partyColor`, `TEAL_GRADIENT`) |
| Basemap mode → tile style | `constants/map` (`tileStyleFor`) · `hooks/useMapStyle` |
| OSRM routes, route → presence DTO | `services/routeService` (`getRoute`, `routeCoords`, `toRoutePublishDto`) |
| Address search / labels | `services/geocodingService` (`geocode`, `reverseGeocode`, `suggestionToPlace`, `placeLabel`) |
| Live trip behind an on-map route, "band" toggle | `services/liveTripService` (`createLiveTrip`, `closeLiveTrip`, `publishBanded`) |
| One-shot device location | `services/geolocation` (`getCurrentLatLng`) |
| Drag-the-map point picker | `features/route/MapPickOverlay` |
| Any error shown to a user (localized, actionable — never raw `Failed to fetch` / `HTTP 401`) | `utils/errors` (`errorMessage`, `isConflict`, `isUserOffline`, `fieldErrors`, `appError`) |
| Load failed / nothing yet | `components/ui/StatusStates` (`ErrorState` with retry, `EmptyState`) |
| "Are you sure?" before a destructive action | `services/confirm` (`await confirmAction({...})`, rendered once by `ConfirmHost`) |
| Close a layer on Escape / Telegram BackButton (top-most layer only) | `hooks/useBackHandler` (over `services/backStack`) |
| Realtime connection state for UI (connected / reconnecting / offline) | `hooks/useRealtimeStatus` |

**Ids are always strings on the frontend** (REST sends numeric longs, SignalR sends
strings) — normalise with `String(id)` / `idOf` before comparing or keying maps.

## Maps & realtime

- Maps use **Leaflet 1.9.4** (+ `leaflet-ant-path` for animated routes, `leaflet-rotate`
  for bearing). Not a React map wrapper — all imperative Leaflet lives in
  `hooks/useMap.ts` (the only `@ts-nocheck` file), which returns a stable command
  facade (`MapHook`). Components/hooks drive the map only through that facade.
  `setBearing` is clockwise (heading-up = −heading); the vector renderer must be
  patched **before** it is added to the map.
- Realtime via SignalR clients in `services/realtime/`. Components subscribe through
  services, not by opening hub connections themselves.

## Config & commands

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173 (auto-opens)
npm run build      # production build → dist/
npm run preview    # preview the build
npm test           # vitest (unit tests live next to the code: *.test.ts[x])
```

Before committing, all four must be green: `npx tsc --noEmit`, `npx eslint src`
(the two react-refresh warnings in `contexts/` are known), `npx vitest run`,
`npx vite build`.

Environment (Vite, `.env`):
- `VITE_API_BASE_URL` — backend origin **including version**, e.g.
  `http://<host>:5106/api/v1`. Defaults to `/api/v1`.
- `VITE_USE_MOCKS` — `true` to use `src/mocks/` instead of the live backend.

Import alias: **`@` → `src`** (e.g. `import { authStore } from '@/services/authStore'`).
Use it instead of `../../..` chains.

## Conventions

- Match the existing file's style (this codebase favours clear comments at module tops
  and the `@`-alias imports — follow what the neighbouring files do).
- Keep the layer boundaries: components → services → api. No HTTP or envelope handling
  in components.
- Theme: light/dark support belongs to user settings; don't hard-code colors that
  bypass the theme.
- Backend contract details (envelope, pagination, auth) are in the API-conventions
  section of [../docs/texnik-spetsifikatsiya.md](../docs/texnik-spetsifikatsiya.md).
- `legacy/` holds pre-React code — don't extend it; port into `src/` instead.
- Geocoding and routing go through the backend proxy (`/geo/search`, `/geo/reverse`,
  `/geo/route` in `api/geoApi`); only mock mode talks to Nominatim/OSRM directly.
- Every async screen has three states: loading, `ErrorState` (with retry), content or
  `EmptyState`. A submit is guarded by a **ref**, not only by `busy` state — taps in the
  same frame all see the stale state.
- Every literal `t('a.b')` key must exist in uz/ru/en — `src/i18n/keys.test.ts` enforces it.
