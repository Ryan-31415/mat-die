import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { createAISettings, NEUTRAL_AI_TRAITS } from '@/types/ai';
import { useGameEngine } from '../useGameEngine';
import { decideAI, emptyAIKeys, type PositionDecision } from './controller';
import { scientistFlask } from './scientist';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('height opportunity evidence from real flask trajectories', () => {
  for (const side of [1, 2] as const) it.each([
    { name: 'level clear shot', enemyY: 440, wall: false, hit: true, generic: true },
    { name: 'reachable elevated target', enemyY: 400, wall: false, hit: true, generic: false },
    { name: 'unreachable elevated target', enemyY: 300, wall: false, hit: false, generic: false },
    { name: 'level shot intercepted before target', enemyY: 440, wall: true, hit: false, generic: true },
  ])(`P${side}/$name`, scene => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(.3);
    const direction = side === 1 ? 1 : -1, other = side === 1 ? 2 : 1;
    const self = { ...createInitialPlayer(side, CHARACTERS.scientist), x: side === 1 ? 180 : 560, y: 440,
      facingRight: direction > 0, rootDuration: 5000, mana: 0 };
    const enemy = { ...createInitialPlayer(other, CHARACTERS.gladiator), x: self.x + direction * 250,
      y: scene.enemyY, rootDuration: 5000, attackCooldownRemaining: 5000, mana: 0 };
    const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self],
      platforms: MAPS.wasteland.platforms.filter(platform => platform.id === 'ground'),
      projectiles: [], hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000, deltaTime: 16,
      roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
      lightningStrikes: [], soulZones: [], vineShields: [] };
    if (scene.enemyY < 440) world.platforms = [...world.platforms,
      { id: 'enemy-support', x: enemy.x - 20, y: enemy.y + 40, width: 80, height: 20, type: 'solid' }];
    if (scene.wall) world.platforms = [...world.platforms,
      { id: 'intercepting-wall', x: self.x + direction * 60, y: 360, width: 20, height: 120, type: 'solid' }];
    const before = structuredClone(world), frame = prepareAIFrame(world);
    const outcome = scientistFlask(frame, self, enemy, () => enemy);
    expect(outcome === 'target' || outcome === 'pool').toBe(scene.hit);
    const generic = Math.abs(self.y - enemy.y) < 30 && Math.abs(self.x - enemy.x) < self.character!.attackRange;
    expect(generic).toBe(scene.generic);
    let position: PositionDecision | undefined;
    decideAI(frame, self, undefined, undefined, { parameters: createAISettings('perfect').parameters,
      traits: NEUTRAL_AI_TRAITS, random: () => .5 }, detail => { position = detail; });
    // Rooted supported actors isolate the current movement reward's height test.
    expect(position).toBeDefined();
    expect(position!.movementCandidates.some(candidate => candidate.benefit > 0)).toBe(scene.generic);
    expect(world).toEqual(before);
    const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!,
      60, () => {}, 'multi', false, 1, 'wasteland', undefined, true));
    Object.assign(game.result.current.gameState.players[0], structuredClone(world.players[0]));
    Object.assign(game.result.current.gameState.players[1], structuredClone(world.players[1]));
    game.result.current.gameState.platforms = structuredClone([...world.platforms]);
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), [side === 1 ? 'f' : 'shift']: true } }));
    act(() => { vi.advanceTimersByTime(16); });
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
    expect(game.result.current.gameState.diagnostics.effectiveDamage[side - 1] > 0).toBe(scene.hit);
    game.unmount();
  });
});
