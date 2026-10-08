import { ARENA, PLAYER_SIZE, type CharacterType, type Player } from '@/types/game';
import { GRAVITY, JUMP_FORCE, type Platform } from '@/types/platform';
import type { HazardZone } from '@/types/projectile';
import { clampPlayerX, FLOOR_Y, playerMoveSpeed } from '@/types/combatPhysics';
import { overlapsPlayer, type AIFrame } from './world';
import { createAIMemory, type AIMemory, type Strategy } from './state';
import { matchupTactics } from './matchup';
import { NEUTRAL_AI_TRAITS, type AITraits } from '@/types/ai';

export interface Point { x: number; y: number }
export const isMelee = (id: CharacterType) => id === 'gladiator' || id === 'ninja' || id === 'reaper';
export const support = (point: Point, platforms: readonly Platform[]) => platforms.find(p =>
  Math.abs(point.y + PLAYER_SIZE - p.y) < 12 && point.x + PLAYER_SIZE > p.x && point.x < p.x + p.width);
export function hazardRisk(point: Point, zone: HazardZone) {
  if (zone.type === 'tesla-coil') {
    const distance = Math.hypot(point.x + PLAYER_SIZE / 2 - zone.x - zone.width / 2, point.y + PLAYER_SIZE / 2 - zone.y - zone.height / 2);
    const nearExplosion = (zone.health ?? 240) < (zone.maxHealth ?? 240) * 0.08;
    return distance < (nearExplosion ? 165 : zone.attackRange ?? 225) + 12 ? nearExplosion ? 320 : 180 : 0;
  }
  if (!overlapsPlayer(point, zone, 8)) return 0;
  return zone.isNapalm ? Math.max(120, zone.damage * 1000 / zone.tickRate * 12) : zone.type === 'packet-block-zone' ? 65 : zone.type === 'bear-trap' ? 180 : zone.type === 'blizzard' ? 160 : 120;
}

// Geometry is immutable for a map. Cache minimum speeds, not character reachability.
const graphCache = new WeakMap<readonly Platform[], Map<string, { platform: Platform; minimumSpeed: number }[]>>();
function minimumSpeed(from: Point, to: Platform) {
  const discriminant = JUMP_FORCE * JUMP_FORCE - 2 * GRAVITY * (from.y + PLAYER_SIZE - to.y);
  if (discriminant < 0) return Infinity;
  const flightTime = (-JUMP_FORCE + Math.sqrt(discriminant)) / GRAVITY;
  const gap = Math.max(to.x + 8 - from.x - PLAYER_SIZE, from.x - (to.x + to.width - 8), 0);
  return gap / (flightTime * 0.9);
}
function graph(platforms: readonly Platform[]) {
  let result = graphCache.get(platforms);
  if (!result) {
    result = new Map(platforms.map(from => [from.id, platforms.filter(to => to !== from).map(platform => ({
      platform, minimumSpeed: minimumSpeed({ x: from.x + from.width / 2 - PLAYER_SIZE / 2, y: from.y - PLAYER_SIZE }, platform),
    }))]));
    graphCache.set(platforms, result);
  }
  return result;
}

export function navigationGoal(player: Player, target: Point, frame: AIFrame, preferred: number, avoid?: string): Point {
  const { platforms, mapId, now } = frame.world;
  const safe = platforms.filter(p => mapId !== 'volcano' || p.id !== 'ground');
  const current = support(player, safe), destination = support(target, safe);
  const dx = target.x - player.x;
  const basic = { x: Math.abs(Math.abs(dx) - preferred) < 20 ? player.x : clampPlayerX(target.x - (dx >= 0 ? 1 : -1) * preferred), y: target.y };
  if (player.isFlying && player.invulnerableDuration > 900) return { ...target };
  if (current && mapId === 'volcano' && target.y + PLAYER_SIZE >= 470) return { x: current.x + current.width / 2 - PLAYER_SIZE / 2, y: current.y - PLAYER_SIZE };
  if (current && destination?.id === current.id && Math.abs(player.y - target.y) < 65) {
    // A spacing goal must remain on this ledge, not on imaginary ground beside it.
    return { x: Math.max(current.x + 4, Math.min(current.x + current.width - PLAYER_SIZE - 4, basic.x)), y: basic.y };
  }
  if (Math.abs(player.y - target.y) < 65 && mapId !== 'volcano') return basic;
  const speed = playerMoveSpeed(player, now);
  const queue: { platform: Platform; first: Platform; cost: number }[] = [];
  const visited = new Set<string>(current ? [current.id] : []);
  for (const p of safe) {
    if (!visited.has(p.id) && p.id !== avoid && minimumSpeed(player, p) <= speed) {
      queue.push({ platform: p, first: p, cost: 0 }); visited.add(p.id);
    }
  }
  let best: Platform | undefined, score = Infinity;
  const geometry = graph(platforms);
  for (let i = 0; i < queue.length; i++) {
    const { platform, first, cost } = queue[i];
    const center = { x: platform.x + platform.width / 2 - PLAYER_SIZE / 2, y: platform.y - PLAYER_SIZE };
    const risk = frame.zones.reduce((sum, z) => sum + (z.ownerId !== player.id ? hazardRisk(center, z) : 0), 0);
    const distance = Math.abs(center.y - target.y) * 2 + Math.abs(center.x - target.x) * 0.2 + cost + risk;
    if (distance < score) { score = distance; best = first; }
    if (platform.id === destination?.id && !risk) { best = first; break; }
    for (const edge of geometry.get(platform.id) ?? []) {
      if (!visited.has(edge.platform.id) && edge.platform.id !== avoid && (mapId !== 'volcano' || edge.platform.id !== 'ground') && edge.minimumSpeed <= speed) {
        visited.add(edge.platform.id); queue.push({ platform: edge.platform, first, cost: cost + 8 + risk * 0.1 });
      }
    }
  }
  if (best) return { x: best.x + best.width / 2 - PLAYER_SIZE / 2, y: best.y - PLAYER_SIZE };
  if (mapId === 'volcano' && safe.length) {
    // Lava's bounce can reach a nearby low platform even with no grounded jump.
    const nearest = safe.reduce((a, b) => Math.abs(a.x + a.width / 2 - player.x) + Math.abs(a.y - player.y) < Math.abs(b.x + b.width / 2 - player.x) + Math.abs(b.y - player.y) ? a : b);
    return { x: nearest.x + nearest.width / 2 - PLAYER_SIZE / 2, y: nearest.y - PLAYER_SIZE };
  }
  return basic;
}

function zoneGoal(player: Player, zone: { x: number; y: number; width: number; height: number }, frame: AIFrame): Point | undefined {
  const surfaces = frame.world.platforms.filter(p => (frame.world.mapId !== 'volcano' || p.id !== 'ground') &&
    p.y > zone.y && p.y - PLAYER_SIZE < zone.y + zone.height && p.x < zone.x + zone.width && p.x + p.width > zone.x);
  if (!surfaces.length) return undefined;
  const platform = surfaces.reduce((a, b) => Math.abs(a.y - player.y - PLAYER_SIZE) < Math.abs(b.y - player.y - PLAYER_SIZE) ? a : b);
  return { x: clampPlayerX(Math.max(platform.x, Math.min(platform.x + platform.width - PLAYER_SIZE, zone.x + zone.width / 2 - PLAYER_SIZE / 2))), y: platform.y - PLAYER_SIZE };
}

export function selectGoal(player: Player, opponent: Player, frame: AIFrame, previous?: AIMemory, characterWeight = 1, traits: AITraits = NEUTRAL_AI_TRAITS) {
  const { now, mapId, roundTimeRemaining } = frame.world;
  const memory = { ...(previous ?? createAIMemory(player, now)) };
  const character = player.character!;
  const distance = Math.hypot(player.x - opponent.x, player.y - opponent.y);
  const low = player.health < player.maxHealth * 0.35 * traits.recovery;
  const winningClock = roundTimeRemaining < 12 && player.health > opponent.health + 5;
  let strategy: Strategy = low || winningClock || opponent.isInvulnerable ? 'kite' : distance < character.attackRange ? 'pressure' : 'approach';
  let preferred = isMelee(character.id) ? character.attackRange * 0.65 : character.id === 'hunter' ? player.hunterFocusedDuration ? 240 : 180 : low ? 340 : 270;
  const genericPreferred = isMelee(character.id) ? character.attackRange * 0.65 : low ? 340 : 270;
  if (character.id === 'rocketeer') preferred = low ? 360 : 300;
  if (strategy === 'kite') preferred = Math.max(330, preferred);
  if (opponent.isFrozen || opponent.rootDuration > 0 || opponent.isStunned) { strategy = 'pressure'; preferred *= 0.8; }
  if (character.id === 'ice-mage' && opponent.freezeGauge >= 3) { strategy = 'pressure'; preferred = 210; }
  const matchup = matchupTactics(player, opponent, frame, preferred, strategy);
  preferred = characterWeight === 1 ? matchup.preferred : genericPreferred + (matchup.preferred - genericPreferred) * characterWeight;
  if (characterWeight >= 0.5) strategy = matchup.strategy;
  preferred *= traits.spacing;
  let target: Point = matchup.flank && characterWeight >= 0.5 ? matchup.flank : opponent;
  let direct = false;
  const zoneRisk = (p: Point) => frame.zones.reduce((r, z) => r + (z.ownerId !== player.id ? hazardRisk(p, z) : 0), 0);
  if (traits.recovery > 0 && (low || player.mana < character.skill.manaCost * traits.recovery)) {
    const recovery = frame.souls.map(zone => ({ zone, goal: zoneGoal(player, zone, frame) }))
      .filter(({ zone, goal }) => goal && now + 800 - zone.createdAt < zone.duration && zoneRisk(goal) < 60)
      .sort((a, b) => Math.hypot(a.goal!.x - player.x, a.goal!.y - player.y) - Math.hypot(b.goal!.x - player.x, b.goal!.y - player.y))[0];
    if (recovery?.goal && !(opponent.isInvulnerable && Math.hypot(recovery.goal.x - opponent.x, recovery.goal.y - opponent.y) < 150)) {
      strategy = 'recover'; target = recovery.goal; preferred = 0;
    }
  }
  if (characterWeight >= 0.5 && character.id === 'hacker' && strategy !== 'recover' && strategy !== 'flank') {
    const own = frame.zones.find(z => z.type === 'packet-block-zone' && z.ownerId === player.id && now + 400 - z.createdAt < z.duration);
    const position = own && zoneGoal(player, own, frame);
    if (position && zoneRisk(position) < 60 && Math.abs(position.y - opponent.y) < 80 && Math.abs(position.x - opponent.x) < character.attackRange) {
      target = position; preferred = 0;
    }
  }
  if (characterWeight >= 0.5 && character.id === 'reaper' && !player.isFlying) {
    const bat = frame.paths.find(p => p.projectile.ownerId === player.id && p.projectile.type === 'bat');
    if (bat && (bat.projectile.returnPhase === 'returning' || now - bat.projectile.createdAt > bat.projectile.lifetime * 0.25)) {
      if (bat.projectile.returnPhase === 'returning' && (bat.projectile.damageAccumulated > 0 || bat.projectile.hasHitReturn)) {
        const step = Math.min(bat.endStep, 18);
        const catchPoint = { x: clampPlayerX(bat.x[step] + bat.projectile.width / 2 - PLAYER_SIZE / 2), y: Math.min(FLOOR_Y, bat.y[step] + bat.projectile.height / 2 - PLAYER_SIZE / 2) };
        if (zoneRisk(catchPoint) < 60) { target = catchPoint; preferred = 0; }
      } else {
        target = { x: clampPlayerX(opponent.x + Math.sign(opponent.x - bat.projectile.x) * 100), y: opponent.y }; preferred = 0;
      }
    }
  }
  if (player.isFlying && player.invulnerableDuration <= 900) {
    const platforms = frame.world.platforms.filter(p => mapId !== 'volcano' || p.id !== 'ground');
    const p = platforms.reduce((a, b) => Math.hypot(a.x + a.width / 2 - player.x, a.y - PLAYER_SIZE - player.y) < Math.hypot(b.x + b.width / 2 - player.x, b.y - PLAYER_SIZE - player.y) ? a : b);
    target = { x: p.x + p.width / 2 - PLAYER_SIZE / 2, y: p.y - PLAYER_SIZE }; preferred = 0; direct = true;
  }
  // A clipped ranged spacing goal can pin the AI against a wall forever.
  // Cross toward free space when retreat room is exhausted, even if it can still shoot.
  if (!isMelee(character.id) && !player.isFlying && strategy !== 'recover' &&
      (player.x < ARENA.padding + 45 || player.x > ARENA.width - ARENA.padding - PLAYER_SIZE - 45) &&
      Math.abs(player.x - opponent.x) < preferred + 60 && now >= memory.escapeUntil) {
    memory.escapeUntil = now + 650;
    memory.goal = navigationGoal(player, { x: clampPlayerX(player.x + (player.x < ARENA.width / 2 ? 220 : -220)), y: player.y }, frame, 0);
  }
  const danger = zoneRisk(player) > 0 || frame.world.lightningStrikes.some(s => !s.struck && now - s.warningStart > 800 && Math.abs(player.x + PLAYER_SIZE / 2 - s.x) < 60);
  const escapeDanger = memory.goal && (zoneRisk(memory.goal) > 0 || frame.world.lightningStrikes.some(s => !s.struck &&
    now - s.warningStart > 800 && Math.abs(memory.goal!.x + PLAYER_SIZE / 2 - s.x) < 60));
  if (escapeDanger) { memory.escapeUntil = now; memory.goalUntil = 0; }
  const signature = `${frame.signature}:${strategy}:${Math.round(target.x / 50)}:${Math.round(target.y / 40)}:${support(player, frame.world.platforms)?.id}:${player.isFlying}:${player.rootDuration > 0}:${player.isSlowed}:${player.freezeGauge}:${opponent.isShielding}:${opponent.facingRight}:${opponent.isChargingSkill}:${opponent.archerBurstRemaining > 0}:${opponent.napalmDuration > 0}`;
  const reuse = memory.goal && now < memory.goalUntil && memory.goalSignature === signature && !danger;
  let goal = reuse ? memory.goal! :
    direct ? target : navigationGoal(player, target, frame, preferred, memory.failedPlatform);
  const remaining = Math.hypot(player.x - goal.x, player.y - goal.y);
  const immobilized = player.isStunned || player.isFrozen || player.rootDuration > 0;
  if (immobilized || remaining < 35 || memory.goalSignature !== signature || remaining < memory.bestDistance - 24) {
    memory.progressAt = now; memory.progressX = player.x; memory.progressY = player.y; memory.bestDistance = remaining;
  }
  if (memory.wasGrounded && !player.isGrounded) memory.jumpOrigin = { x: player.x, y: player.y };
  if (!memory.wasGrounded && player.isGrounded && memory.jumpOrigin) {
    if (Math.hypot(player.x - memory.jumpOrigin.x, player.y - memory.jumpOrigin.y) < 45 && remaining > 60) memory.failedJumps++;
    else memory.failedJumps = 0;
    memory.jumpOrigin = undefined;
  }
  if (!immobilized && ((remaining > 45 && now - memory.progressAt >= 1200) || memory.failedJumps >= 2)) {
    memory.escapeUntil = now + 600;
    memory.failedPlatform = support(goal, frame.world.platforms)?.id;
    memory.failedJumps = 0; memory.progressAt = now; memory.bestDistance = Infinity;
    const inward = player.x < ARENA.width / 2 ? 1 : -1;
    goal = navigationGoal(player, { x: clampPlayerX(player.x + inward * 180), y: FLOOR_Y }, frame, 0, memory.failedPlatform);
    memory.goal = goal;
  }
  if (now < memory.escapeUntil && !immobilized) { strategy = 'escape'; goal = memory.goal ?? goal; }
  else if (now >= memory.escapeUntil + 1500) memory.failedPlatform = undefined;
  memory.wasGrounded = player.isGrounded;
  memory.goal = goal;
  if (!reuse) memory.goalUntil = now + 200;
  memory.goalSignature = signature; memory.strategy = strategy;
  return { goal, memory, preferred, strategy };
}
