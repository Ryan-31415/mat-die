import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { basicMeleeGeometry } from '@/types/combatPhysics';
import { captureBasicAttack, createCombatVisualState } from '@/types/combatVisual';
import { advanceCombatVisual, weaponPose } from './weaponPose';
import { WEAPONS } from './weaponDefinitions';

const status = { isShielding: false, isStunned: false, isFrozen: false };

describe('weapon motion boundaries', () => {
  it.each(['gladiator', 'ninja', 'reaper'] as const)('%s starts immediately and recovers beyond the hit interval', id => {
    const d = WEAPONS[id];
    expect(weaponPose(id, 0, status)).toMatchObject({ active: true, attacking: true, angle: d.idleAngle });
    expect(weaponPose(id, d.sweepMs, status).angle).toBe(d.strikeAngle);
    expect(weaponPose(id, d.activeMs - 0.01, status).trailOpacity).toBeGreaterThan(0);
    expect(weaponPose(id, d.activeMs, status)).toMatchObject({ active: false, attacking: true, trailOpacity: 0 });
    expect(weaponPose(id, d.durationMs, status)).toMatchObject({ active: false, attacking: false, angle: d.idleAngle });
    expect(weaponPose(id, 10000, status).flash).toBe(0);
  });

  it('keeps copied geometry and shot variants when live combat state changes', () => {
    const player = createInitialPlayer(1, CHARACTERS.archer);
    player.poisonArrowsRemaining = 1;
    const state = createCombatVisualState();
    captureBasicAttack(state, player, 100, null);
    player.poisonArrowsRemaining = 0;
    player.x = 600;
    player.facingRight = false;
    expect(state.attacks['player:1']).toMatchObject({ poison: true, facingRight: true, attackSequence: 1 });
    const ninja = createInitialPlayer(2, CHARACTERS.ninja);
    const melee = basicMeleeGeometry(ninja)!;
    captureBasicAttack(state, ninja, 100, melee);
    melee.x = 0;
    expect(state.attacks['player:2'].melee.x).not.toBe(0);
    const next = advanceCombatVisual(state, 120);
    expect(next.attacks['player:2']).toBeDefined();
    expect(advanceCombatVisual(next, 100).attacks['player:2']).toBeUndefined();
    expect(state.time).toBe(0);
  });
});
