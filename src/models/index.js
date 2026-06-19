/* ════════════════════════════════════════════════════════════════
   DOMAIN MODELS — JSDoc typedefs.
   Plain JS project, so these are documentation/IntelliSense contracts that
   describe the shapes flowing UI ← hook ← service ← api ← mock. They give a
   single place to evolve the data contract when the backend lands.
   ════════════════════════════════════════════════════════════════ */

/**
 * @typedef {[number, number]} LatLng  // [latitude, longitude]
 */

/**
 * A scheduled walker (driver or passenger).
 * @typedef {Object} Walker
 * @property {string} id
 * @property {'driver'|'passenger'} type
 * @property {string} name
 * @property {string} initials
 * @property {string} from
 * @property {string} to
 * @property {LatLng} fromLatlng
 * @property {LatLng} toLatlng
 * @property {Date}   when
 * @property {number} seats
 * @property {number} rating
 * @property {string|null} vehicle
 */

/**
 * A contact the user has saved.
 * @typedef {Object} Contact
 * @property {string} id
 * @property {string} name
 * @property {string} initials
 * @property {'driver'|'passenger'} type
 * @property {number} rating
 * @property {string} phone
 * @property {boolean} online
 * @property {string|null} lastSeen
 * @property {LatLng} latlng
 * @property {boolean} hasRoute
 * @property {LatLng} [fromLatlng]
 * @property {LatLng} [toLatlng]
 * @property {string} [vehicle]
 */

/**
 * A completed trip.
 * @typedef {Object} Trip
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {Date}   date
 * @property {string} duration
 * @property {string} km
 * @property {'driver'|'passenger'} role
 * @property {string} partner
 * @property {number} rating
 * @property {'completed'|'cancelled'} status
 */

/**
 * A normalized route returned by the route service / RouteServer.
 * @typedef {Object} RouteData
 * @property {LatLng[]} coords
 * @property {number}   distanceKm
 * @property {number}   durationMin
 */

/**
 * A saved item (place / route / partner).
 * @typedef {Object} SavedItem
 * @property {string} id
 * @property {'place'|'route'|'partner'} type
 * @property {string} label
 * @property {string} [sub]
 * @property {string} [initials]
 * @property {number} [savedAt]
 */

export {};
