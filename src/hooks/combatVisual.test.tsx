import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createCombatVisualState, captureBasicAttack, visualActorId } from '@/types/combatVisual';
import { basicMeleeGeometry } from '@/types/combatPhysics';
import { createProjectile } from '@/types/projectile';
import { emptyAIKeys } from './gameAI';
import { useGameEngine } from './useGameEngine';
import PlayerRenderer from '@/components/game/PlayerRenderer';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10000); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

function setup(id: keyof typeof CHARACTERS = 'gladiator') {
  const keys = { current: emptyAIKeys() };
  const game = renderHook(() => useGameEngine(CHARACTERS[id], CHARACTERS.gladiator, 60, vi.fn()));
  act(() => game.result.current.setKeysRef(keys));
  const step = (ms = 17) => act(() => { vi.advanceTimersByTime(ms); });
  return { ...game, keys, step };
}

describe('accepted attack visual lifecycle', () => {
  it('captures once, survives an immediate hit and the old timer, freezes and resets', () => {
    const { result, keys, step } = setup();
    result.current.gameState.players[1].x = result.current.gameState.players[0].x + 45;
    keys.current.f = true;
    step();
    const attack = result.current.gameState.combatVisual.attacks['player:1'];
    expect(attack).toMatchObject({ attackSequence: 1, roundId: 1, characterId: 'gladiator' });
    expect(result.current.gameState.attackHitboxes).toHaveLength(0);
    keys.current.f = false;
    step(210);
    expect(result.current.gameState.players[0].isAttacking).toBe(false);
    expect(result.current.gameState.combatVisual.attacks['player:1']).toEqual(attack);
    act(() => result.current.togglePause());
    const frozen = result.current.gameState.combatVisual;
    step(2000);
    expect(result.current.gameState.combatVisual).toBe(frozen);
    act(() => result.current.togglePause());
    step(17);
    expect(result.current.gameState.combatVisual.time - frozen.time).toBeLessThan(30);
    step(200);
    expect(result.current.gameState.combatVisual.attacks['player:1']).toBeUndefined();
    step(600);
    keys.current.f = true;
    step();
    expect(result.current.gameState.combatVisual.attacks['player:1'].attackSequence).toBe(2);
    keys.current.f = false;
    act(() => result.current.resetRound());
    expect(result.current.gameState.combatVisual).toEqual(createCombatVisualState(2));
    step(220);
    expect(result.current.gameState.combatVisual.attacks).toEqual({});
  });

  it('records the last poison arrow before it is consumed', () => {
    const { result, keys, step } = setup('archer');
    result.current.gameState.players[0].poisonArrowsRemaining = 1;
    keys.current.f = true;
    step();
    expect(result.current.gameState.players[0].poisonArrowsRemaining).toBe(0);
    expect(result.current.gameState.projectiles[0].type).toBe('poison-arrow');
    expect(result.current.gameState.combatVisual.attacks['player:1'].poison).toBe(true);
  });

  it('drops reaper motions during flight and does not replay them on return', () => {
    const { result, keys, step } = setup('reaper');
    keys.current.f = true;
    step();
    keys.current.f = false;
    keys.current.h = true;
    step();
    expect(result.current.gameState.players[0].isFlying).toBe(true);
    expect(result.current.gameState.combatVisual.attacks['player:1']).toBeUndefined();
    keys.current.h = false;
    step(1000);
    expect(result.current.gameState.combatVisual.attacks['player:1']).toBeUndefined();
  });

  it('holds attack direction and origin while actors move, and uses separate stable clone keys', () => {
    const player = createInitialPlayer(1, CHARACTERS.ninja);
    const visual = createCombatVisualState();
    captureBasicAttack(visual, player, 10000, basicMeleeGeometry(player));
    const attack = visual.attacks['player:1'];
    player.x += 150;
    player.facingRight = false;
    const clone = { ...player, isClone: true, aiControllerId: 'clone:stable', createdAt: 10000 };
    expect(visualActorId(clone)).toBe('clone:stable');
    clone.x += 200;
    expect(visualActorId(clone)).toBe('clone:stable');
    const { container } = render(<PlayerRenderer player={player} character={CHARACTERS.ninja} attack={attack} visualTime={35} />);
    const weapon = container.querySelector<HTMLElement>('[data-weapon]')!;
    expect(weapon.style.transform).toBe('scaleX(1)');
    expect(weapon.style.left).toBe(`${player.x}px`);
    const trail = container.querySelector<SVGElement>('svg')!;
    expect(trail.style.left).toBe(`${attack.melee!.x}px`);
    expect(container.querySelectorAll('[id]')).toHaveLength(0);
  });

  it.each([119, 121])('keeps ninja reflection governed by combat at %sms', elapsed => {
    const { result, keys, step } = setup('ninja');
    keys.current.f = true;
    step();
    keys.current.f = false;
    const visual = result.current.gameState.combatVisual.attacks['player:1'];
    const x = result.current.gameState.players[0].x + 65;
    // The fake 60Hz interval fires at 16ms; the first 17ms advance leaves 15ms to the next tick.
    vi.setSystemTime(visual.occurredAt + elapsed - 15);
    result.current.gameState.projectiles.push(createProjectile('snowball', 2, x, visual.y + 20, -1, 0, 10,
      { now: Date.now(), random: () => 0.3 }));
    step(15);
    expect(Date.now() - visual.occurredAt).toBe(elapsed);
    const projectile = result.current.gameState.projectiles.find(p => p.type === 'snowball')!;
    expect(projectile.ownerId).toBe(elapsed < 120 ? 1 : 2);
    expect(projectile.velocityX).toBe(elapsed < 120 ? 1 : -1);
  });

  it('keeps a reaper hit at 224ms even after the legacy attack boolean clears', () => {
    const { result, keys, step } = setup('reaper');
    keys.current.f = true;
    step();
    keys.current.f = false;
    step(200);
    expect(result.current.gameState.players[0].isAttacking).toBe(false);
    const visual = result.current.gameState.combatVisual.attacks['player:1'];
    const target = result.current.gameState.players[1];
    target.x = visual.melee!.x + 80;
    target.y = visual.y;
    const health = target.health;
    // After 217ms the next fake interval is 7ms away. Resolve contact at precisely 224ms.
    vi.setSystemTime(visual.occurredAt + 224 - 7);
    step(7);
    expect(Date.now() - visual.occurredAt).toBe(224);
    expect(result.current.gameState.players[1].health).toBe(health - CHARACTERS.reaper.attackDamage);
    expect(result.current.gameState.combatVisual.attacks['player:1']).toBeDefined();
    expect(result.current.gameState.attackHitboxes).toHaveLength(0);
  });
});
