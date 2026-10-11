import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { scriptedEvaluationController } from '@/test/aiEvaluationScenarios';
import type { AIWorld } from './world';

function world(): AIWorld {
  return { players: [createInitialPlayer(1, CHARACTERS.gladiator), createInitialPlayer(2, CHARACTERS.ninja)],
    projectiles: [], attackHitboxes: [], hazardZones: [], mapId: 'default', platforms: MAPS.default.platforms,
    now: 10000, deltaTime: 16, roundTimeRemaining: 60, isOvertime: false,
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [] };
}
describe('common scripted evaluation opponents', () => {
  it('uses each physical side keyboard and approaches current target without advancing replay state', () => {
    const scene = world();
    const a = scriptedEvaluationController('rush', 1, 10000), b = scriptedEvaluationController('rush', 2, 10000);
    expect(a(scene)).toMatchObject({ d: true, a: false, f: true });
    expect(b(scene)).toMatchObject({ arrowLeft: true, arrowRight: false, shift: true });
    const later = { ...scene, now: 12000 };
    a(later); b(later);
    expect(a(scene)).toEqual(scriptedEvaluationController('rush', 1, 10000)(scene));
    expect(b(scene)).toEqual(scriptedEvaluationController('rush', 2, 10000)(scene));
  });
  it('preserves strafe period, edge recovery, jump pulses and lava jump conditions', () => {
    const scene = world(), strafe = scriptedEvaluationController('strafe', 2, 10000);
    expect(strafe(scene)).toMatchObject({ arrowRight: true, enter: true });
    expect(strafe({ ...scene, now: 11300 })).toMatchObject({ arrowLeft: true });
    const left = { ...scene, players: [scene.players[0], { ...scene.players[1], x: 25 }] as const, now: 11300 };
    expect(strafe(left)).toMatchObject({ arrowRight: true, arrowLeft: false });
    const jump = scriptedEvaluationController('jump', 2, 10000);
    expect(jump(scene).arrowUp).toBe(true);
    expect(jump({ ...scene, now: 10081 }).arrowUp).toBe(false);
    expect(jump({ ...scene, now: 10750 }).arrowUp).toBe(true);
    expect(strafe({ ...scene, mapId: 'volcano' }).arrowUp).toBe(true);
    expect(strafe({ ...scene, mapId: 'volcano', players: [scene.players[0], { ...scene.players[1], isGrounded: false }] }).arrowUp).toBe(false);
  });
});
