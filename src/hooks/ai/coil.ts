import type { HazardZone } from '@/types/projectile';
import { stepCoilMotion } from '@/types/combatPhysics';
import type { Platform } from '@/types/platform';

/** Local copies only. Contacts happen before this end-of-callback phase. */
export function advanceCoilForecast(coils: HazardZone[], platforms: readonly Platform[], now: number, deltaTime: number,
  damage?: ReadonlyMap<string, number>): HazardZone[] {
  return coils.filter(coil => {
    if (coil.health !== undefined) {
      coil.health -= damage?.get(coil.id) ?? 0;
      if (coil.health <= 0) return false;
    }
    if (now - coil.createdAt > coil.duration) return false;
    if (coil.health !== undefined && coil.maxHealth !== undefined && now - (coil.lastSelfDamage || coil.createdAt) >= 250) {
      coil.health -= coil.maxHealth * 0.01;
      coil.lastSelfDamage = now;
      // The engine removes a coil killed by decay on the NEXT callback.
    }
    stepCoilMotion(coil, platforms, deltaTime);
    return true;
  });
}
