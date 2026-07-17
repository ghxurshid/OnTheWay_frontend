# OnTheWay Frontend — Claude Guide

**React 19 + Vite 6** single-page app for the OnTheWay ride-matching platform.
Plain React (no router/Redux libraries) with a deliberately **layered architecture**
and lightweight custom stores.

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
  All HTTP goes through `src/api/client.js`, which attaches the JWT, **unwraps the
  `{ success, data, message, errors }` envelope to `data`**, throws `ApiError` on
  failure, and transparently refreshes the token once on a 401. **Never call `fetch`
  directly from components** — go through an `api/` module.
- `src/services/` — business logic, stateful stores (`authStore`, `savedStore`,
  `unreadStore`, …) and **realtime** (`services/realtime/`: `hubConnection`,
  `presenceClient`, `chatClient`, `callClient`) built on `@microsoft/signalr`.
- `src/features/` — feature slices: `call`, `chat`, `contacts`, `history`, `matching`,
  `navigation`, `route`, `saved`, `schedule`, `settings`, `complaint`, `privacy`.
- `src/components/` — reusable UI (`ui/`, `form/`). `src/pages/` — top-level screens.
- `src/contexts/`, `src/hooks/`, `src/models/`, `src/constants/`, `src/utils/`.
- `src/i18n/` — **custom** i18n (`strings.js` + `index.js`). Supported: **uz / ru / en**.
  All user-visible text must come from i18n; never hard-code a language string.

## Maps & realtime

- Maps use **Leaflet 1.9.4** (+ `leaflet-ant-path` for animated routes). Not a React
  map wrapper — imperative Leaflet inside effects. Follow existing map code.
- Realtime via SignalR clients in `services/realtime/`. Components subscribe through
  services, not by opening hub connections themselves.

## Config & commands

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173 (auto-opens)
npm run build      # production build → dist/
npm run preview    # preview the build
```

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
