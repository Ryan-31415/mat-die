import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createAttackHitbox, createHazardZone, createProjectile, type ProjectileType } from '@/types/projectile';
import { loadFrozenAI } from '@/test/aiBaseline';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const types: ProjectileType[] = ['rocket', 'homing-rocket', 'arrow', 'poison-arrow', 'fireball', 'large-fireball',
  'meteor', 'flask', 'electric-orb', 'bullet', 'super-bullet', 'bat', 'snowball', 'large-snowball', 'blizzard-stone', 'net', 'hacker-missile', 'hacking'];
type Variant = 'ordinary' | 'own' | 'hack-ultimate' | 'visited-bat' | 'overkill-pair' | 'expired' | 'dead' | 'tunnel' | 'body' | 'sword' | 'melee-body' | 'melee-repeat';
const scenes = [
  ...types.map(type => ({ type, variant: 'ordinary' as Variant })),
  ...(['own', 'hack-ultimate', 'visited-bat', 'overkill-pair', 'expired', 'dead', 'tunnel', 'body', 'sword', 'melee-body', 'melee-repeat'] as Variant[])
    .map(variant => ({ type: variant === 'visited-bat' ? 'bat' as const : 'fireball' as const, variant })),
];

describe('unchanged Tesla Coil collision phases against the original engine', () => {
  it.each(scenes.flatMap(scene => ([1, 2] as const).map(side => ({ ...scene, side }))))('$type / $variant / P$side', ({ type, variant, side }) => {
    const other = side === 1 ? 2 : 1;
    function run(engine: typeof useGameEngine) {
      vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(0.3);
      const enemyCharacter = variant === 'sword' ? CHARACTERS.ninja : CHARACTERS.gladiator;
      const game = renderHook(() => engine(side === 1 ? CHARACTERS.gladiator : enemyCharacter, side === 1 ? enemyCharacter : CHARACTERS.gladiator,
        60, () => {}, 'multi', false, 1, 'wasteland'));
      const state = game.result.current.gameState;
      Object.assign(state.players[side - 1], { x: 40, y: 440, isGrounded: true });
      Object.assign(state.players[other - 1], { x: variant === 'body' || variant === 'melee-body' ? 310 : 700, y: 440, isGrounded: true });
      const coil = { ...createHazardZone('tesla-coil', variant === 'own' ? side : other, 300, 420, 2, variant === 'expired' ? 8 : 30000),
        id: 'coil', health: variant === 'overkill-pair' ? 5 : variant === 'dead' ? 0 : 175, isGrounded: true };
      state.hazardZones.push(coil);
      if (variant.startsWith('melee')) {
        state.attackHitboxes.push({ ...createAttackHitbox(side, 290, 440, 80, 40, 10, 500), id: 'melee' });
      } else {
        const shot = { ...createProjectile(type, side, variant === 'tunnel' ? 200 : 320, 450,
          variant === 'tunnel' ? 15000 : 0, 0, 10), id: 'shot' };
        if (variant === 'hack-ultimate') shot.isHackUltimate = true;
        if (variant === 'visited-bat') shot.hitCoilIds = ['coil'];
        state.projectiles.push(shot);
        if (variant === 'overkill-pair') state.projectiles.push({ ...shot, id: 'shot-2', lastHitTime: {} });
        if (variant === 'sword') state.attackHitboxes.push({ ...createAttackHitbox(other, 280, 430, 100, 60, 16, 120, true), id: 'sword' });
      }
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      const snapshots = [];
      for (let tick = 0; tick < 3; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        snapshots.push(structuredClone(game.result.current.gameState));
      }
      const first = snapshots[0], remaining = first.hazardZones.find(zone => zone.id === 'coil');
      if (['overkill-pair', 'expired', 'dead'].includes(variant)) {
        expect(remaining).toBeUndefined();
        expect(first.projectiles).toEqual([]);
      } else {
        const ignored = ['own', 'hack-ultimate', 'visited-bat', 'tunnel'].includes(variant);
        expect(remaining!.health).toBe(ignored ? 175 : 165);
        if (!variant.startsWith('melee')) expect(first.projectiles.some(projectile => projectile.id === 'shot')).toBe(ignored || type === 'bat');
        if (variant === 'ordinary' && type === 'bat') {
          expect(first.projectiles[0].hitCoilIds).toEqual(['coil']);
          expect(snapshots[2].hazardZones.find(zone => zone.id === 'coil')!.health).toBe(165);
        }
        if (variant === 'melee-repeat') expect(snapshots[2].hazardZones.find(zone => zone.id === 'coil')!.health).toBe(145);
      }
      if (variant === 'body' || variant === 'sword') expect(first.players[other - 1].health).toBe(first.players[other - 1].maxHealth);
      if (variant === 'melee-body') expect(first.players[other - 1].health).toBe(first.players[other - 1].maxHealth - 10);
      game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      return snapshots;
    }
    const original = run(loadFrozenAI().api.useGameEngine);
    expect(run(useGameEngine)).toEqual(original);
  });
});
