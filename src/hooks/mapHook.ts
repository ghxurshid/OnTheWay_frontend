/* Type alias for the imperative map controller returned by useMap.
   useMap is the ts-nocheck'd Leaflet boundary (Leaflet + its plugins are
   untyped), so the facade is treated as `any` at the consuming hooks — the
   real typing lives in the geometry helpers and domain models, not here. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapHook = any;
