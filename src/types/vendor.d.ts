/* Ambient declarations for untyped vendor modules.
   Leaflet ships no types and is augmented at runtime by leaflet-ant-path and
   leaflet-rotate (setBearing/rotateTo/makeAntPath …). Rather than pull in
   @types/leaflet — which wouldn't know about those plugin augmentations — the
   imperative map layer treats Leaflet as an untyped boundary. */

declare module 'leaflet' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const L: any;
  export default L;
}

declare module 'leaflet-ant-path';
declare module 'leaflet-rotate';
