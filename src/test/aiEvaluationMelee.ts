import { ARENA, CHARACTERS, PLAYER_SIZE, type CharacterType } from '@/types/game';
import { FLOOR_Y } from '@/types/combatPhysics';
import { createAttackHitbox, createHazardZone, createProjectile } from '@/types/projectile';
import { useGameEngine } from '@/hooks/useGameEngine';
import type { MapId } from '@/types/map';
import { act, cleanup, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import type { AIWorld } from '@/hooks/ai/world';
import { emptyAIKeys } from '@/hooks/ai/controller';
import { deterministicEngineRandom, keysForSide } from './aiEvaluation';

export const MELEE_SCENARIOS = ['inside', 'outside', 'edge-in', 'edge-touch', 'edge-out', 'high-target', 'low-target',
  'overlap', 'behind', 'self-cooldown', 'enemy-ready', 'active-swing', 'retreat', 'approach', 'jump', 'turn',
  'shield-front', 'shield-back', 'shield-empty', 'parry', 'unreflectable', 'low-health', 'corner', 'pool', 'lava'] as const;
export const RESOURCE_MELEE_SCENARIOS = ['armed-enemy-ready', 'armed-low-mana', 'armed-parry', 'armed-approach', 'armed-pool'] as const;
export const ALL_MELEE_SCENARIOS = [...MELEE_SCENARIOS, ...RESOURCE_MELEE_SCENARIOS] as const;
export type MeleeScenario = typeof ALL_MELEE_SCENARIOS[number];
function baseMeleeScene(scene: MeleeScenario): typeof MELEE_SCENARIOS[number] {
  switch (scene) {
    case 'armed-enemy-ready': case 'armed-low-mana': return 'enemy-ready';
    case 'armed-parry': return 'parry';
    case 'armed-approach': return 'approach';
    case 'armed-pool': return 'pool';
    default: return scene;
  }
}
export const MELEE_CHARACTERS = ['gladiator', 'ninja', 'reaper'] as const;
export const meleeEnemy = (scene: MeleeScenario): CharacterType => ['parry', 'unreflectable'].includes(baseMeleeScene(scene)) ? 'archer' : 'gladiator';
type EvaluationGameState = ReturnType<typeof useGameEngine>['gameState'];

/** Fixed initial scenes, never future opponent input or oracle results in the AI world. */
export function initializeMeleeScene(state: EvaluationGameState, scenario: MeleeScenario, side: 1 | 2, now: number, map: MapId) {
  const scene = baseMeleeScene(scenario), armed = scenario !== scene;
  const self = state.players[side - 1], enemy = state.players[side === 1 ? 1 : 0];
  const direction = side === 1 ? 1 : -1;
  const range = self.character.attackRange + PLAYER_SIZE + (self.character.id === 'reaper' ? 10 : 0);
  const distance = scene === 'edge-in' ? range - 1 : scene === 'edge-touch' ? range : scene === 'edge-out' ? range + 1
    : scenario === 'armed-approach' ? 300 : scene === 'outside' ? range + 30 : scene === 'overlap' ? 0 : scene === 'behind' ? -60 : 60;
  Object.assign(self, { x: side === 1 ? 280 : 440, y: FLOOR_Y, isGrounded: true, lastGroundedTime: now,
    velocityX: 0, velocityY: 0, facingRight: side === 1, mana: scenario === 'armed-low-mana' ? 5.4272 : armed ? 60 : 0 });
  Object.assign(enemy, { x: self.x + direction * distance, y: FLOOR_Y, isGrounded: true, lastGroundedTime: now,
    velocityX: 0, velocityY: 0, facingRight: side === 2, attackCooldownRemaining: 1000, mana: 0 });
  if (scene === 'high-target') enemy.y -= 50;
  if (scene === 'low-target') self.y -= 50;
  if (scene === 'self-cooldown') self.attackCooldownRemaining = 750;
  if (scene === 'enemy-ready') enemy.attackCooldownRemaining = 0;
  if (scene === 'shield-front' || scene === 'shield-back' || scene === 'shield-empty') {
    enemy.isShielding = true;
    enemy.mana = scene === 'shield-empty' ? 0 : 50;
    if (scene === 'shield-back') enemy.facingRight = !enemy.facingRight;
  }
  if (scene === 'active-swing') {
    state.attackHitboxes.push(createAttackHitbox(enemy.id, enemy.facingRight ? enemy.x : enemy.x - CHARACTERS.gladiator.attackRange,
      enemy.y, CHARACTERS.gladiator.attackRange + PLAYER_SIZE, PLAYER_SIZE, CHARACTERS.gladiator.attackDamage, 200, false,
      enemy.x + PLAYER_SIZE / 2, { now, random: () => 0.3 }));
  }
  if (scene === 'parry' || scene === 'unreflectable') {
    enemy.x = self.x + direction * 300;
    const shot = createProjectile('arrow', enemy.id, self.x + (direction > 0 ? 70 : -40), self.y + 5,
      -direction * 600, 0, CHARACTERS.archer.attackDamage, { now, random: () => 0.3 });
    shot.canBeDeflected = scene === 'parry'; state.projectiles.push(shot);
  }
  if (scene === 'low-health') { self.health = 25; enemy.health = 10; }
  if (scene === 'corner') {
    self.x = side === 1 ? ARENA.padding : ARENA.width - ARENA.padding - PLAYER_SIZE;
    enemy.x = self.x + direction * 60;
  }
  if (scene === 'pool') state.hazardZones.push(createHazardZone('fire-pool', enemy.id, self.x - 70, FLOOR_Y - 40, 3, 4000,
    { now, random: () => 0.3 }));
  if (scene === 'lava' && map !== 'volcano') throw new Error('Lava scene requires a lava map');
}

export function meleeOpponentController(scenario: MeleeScenario, side: 1 | 2, start: number) {
  const scene = baseMeleeScene(scenario);
  return (world: AIWorld) => {
    const self = world.players[side - 1], enemy = world.players[side === 1 ? 1 : 0];
    const toward = Math.sign(enemy.x - self.x);
    const direction = scene === 'approach' ? toward : scene === 'retreat' ? -toward
      : scene === 'turn' ? world.now - start < 250 ? toward : -toward : 0;
    return keysForSide({ ...emptyAIKeys(), arrowLeft: direction < 0, arrowRight: direction > 0,
      arrowUp: scene === 'jump' && world.now - start < 80,
      enter: scene.startsWith('shield-'), shift: scene === 'enemy-ready' }, side);
  };
}

export const MELEE_OPPORTUNITY_MS = 510;
/** Counterfactual real-engine probe, kept outside AI timing/state. One basic attack followed by idle. */
export function probeMeleeOpportunity(character: CharacterType, scene: MeleeScenario, side: 1 | 2, map: MapId, seed: number, start: number) {
  vi.setSystemTime(start);
  const enemy = meleeEnemy(scene), other = side === 1 ? 2 : 1;
  const attack = (world: AIWorld) => keysForSide({ ...emptyAIKeys(), shift: world.now - start < 20 }, side);
  const runtime = { random: deterministicEngineRandom(seed), controllers: { [side]: attack, [other]: meleeOpponentController(scene, other, start) } };
  const game = renderHook(() => useGameEngine(CHARACTERS[side === 1 ? character : enemy], CHARACTERS[side === 2 ? character : enemy],
    2, () => {}, 'multi', false, 1, map, undefined, true, undefined, runtime));
  initializeMeleeScene(game.result.current.gameState, scene, side, start, map);
  act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
  try {
    for (let tick = 0; tick < 30 && game.result.current.gameState.isRoundActive; tick++) act(() => { vi.advanceTimersByTime(17); });
    const metrics = game.result.current.gameState.diagnostics!;
    const damage = metrics.effectiveDamage[side - 1], receivedDamage = metrics.receivedDamage[side - 1];
    return { eligible: damage > 0 && receivedDamage === 0, windowMs: MELEE_OPPORTUNITY_MS, oracleDamage: damage, oracleReceivedDamage: receivedDamage };
  } finally { game.unmount(); cleanup(); vi.clearAllTimers(); vi.setSystemTime(start); }
}
