/* SERVICE — the authenticated user's profile. */

import { userApi } from '@/api/userApi';

/** Fetch the caller's own profile (/users/me). */
export function getMe() {
  return userApi.me();
}

/** Set or clear the caller's vehicle (driver ⇄ passenger). */
export function updateVehicle(vehicle) {
  return userApi.updateVehicle(vehicle);
}
