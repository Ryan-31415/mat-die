import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { keysForSide, worldForSide } from '@/test/aiEvaluation';
import { createPerceptionMemory, perceiveWorld } from './perception';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './difficulty';
import type { AIWorld } from './world';

function world(): AIWorld {
  return { players: [{ ...createInitialPlayer(1, CHARACTERS.gladiator), x: 300, y: 440 },
    { ...createInitialPlayer(2, CHARACTERS.archer), x: 360, y: 440 }],
    now: 10000, deltaTime: 16, platforms: MAPS.wasteland.platforms, mapId: 'wasteland',
    isOvertime: false, roundTimeRemaining: 60, projectiles: [], hazardZones: [], attackHitboxes: [],
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [] };
}

describe('explicit observer identity with unchanged P2 default', () => {
  it('keeps P1 own information while masking P2 opponent fields', () => {
    const w = world();
    Object.assign(w.players[0], { health: 21, mana: 32, skillCooldownRemaining: 123, isFrozen: true });
    Object.assign(w.players[1], { health: 43, mana: 54, skillCooldownRemaining: 456, isFrozen: true });
    const p = createAISettings('perfect').parameters;
    Object.assign(p.information, { health: false, mana: false, skillCooldowns: false, statuses: false });
    const seen = perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 0.5, 1).world;
    expect(seen.players[0]).toMatchObject({ health: 21, mana: 32, skillCooldownRemaining: 123, isFrozen: true });
    expect(seen.players[1]).toMatchObject({ health: CHARACTERS.archer.maxHealth, mana: 100, skillCooldownRemaining: 0, isFrozen: false });
    expect(perceiveWorld(w, p, createPerceptionMemory())).toEqual(perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 0.5, 2));
  });

  it.each(['perfect', 'medium'] as const)('uses the same %s learning and delayed-input rules for native P1 and normalized P2', preset => {
    const settings = createAISettings(preset);
    if (preset === 'medium') for (const group of Object.values(settings.parameters.estimation)) {
      group.errorPercent = 0; group.rounding = 0;
    }
    let native = createDifficultyRuntime(createDifficultySession(731));
    let normalized = createDifficultyRuntime(createDifficultySession(731));
    const p1Keys: Record<string, string> = { arrowLeft: 'a', arrowRight: 'd', arrowUp: 'w', arrowDown: 's', shift: 'f', enter: 'g', backslash: 'h' };
    let producedInput = false;
    for (let tick = 0; tick < 50; tick++) {
      const w = world(); w.now += tick * 16;
      w.players[1].x += tick;
      native = stepDifficulty(w, settings, native, 1);
      normalized = stepDifficulty(worldForSide(w, 1), settings, normalized);
      expect(native.keys).toEqual(keysForSide(normalized.keys, 1));
      expect(native.session).toEqual(normalized.session);
      expect(native.observationsTaken).toBe(normalized.observationsTaken);
      expect(native.decisionsMade).toBe(normalized.decisionsMade);
      expect(native.inputs).toEqual(normalized.inputs.map(input => ({ ...input,
        values: Object.fromEntries(Object.entries(input.values).map(([key, value]) => [p1Keys[key], value])) })));
      producedInput ||= native.keys.a || native.keys.d || native.keys.f || native.keys.g || native.keys.h;
      expect(native.keys.arrowLeft || native.keys.arrowRight || native.keys.shift || native.keys.enter || native.keys.backslash).toBe(false);
    }
    expect(native.decisionsMade).toBeGreaterThan(0);
    expect(producedInput).toBe(true);
  });
});
