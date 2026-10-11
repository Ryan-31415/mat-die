import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type Player } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createAttackHitbox, createHazardZone, createProjectile } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { CURRENT_AI, deterministicEngineRandom, evaluationController, evaluationSeed } from '@/test/aiEvaluation';
import { initializeMeleeScene, MELEE_CHARACTERS } from '@/test/aiEvaluationMelee';
import { loadEvaluationBaseline } from '@/test/aiBaseline';
import { emptyAIKeys } from './controller';
import { selectGoal } from './navigation';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('low-health melee finish windows', () => {
  for (const character of MELEE_CHARACTERS) for (const side of [1, 2] as const) {
    it(`${character}/P${side} finishes a safe one-hit target rather than retreating`, () => {
      for (const seed of [1029682996, 731, 1907, 3571, 7919]) for (const version of ['baseline', 'current'] as const) {
        // The frozen failing control is the exact manifest condition. Other
        // personality seeds are current correctness checks, not universal old-AI failures.
        if (version === 'baseline' && seed !== 1029682996) continue;
        vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(console, 'log').mockImplementation(() => {});
        const api = version === 'current' ? CURRENT_AI : loadEvaluationBaseline().api;
        const effectiveSeed = evaluationSeed(seed, character, 'gladiator', 'wasteland', 'perfect:melee:low-health');
        const controller = evaluationController(api, createAISettings('perfect'), effectiveSeed, side);
        const runtime = { random: deterministicEngineRandom(effectiveSeed), controllers: { [side]: controller, [side === 1 ? 2 : 1]: () => emptyAIKeys() } };
        const game = renderHook(() => useGameEngine(CHARACTERS[side === 1 ? character : 'gladiator'], CHARACTERS[side === 2 ? character : 'gladiator'],
          2, () => {}, 'multi', false, 1, 'wasteland', undefined, true, undefined, runtime));
        initializeMeleeScene(game.result.current.gameState, 'low-health', side, 10000, 'wasteland');
        act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
        for (let tick = 0; tick < 30 && game.result.current.gameState.isRoundActive; tick++) act(() => { vi.advanceTimersByTime(17); });
        expect(game.result.current.gameState.diagnostics.effectiveDamage[side - 1]).toBe(version === 'current' ? 10 : 0);
        if (version === 'current') expect(game.result.current.gameState.roundWinner).toBe(side);
        game.unmount(); cleanup(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      }
    });
  }
  it.each([
    ['can attack immediately', { attackCooldownRemaining: 0 }],
    ['can cast a skill', { mana: 50, skillCooldownRemaining: 0 }],
    ['can use an ultimate', { mana: 100 }],
    ['front shield', { isShielding: true, facingRight: false }],
    ['invulnerable', { isInvulnerable: true }],
    ['evasion reserve', { dodgesRemaining: 1 }],
    ['damage reduction prevents a finish', { damageReduction: 0.5 }],
    ['health is too high', { health: 30 }],
    ['regeneration prevents a finish', { healthRegen: 400, regenDuration: 500 }],
  ] as [string, Partial<Player>][] )('retains retreat when the opponent %s', (_, changes) => {
    const self = { ...createInitialPlayer(1, CHARACTERS.gladiator), x: 280, y: 440, health: 25, mana: 0 };
    const enemy = { ...createInitialPlayer(2, CHARACTERS.gladiator), x: 340, y: 440, health: 10, mana: 0,
      attackCooldownRemaining: 1000, facingRight: false, ...changes };
    const w: AIWorld = { players: [self, enemy], platforms: MAPS.wasteland.platforms, projectiles: [], hazardZones: [], attackHitboxes: [],
      mapId: 'wasteland', now: 10000, deltaTime: 16, isOvertime: false, roundTimeRemaining: 60, sandstormActive: false,
      sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
    expect(selectGoal(self, enemy, prepareAIFrame(w)).strategy).toBe('kite');
  });
  it('does not override retreat through an active threat, own cooldown or lava floor', () => {
    const self = { ...createInitialPlayer(1, CHARACTERS.gladiator), x: 280, y: 440, health: 25, mana: 0 };
    const enemy = { ...createInitialPlayer(2, CHARACTERS.gladiator), x: 340, y: 440, health: 10, mana: 0,
      attackCooldownRemaining: 1000, facingRight: false };
    const base: AIWorld = { players: [self, enemy], platforms: MAPS.wasteland.platforms, projectiles: [], hazardZones: [], attackHitboxes: [],
      mapId: 'wasteland', now: 10000, deltaTime: 16, isOvertime: false, roundTimeRemaining: 60, sandstormActive: false,
      sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
    const clock = { now: 10000, random: () => 0.5 };
    const changes: ((w: AIWorld) => void)[] = [
      w => { w.players[0].attackCooldownRemaining = 500; },
      w => { w.players[0].isStunned = true; },
      w => { w.players[1].x = 600; },
      w => { w.projectiles = [createProjectile('arrow', 2, 340, 450, -1000, 0, 16, clock)]; },
      w => { w.attackHitboxes = [createAttackHitbox(2, 270, 440, 140, 40, 15, 200, false, 360, clock)]; },
      w => { w.hazardZones = [createHazardZone('fire-pool', 2, 280, 440, 3, 4000, clock)]; },
      w => { w.lightningStrikes = [{ x: 300, warningStart: 9000, struck: false }]; },
      w => { w.mapId = 'volcano'; w.platforms = MAPS.volcano.platforms; },
    ];
    expect(selectGoal(self, enemy, prepareAIFrame(base)).strategy).toBe('pressure');
    for (const change of changes) {
      const w = structuredClone(base); change(w);
      expect(selectGoal(w.players[0], w.players[1], prepareAIFrame(w)).strategy).toBe('kite');
    }
  });
});
