import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, type CharacterType, type Player } from '@/types/game';
import { createHazardZone } from '@/types/projectile';
import type { Platform } from '@/types/platform';
import { loadFrozenAI } from '@/test/aiBaseline';
import type { KeyboardState } from '../useKeyboard';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

interface MovementFixture {
  name: string;
  character?: CharacterType;
  player?: Partial<Player>;
  keys?: Partial<KeyboardState>;
  blizzard?: boolean;
  ceiling?: boolean;
}
const fixtures: MovementFixture[] = [
  { name: 'grounded movement with opposing inputs', keys: { a: true, d: true } },
  { name: 'jump held across landing', keys: { d: true, w: true } },
  { name: 'jump released while rising', player: { y: 300, velocityY: -400, isGrounded: false, isJumping: true } },
  { name: 'coyote jump', player: { x: 400, y: 300, isGrounded: false, lastGroundedTime: 9950 }, keys: { w: true } },
  { name: 'expired coyote jump', player: { x: 400, y: 300, isGrounded: false, lastGroundedTime: 9899 }, keys: { w: true } },
  { name: 'rooted jump preserves the existing engine rule', player: { rootDuration: 500 }, keys: { d: true, w: true } },
  { name: 'root expires before movement', player: { rootDuration: 8 }, keys: { d: true } },
  { name: 'slow and freeze movement modifiers', player: { isSlowed: true, slowDuration: 500, slowAmount: 0.4, freezeGauge: 3 }, keys: { a: true } },
  { name: 'knockback decay and landing', player: { y: 400, isGrounded: false, velocityY: 150, knockbackVelocityX: -300, knockbackVelocityY: 250 }, keys: { d: true } },
  { name: 'knockback threshold', player: { knockbackVelocityX: 10, knockbackVelocityY: -11 } },
  { name: 'blizzard acceleration and friction', blizzard: true, player: { velocityX: 120 }, keys: { a: true } },
  { name: 'blizzard wall bounce', blizzard: true, player: { x: 740, velocityX: 400 }, keys: { d: true } },
  { name: 'held shield slows movement', player: { mana: 10 }, keys: { g: true, d: true } },
  { name: 'empty shield releases before movement', player: { mana: 0, isShielding: true }, keys: { g: true, d: true } },
  { name: 'charge crosses its speed threshold', character: 'scientist', player: { isChargingSkill: true, skillChargeStartTime: 9150 }, keys: { g: true, d: true } },
  { name: 'flying forces horizontal movement', character: 'reaper', player: { isFlying: true, isInvulnerable: true, invulnerableDuration: 500 } },
  { name: 'flying diagonal normalization', character: 'reaper', player: { isFlying: true, isInvulnerable: true, invulnerableDuration: 500 }, keys: { a: true, w: true } },
  { name: 'flight expires before movement', character: 'reaper', player: { y: 300, isGrounded: false, isFlying: true, isInvulnerable: true, invulnerableDuration: 8 }, keys: { w: true } },
  { name: 'stunned floor bookkeeping', player: { y: 439, isGrounded: false, isStunned: true, stunDuration: 500, velocityY: 100, lastGroundedTime: 9000 }, keys: { w: true } },
  { name: 'frozen knockback', player: { y: 250, isGrounded: false, isFrozen: true, frozenDuration: 500, knockbackVelocityX: 300, knockbackVelocityY: -100 }, keys: { d: true } },
  { name: 'stun expires before movement', player: { isStunned: true, stunDuration: 8 }, keys: { d: true } },
  { name: 'one-way drop after platform collision', player: { x: 150, y: 310 }, keys: { s: true } },
  { name: 'solid ceiling preserves current collision resolution', ceiling: true, player: { x: 400, y: 275, isGrounded: false, velocityY: -400 } },
  { name: 'hacked movement inversion', player: { isHacked: true, hackedDuration: 500 }, keys: { a: true, w: true } },
  { name: 'inversion is resolved before its timer expires', player: { isHacked: true, hackedDuration: 8 }, keys: { a: true } },
];

describe('unchanged movement phases against the frozen engine', () => {
  it.each(fixtures)('$name', fixture => {
    function run(engine: typeof useGameEngine) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      let randomState = 731;
      vi.spyOn(Math, 'random').mockImplementation(() => ((randomState = Math.imul(randomState, 1664525) + 1013904223 >>> 0) / 4294967296));
      const game = renderHook(() => engine(CHARACTERS[fixture.character ?? 'gladiator'], CHARACTERS.archer,
        3, () => {}, 'multi', false, 1, 'default'));
      const state = game.result.current.gameState;
      Object.assign(state.players[0], { x: 200, y: 440, isGrounded: true, lastGroundedTime: 10000 }, fixture.player);
      state.players[1].x = 650;
      if (fixture.ceiling) {
        const ceiling: Platform = { id: 'ceiling', x: 0, y: 250, width: 800, height: 20, type: 'solid' };
        state.platforms = [...state.platforms, ceiling];
      }
      if (fixture.blizzard) state.hazardZones.push({ ...createHazardZone('blizzard', 2, 0, 0, 0, 5000), width: 800, height: 500 });
      const keys = { current: { ...emptyAIKeys(), ...fixture.keys } };
      act(() => game.result.current.setKeysRef(keys));
      const snapshots = [];
      for (let tick = 0; tick < 24; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        snapshots.push(structuredClone(game.result.current.gameState));
      }
      game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      return snapshots;
    }
    expect(run(useGameEngine)).toEqual(run(loadFrozenAI().api.useGameEngine));
  });
});
