# OnTheWay — Frontend

Real-time ride-matching app (Tashkent). A single-file React prototype has been
refactored into a **scalable, production-ready React 19 + Vite application** with
a strict layered architecture. The original prototype is preserved under
[`legacy/`](legacy/) for reference.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # serve the production build
```

## Tech choices

- **React 19**, functional components + hooks only.
- **Vite 6** (the toolchain already present in the repo).
- **JavaScript (JSX)**, not TypeScript — the prototype used untyped Leaflet/React
  globals; JSX keeps the migration faithful and low-risk. Data contracts are
  documented as JSDoc typedefs in [`src/models`](src/models/index.js).
- **Leaflet + leaflet-ant-path** as npm modules (no more CDN `<script>` tags).
- No state-management library: local state where possible, two tiny global
  stores (theme, language) exposed through context providers.

## Folder structure

```
src/
├── app/            # Composition root: App (orchestrator) + Root (providers)
├── pages/          # Top-level screens (Loading, Home)
├── features/       # Domain feature modules (UI grouped by capability)
│   ├── matching/   #   map HUD, walker cards, popups, speedometer
│   ├── route/      #   route planner sheet, nav bar, map pick overlay
│   ├── schedule/   #   search/add trips
│   ├── contacts/   #   contacts list + focused contact sheet
│   ├── chat/  call/ #  conversation + voice-call screens
│   ├── history/    #   trip history + analytics dashboard
│   ├── saved/ settings/ navigation/ complaint/ privacy/
├── components/     # Reusable, domain-agnostic UI
│   ├── ui/         #   buttons, segmented control, panels, spinner, toggles
│   └── form/       #   location / when / seats / notes fields
├── hooks/          # React hooks (data hooks + useMap + store hooks)
├── services/       # Business logic + client persistence stores
├── api/            # Repository layer (the backend seam)
├── mocks/          # Raw mock data sources
├── contexts/       # Theme + i18n providers (re-render seams)
├── constants/      # theme tokens, map styles, app constants
├── utils/          # geo, datetime, Leaflet icon factories
├── models/         # JSDoc domain typedefs
├── i18n/           # string dictionary + t() + language store
├── styles/         # global.css (keyframes, Leaflet overrides, responsive shell)
├── assets/
└── main.jsx        # entry
```

## Data Access Layer (the core requirement)

UI never touches mock data. Every read flows through a strict chain:

```
UI component → custom hook → service → api (repository) → mock data source
```

Example — the schedule search:

```
SchedulePanel.jsx
  → useWalkers()              (hooks/useWalkers.js)
    → listWalkers()           (services/walkerService.js)  ← also: matchWalkers / nearestWalkers
      → walkerApi.list()      (api/walkerApi.js)
        → mockResponse(WALKERS_DATA)   (mocks/walkers.js)
```

The UI has no idea whether data came from a mock or a real backend.

### Switching to a real backend

Everything funnels through [`src/api/client.js`](src/api/client.js):

1. Set `USE_MOCKS = false` (or `VITE_USE_MOCKS=false` in a `.env`).
2. Set `BASE_URL` (or `VITE_API_BASE_URL`) to your API origin.
3. Each `api/*.js` repository already has the live branch wired
   (`http('/walkers')`, etc.) — confirm the endpoint paths.

No changes are needed in pages, components, hooks, or services. The mock
repositories even simulate latency so loading/empty states stay realistic.

> `api/geoApi.js` is the exception — it talks to **live** external services
> (Nominatim geocoding + OSRM routing) regardless of the mock flag. Swap the
> endpoint constants there to self-host or use a commercial provider.

## Key architectural decisions

- **Layered data access.** mocks → api → services → hooks → UI. The single
  `client.js` seam makes backend migration a config change, not a refactor.
- **Theme & i18n as singletons + provider seams.** Tokens (`T`) and `t()` are
  imported directly by components (zero prop drilling, matching the prototype's
  runtime-token design system). `ThemeProvider` / `I18nProvider` subscribe once
  at the root and re-render the tree on change — the idiomatic React seam.
- **`useMap` imperative hook.** All Leaflet/DOM mutation is isolated behind a
  flat command API; the `App` orchestrates it but holds no Leaflet code itself.
- **Pure simulation service.** The walker-simulation engine
  (`services/simulationService.js`) is framework-free geometry/data — testable
  in isolation and reused by the map layer.
- **SRP / composition.** The 4,900-line monolith is split into ~80 focused
  modules; large screens compose small reusable units (form fields, panels,
  buttons), and business logic (matching, totals, role split) lives in services,
  not components.
- **Loading / empty / error states.** Data hooks expose `{ data, loading, error }`
  (`useAsync`), and panels render spinners/empty states accordingly.
- **Dev harness removed.** The prototype's Tweaks panel + iPhone-frame toggle
  were a design-tool artifact, not product code, and were dropped from `Root`.
```
