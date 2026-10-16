import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, type CharacterType, type Player } from '@/types/game';
import { createHazardZone } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { predictActionStart } from './actionStart';
import type { AIWorld } from './world';
import { createAISettings } from '@/types/ai';
import { createPerceptionMemory, perceiveWorld } from './perception';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
interface Scene { name: string; character?: CharacterType; enemy?: CharacterType; player?: Partial<Player>;
  direction?: -1 | 0 | 1; jump?: boolean; down?: boolean; skill?: boolean; hazard?: 'blizzard' | 'packet-block-zone'; ownHazard?: boolean }
const scenes: Scene[] = [
  { name: 'move right', direction: 1 }, { name: 'move left', direction: -1 },
  { name: 'jump', jump: true, direction: 1 },
  { name: 'rooted turn', player: { rootDuration: 500 }, direction: -1 },
  { name: 'root expiry', player: { rootDuration: 8 }, direction: 1 },
  { name: 'slow expiry', player: { isSlowed: true, slowDuration: 8, slowAmount: 0.8 }, direction: 1 },
  { name: 'slowed and chilled', player: { isSlowed: true, slowDuration: 500, slowAmount: 0.3, freezeGauge: 3 }, direction: 1 },
  { name: 'stun expiry', player: { isStunned: true, stunDuration: 8 }, direction: 1 },
  { name: 'frozen expiry', player: { isFrozen: true, frozenDuration: 8 }, direction: -1 },
  { name: 'frozen remains', player: { isFrozen: true, frozenDuration: 500, knockbackVelocityX: 1500 }, direction: 1 },
  { name: 'freeze triggered', enemy: 'ice-mage', player: { freezeGauge: 5 }, direction: 1, hazard: 'blizzard' },
  { name: 'chill decays', enemy: 'ice-mage', player: { freezeGauge: 3, lastHitByIceMage: 100, lastFreezeGaugeDecay: 100 }, direction: 1 },
  { name: 'recent chill does not decay', enemy: 'ice-mage', player: { freezeGauge: 3, lastHitByIceMage: 9950, lastFreezeGaugeDecay: 0 }, direction: 1 },
  { name: 'chill decay interval not ready', enemy: 'ice-mage', player: { freezeGauge: 3, lastHitByIceMage: 100, lastFreezeGaugeDecay: 9950 }, direction: 1 },
  { name: 'buff expiry', player: { buffDuration: 8, speedBoost: 0.5 }, direction: 1 },
  { name: 'stealth expiry', character: 'ninja', player: { invisibleDuration: 8, isInvisible: true, speedBoost: 0.5 }, direction: 1 },
  { name: 'flight automatic horizontal', character: 'reaper', player: { isFlying: true, isInvulnerable: true, invulnerableDuration: 500, y: 300 } },
  { name: 'flight diagonal', character: 'reaper', player: { isFlying: true, isInvulnerable: true, invulnerableDuration: 500, y: 300 }, direction: -1, jump: true },
  { name: 'flight expiry', character: 'reaper', player: { isFlying: true, isInvulnerable: true, invulnerableDuration: 8, speedBoost: 0.5, y: 300, isGrounded: false } },
  { name: 'large snowball knockback', character: 'hunter', player: { knockbackVelocityX: 1500 }, direction: 1 },
  { name: 'wall clamp', player: { x: 740, knockbackVelocityX: 1500 }, direction: 1 },
  { name: 'blizzard momentum', player: { velocityX: 300 }, direction: -1, hazard: 'blizzard' },
  { name: 'own blizzard no slide', player: { velocityX: 300 }, direction: -1, hazard: 'blizzard', ownHazard: true },
  { name: 'shield held', player: { mana: 6 }, direction: 1, skill: true },
  { name: 'shield released', player: { mana: 6, isShielding: true }, direction: 1 },
  { name: 'shield below threshold', player: { mana: 4 }, direction: 1, skill: true },
  { name: 'shield regeneration threshold', player: { mana: 4.999 }, direction: 1, skill: true },
  { name: 'charge slowing', character: 'scientist', player: { isChargingSkill: true, skillChargeStartTime: 9150 }, direction: 1, skill: true },
  { name: 'charge silence expiry', character: 'scientist', player: { isChargingSkill: true, skillChargeStartTime: 9150, isSilenced: true, silenceDuration: 8 }, direction: 1, skill: true },
  { name: 'charge cancelled by zone', character: 'scientist', player: { isChargingSkill: true, skillChargeStartTime: 9150 }, direction: 1, skill: true, hazard: 'packet-block-zone' },
  { name: 'hacked', player: { isHacked: true, hackedDuration: 500 }, direction: -1, jump: true },
  { name: 'hack expiry still inverted', player: { isHacked: true, hackedDuration: 8 }, direction: -1 },
  { name: 'one-way drop', player: { x: 150, y: 310 }, down: true },
];

describe('action-start self motion against the current engine rules', () => {
  for (const dt of [16, 33, 100]) for (const side of [1, 2] as const) {
    it.each(scenes)(`dt${dt}/P${side}/$name`, scene => {
      {
        vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(0.3);
        const characters = side === 1 ? [CHARACTERS[scene.character ?? 'gladiator'], CHARACTERS[scene.enemy ?? 'archer']]
          : [CHARACTERS[scene.enemy ?? 'archer'], CHARACTERS[scene.character ?? 'gladiator']];
        const game = renderHook(() => useGameEngine(characters[0], characters[1], 60, () => {}, 'multi', false, 1, 'default'));
        const state = game.result.current.gameState, player = state.players[side - 1];
        Object.assign(player, { x: 400, y: 440, isGrounded: true, lastGroundedTime: 10000, mana: 50 }, scene.player);
        state.players[side === 1 ? 1 : 0].x = 50;
        if (scene.hazard) state.hazardZones.push({ ...createHazardZone(scene.hazard, scene.ownHazard ? side : side === 1 ? 2 : 1,
          0, 0, 0, 5000), width: 800, height: 500 });
        const input = { left: scene.direction === -1, right: scene.direction === 1, jump: !!scene.jump, down: !!scene.down };
        const keys = { ...emptyAIKeys(), ...(side === 1 ? { a: input.left, d: input.right, w: input.jump, s: input.down, g: !!scene.skill }
          : { arrowLeft: input.left, arrowRight: input.right, arrowUp: input.jump, arrowDown: input.down, enter: !!scene.skill }) };
        const world: AIWorld = { players: state.players, platforms: state.platforms, hazardZones: state.hazardZones,
          now: 10000 + dt, deltaTime: dt, mapId: 'default', roundTimeRemaining: 60, isOvertime: false,
          projectiles: [], attackHitboxes: [], sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
          lightningStrikes: [], soulZones: [], vineShields: [] };
        const source = structuredClone(world);
        const observed = perceiveWorld(world, createAISettings('perfect').parameters, createPerceptionMemory(), world.now, () => 0.5, side).world;
        const expected = predictActionStart(observed, observed.players[side - 1], input, !!scene.skill);
        expect(world).toEqual(source);
        act(() => game.result.current.setKeysRef({ current: keys }));
        // One real interval callback, with a deliberately delayed clock. No extra AI/engine ticks.
        vi.setSystemTime(10000 + dt - 16);
        act(() => { vi.advanceTimersByTime(16); });
        const actual = game.result.current.gameState.players[side - 1];
        expect(actual).toMatchObject(expected);
        game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      }
    });
  }
});
