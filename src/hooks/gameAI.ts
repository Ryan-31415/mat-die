import { ARENA, PLAYER_SIZE, type Player, type CharacterType } from '@/types/game';
import { GRAVITY, JUMP_FORCE, MAX_FALL_SPEED, COYOTE_TIME, type Platform } from '@/types/platform';
import { checkProjectileCollision, type Projectile, type HazardZone } from '@/types/projectile';
import type { MapId } from '@/types/map';
import type { KeyboardState } from './useKeyboard';

type Direction = -1 | 0 | 1;
type Action = { direction: Direction; jump: boolean; drop: boolean };
type Lightning = { x: number; warningStart: number; struck: boolean };
type Point = { x: number; y: number };
const DT = 1 / 60;
const STEPS = 48;
const FLOOR = ARENA.height - ARENA.padding - PLAYER_SIZE;
const clampX = (x: number) => Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, x));
const melee = (id: CharacterType) => ['gladiator', 'ninja', 'reaper'].includes(id);
const overlaps = (a: Point, b: Point & { width: number; height: number }, margin = 0) =>
  a.x + PLAYER_SIZE + margin > b.x && a.x - margin < b.x + b.width &&
  a.y + PLAYER_SIZE + margin > b.y && a.y - margin < b.y + b.height;

function moveSpeed(player: Player) {
  let speed = player.character!.speed * 75 * (1 + player.speedBoost);
  if (player.isSlowed) speed *= 1 - player.slowAmount;
  speed *= Math.max(0, 1 - player.freezeGauge * 0.1);
  if (player.isChargingSkill) speed *= 0.6;
  if (player.isShielding) speed *= 0.5;
  return player.rootDuration > 0 ? 0 : speed;
}

function support(point: Point, platforms: Platform[]) {
  return platforms.find(p => Math.abs(point.y + PLAYER_SIZE - p.y) < 12 &&
    point.x + PLAYER_SIZE > p.x && point.x < p.x + p.width);
}

// Use the same gravity and one-way landing rules as the engine. No imaginary double jump.
function advance(point: Point, vy: number, platforms: Platform[]) {
  let y = point.y + vy * DT;
  for (const p of platforms) {
    if (point.x + PLAYER_SIZE <= p.x || point.x >= p.x + p.width) continue;
    if (vy >= 0 && point.y + PLAYER_SIZE <= p.y + (p.type === 'one-way' ? 10 : 0) && y + PLAYER_SIZE >= p.y) {
      y = p.y - PLAYER_SIZE;
      vy = 0;
      break;
    }
    if (p.type === 'solid' && vy < 0 && point.y >= p.y + p.height && y < p.y + p.height) {
      y = p.y + p.height;
      vy = 0;
      break;
    }
  }
  return { y: Math.max(ARENA.padding, Math.min(FLOOR, y)), vy: y >= FLOOR ? 0 : vy };
}

function hazardRisk(point: Point, zone: HazardZone) {
  if (zone.type === 'tesla-coil') {
    return Math.hypot(point.x + PLAYER_SIZE / 2 - zone.x - zone.width / 2,
      point.y + PLAYER_SIZE / 2 - zone.y - zone.height / 2) < (zone.attackRange ?? 150) + 12 ? 180 : 0;
  }
  if (!overlaps(point, zone, 8)) return 0;
  return zone.type === 'packet-block-zone' ? 65 : zone.type === 'bear-trap' ? 180 : 120;
}

// Pick a reachable first step, then search the platform graph for a route to the target.
function navigationGoal(player: Player, opponent: Player, platforms: Platform[], mapId: MapId, preferred: number): Point {
  const safePlatforms = platforms.filter(p => mapId !== 'volcano' || p.id !== 'ground');
  const current = support(player, safePlatforms);
  const target = support(opponent, safePlatforms);
  const dx = opponent.x - player.x;
  const basicGoal = {
    x: Math.abs(Math.abs(dx) - preferred) < 20 ? player.x : clampX(opponent.x - (dx >= 0 ? 1 : -1) * preferred),
    y: opponent.y,
  };
  if (player.isFlying) return { x: opponent.x, y: opponent.y };
  if (current && mapId === 'volcano' && opponent.y + PLAYER_SIZE >= 470) {
    return { x: current.x + current.width / 2 - PLAYER_SIZE / 2, y: current.y - PLAYER_SIZE };
  }
  if (current && (!target || target.id === current.id) && Math.abs(player.y - opponent.y) < 65) return basicGoal;
  if (Math.abs(player.y - opponent.y) < 65 && mapId !== 'volcano') return basicGoal;

  const speed = moveSpeed(player);
  const reachable = (from: Point, to: Platform) => {
    const rise = from.y + PLAYER_SIZE - to.y;
    const discriminant = JUMP_FORCE * JUMP_FORCE - 2 * GRAVITY * rise;
    if (discriminant < 0) return false;
    const flightTime = (-JUMP_FORCE + Math.sqrt(discriminant)) / GRAVITY;
    const gap = Math.max(to.x + 8 - from.x - PLAYER_SIZE, from.x - (to.x + to.width - 8), 0);
    return gap <= speed * flightTime * 0.9;
  };
  const queue: { platform: Platform; first: Platform }[] = [];
  const visited = new Set<string>(current ? [current.id] : []);
  for (const p of safePlatforms) {
    if (!visited.has(p.id) && reachable(player, p)) {
      queue.push({ platform: p, first: p });
      visited.add(p.id);
    }
  }
  let best: Platform | undefined;
  let bestDistance = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const { platform, first } = queue[i];
    const center = { x: platform.x + platform.width / 2 - PLAYER_SIZE / 2, y: platform.y - PLAYER_SIZE };
    const distance = Math.abs(center.y - opponent.y) * 2 + Math.abs(center.x - opponent.x) * 0.2;
    if (distance < bestDistance) { bestDistance = distance; best = first; }
    if (platform.id === target?.id) { best = first; break; }
    for (const next of safePlatforms) {
      if (!visited.has(next.id) && reachable(center, next)) {
        visited.add(next.id);
        queue.push({ platform: next, first });
      }
    }
  }
  if (best) return { x: best.x + best.width / 2 - PLAYER_SIZE / 2, y: best.y - PLAYER_SIZE };
  return basicGoal;
}

/** Pure, deterministic controller shared by the single-player opponent and clones. */
export function getAIKeys(
  player: Player, opponent: Player, projectiles: Projectile[], hazards: HazardZone[],
  platforms: Platform[], isOvertime: boolean, now: number, mapId: MapId = 'default', lightning: Lightning[] = [],
): KeyboardState {
  const keys: KeyboardState = {
    a: false, d: false, w: false, s: false, space: false, f: false, g: false, h: false,
    arrowLeft: false, arrowRight: false, arrowUp: false, arrowDown: false, enter: false, shift: false, backslash: false,
  };
  if (!player.character || player.health <= 0 || opponent.health <= 0 || player.isStunned || player.isFrozen) return keys;
  const character = player.character;
  const id = character.id;
  const dx = opponent.x - player.x;
  const dy = opponent.y - player.y;
  const distance = Math.hypot(dx, dy);
  const toward: Direction = dx >= 0 ? 1 : -1;
  const speed = moveSpeed(player);
  const lowHealth = player.health < player.maxHealth * 0.35;
  const combatDistance = melee(id) ? character.attackRange * 0.65 : id === 'hunter' ? 150 : lowHealth ? 360 : 290;
  const preferred = opponent.isInvulnerable ? Math.max(300, combatDistance) : combatDistance;
  const goal = navigationGoal(player, opponent, platforms, mapId, preferred);
  const hostileZones = hazards.filter(z => z.ownerId !== player.id && now - z.createdAt <= z.duration);
  const hostileProjectiles = projectiles.filter(p => p.ownerId !== player.id && now - p.createdAt <= p.lifetime);
  const warnings = lightning.filter(s => !s.struck && now - s.warningStart <= 1500);
  const canJump = !player.isJumping && (player.isGrounded || now - player.lastGroundedTime < COYOTE_TIME);
  const currentPlatform = support(player, platforms);
  const pendingPools: { x: number; y: number; width: number; height: number; impactTime: number }[] = [];
  for (const p of hostileProjectiles) {
    if (!p.createsFirePool && p.type !== 'blizzard-stone') continue;
    let previous = { x: p.x, y: p.y };
    for (let step = 1; step <= STEPS; step++) {
      const t = step * DT;
      if (now + t * 1000 - p.createdAt > p.lifetime) break;
      const position = { x: p.x + p.velocityX * t, y: p.y + p.velocityY * t + (p.hasGravity ? p.gravity : 0) * t * t / 2 };
      const platform = p.hasGravity ? platforms.find(surface => checkProjectileCollision({ ...position, width: p.width, height: p.height }, previous, surface)) : undefined;
      if (platform || position.y > ARENA.height) {
        const size = p.type === 'flask' ? 140 : p.type === 'blizzard-stone' ? 400 : 200;
        let x = position.x + p.width / 2 - size / 2;
        if (platform && p.type === 'flask') x = Math.max(platform.x, Math.min(x, platform.x + platform.width - size));
        pendingPools.push({ x, y: (platform?.y ?? position.y + p.height / 2) - size / 2, width: size, height: size, impactTime: t });
        break;
      }
      previous = position;
    }
  }

  function evaluate(action: Action) {
    const point = { x: player.x, y: player.y };
    let vy = action.jump && canJump ? JUMP_FORCE : player.velocityY;
    let risk = 0;
    let travelCost = 0;
    const movementDirection = player.isFlying && action.direction === 0 ? (player.facingRight ? 1 : -1) : action.direction;
    const approachesGoal = movementDirection !== 0 && Math.sign(goal.x - player.x) === movementDirection;
    const hitProjectiles = new Set<string>();
    if (action.drop && currentPlatform?.type === 'one-way' && !player.isJumping) {
      point.y += 25;
      vy = 300;
    }
    for (let step = 1; step <= STEPS; step++) {
      const t = step * DT;
      // Replanning happens every tick: stop at the waypoint instead of predicting an overshoot.
      const movement = movementDirection * speed * DT / (player.isFlying && (action.jump || action.drop) ? Math.SQRT2 : 1);
      point.x = clampX(point.x + (approachesGoal && !player.isFlying && movementDirection * (goal.x - point.x) <= Math.abs(movement)
        ? goal.x - point.x : movement) + player.knockbackVelocityX * DT * Math.pow(0.9, step));
      if (player.isFlying) {
        point.y = Math.max(ARENA.padding, Math.min(FLOOR, point.y + (action.jump ? -1 : action.drop ? 1 : 0) * speed * DT / Math.SQRT2));
      } else {
        vy = Math.min(MAX_FALL_SPEED, vy + GRAVITY * DT);
        const next = advance(point, vy + player.knockbackVelocityY * Math.pow(0.9, step), platforms);
        point.y = next.y;
        vy = next.vy;
      }
      travelCost += (Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y) * 1.3) / STEPS;
      if (mapId === 'volcano' && point.y >= FLOOR - 1 && !player.isInvulnerable) risk += 1600 / STEPS;
      for (const zone of hostileZones) {
        if (now + t * 1000 - zone.createdAt <= zone.duration) risk += hazardRisk(point, zone) / STEPS;
      }
      for (const strike of warnings) {
        if (Math.abs(point.x + PLAYER_SIZE / 2 - strike.x) < 55) risk += 220 / STEPS;
      }
      for (const pool of pendingPools) {
        if (t >= pool.impactTime && overlaps(point, pool, 8)) risk += 160 / STEPS;
      }
      for (const p of hostileProjectiles) {
        if (hitProjectiles.has(p.id) || now + t * 1000 - p.createdAt > p.lifetime) continue;
        const gravity = p.hasGravity ? p.gravity : 0;
        // The engine moves players first, then sweeps projectiles against their new positions.
        const projectileAt = (time: number) => ({ x: p.x + p.velocityX * time, y: p.y + p.velocityY * time + gravity * time * time / 2 });
        const before = projectileAt(t - DT);
        const after = projectileAt(t);
        // Most shots never intersect this candidate's path; skip the precise sweep cheaply.
        if (Math.max(before.x, after.x) + p.width < point.x || Math.min(before.x, after.x) > point.x + PLAYER_SIZE ||
          Math.max(before.y, after.y) + p.height < point.y || Math.min(before.y, after.y) > point.y + PLAYER_SIZE) continue;
        if (checkProjectileCollision({ ...after, width: p.width, height: p.height }, before,
          { ...point, width: PLAYER_SIZE, height: PLAYER_SIZE })) {
          risk += (100 + p.damage * (isOvertime ? 4 : 2)) * (1 - t * 0.4);
          hitProjectiles.add(p.id);
        }
      }
    }
    return { action, risk, score: risk * (lowHealth ? 1.4 : 1) + travelCost * 0.16 + (action.jump ? 7 : 0) + (action.drop ? 3 : 0) + (action.direction ? 0.5 : 0) };
  }

  const candidates: Action[] = [];
  for (const direction of [0, -1, 1] as Direction[]) {
    candidates.push({ direction, jump: false, drop: false });
    if (canJump || player.isFlying) candidates.push({ direction, jump: true, drop: false });
    if (player.isFlying || (currentPlatform?.type === 'one-way' && dy > 60 && !player.isJumping)) candidates.push({ direction, jump: false, drop: true });
  }
  const ranked = candidates.map(evaluate).sort((a, b) => a.score - b.score);
  const chosen = { ...ranked[0].action };
  const standingRisk = ranked.find(c => c.action.direction === 0 && !c.action.jump && !c.action.drop)!.risk;
  const threatened = standingRisk > 35;

  // Attacks may turn a stationary player, but never reverse an escape or walk off a safe ledge.
  let facingTarget = chosen.direction === toward || (chosen.direction === 0 && player.facingRight === (toward === 1));
  if (!facingTarget && chosen.direction === 0 && !threatened) {
    const turn = evaluate({ ...chosen, direction: toward });
    if (turn.risk <= ranked[0].risk + 1) { chosen.direction = toward; facingTarget = true; }
  }
  const targetVulnerable = !opponent.isInvulnerable && !opponent.isEvading;
  const targetShieldFacingUs = opponent.isShielding && opponent.facingRight === (dx < 0);
  const targetY = (time: number) => {
    const point = { x: opponent.x, y: opponent.y };
    let vy = opponent.velocityY;
    if (opponent.isGrounded || opponent.isFlying) return opponent.y + (opponent.isFlying ? vy * time : 0);
    for (let t = 0; t < time; t += DT) {
      vy = Math.min(MAX_FALL_SPEED, vy + GRAVITY * DT);
      const next = advance(point, vy, platforms);
      point.y = next.y; vy = next.vy;
    }
    return point.y;
  };
  const canHit = (projectileSpeed: number, verticalSpeed = 0, gravity = 0, tolerance = 30, range = character.attackRange) => {
    if (Math.abs(dx) > range + PLAYER_SIZE / 2) return false;
    const time = Math.max(0, Math.abs(dx) - PLAYER_SIZE / 2) / projectileSpeed;
    const shotY = player.y + PLAYER_SIZE / 2 + verticalSpeed * time + gravity * time * time / 2;
    return Math.abs(shotY - targetY(time) - PLAYER_SIZE / 2) < tolerance;
  };
  let attack = false;
  if (facingTarget && targetVulnerable && player.attackCooldownRemaining <= 0) {
    if (melee(id)) attack = Math.abs(dx) < character.attackRange + PLAYER_SIZE - 6 && Math.abs(dy) < PLAYER_SIZE - 4;
    else if (!targetShieldFacingUs) {
      if (id === 'archer') attack = canHit(player.buffDuration > 0 ? 1400 : 1000, -80, 190);
      else if (id === 'scientist') attack = canHit(640, -105, 220);
      else if (id === 'hunter') attack = canHit(1250, 0, 0, 35, player.hunterFocusedDuration ? 350 : 275);
      else attack = canHit(id === 'mage' ? 780 : id === 'hacker' ? 800 : 700);
    }
  }

  let skill = false;
  let ultimate = false;
  const canCast = !player.isSilenced && !player.isClone;
  // Ultimate intent is exclusive: skills are processed first by the engine and would spend its mana.
  if (canCast && player.mana >= character.ultimate.manaCost && !player.isChargingSkill && targetVulnerable) {
    switch (id) {
      case 'gladiator': ultimate = player.buffDuration <= 0 && (distance < 240 || (lowHealth && threatened)); break;
      case 'archer': ultimate = player.buffDuration <= 0 && Math.abs(dy) < 100 && distance < 650; break;
      case 'mage': ultimate = player.mageUltimateDuration <= 0 && distance < 420; break;
      case 'ninja': ultimate = !player.isInvisible && (distance < 350 || threatened); break;
      case 'scientist': ultimate = distance < 200 && !hazards.some(z => z.ownerId === player.id && z.type === 'tesla-coil' && now - z.createdAt < z.duration); break;
      case 'hunter': ultimate = (player.hunterFocusedDuration ?? 0) <= 0 && Math.abs(dy) < 65 && distance < 340; break;
      case 'reaper': ultimate = !player.isFlying && (distance < 300 || (lowHealth && threatened)); break;
      case 'ice-mage': ultimate = facingTarget && canHit(600, -100, 600, 100, 450); break;
      case 'hacker': ultimate = !opponent.isHacked && distance < 600; break;
    }
  }
  if (canCast && !ultimate && player.mana >= character.skill.manaCost && player.skillCooldownRemaining <= 0) {
    switch (id) {
      case 'gladiator': skill = player.mana >= 5 && facingTarget && (threatened || (melee(opponent.character!.id) && distance < 140 && opponent.attackCooldownRemaining < 180)); break;
      case 'archer': skill = player.poisonArrowsRemaining === 0 && distance < 650 && targetVulnerable; break;
      case 'mage': skill = targetVulnerable && (opponent.isGrounded || opponent.isFrozen || opponent.isStunned || Math.abs(opponent.velocityY) < 180); break;
      case 'ninja': {
        const landing = { x: clampX(player.x + toward * 280), y: player.y };
        const safeLanding = mapId !== 'volcano' || platforms.some(p => p.id !== 'ground' && landing.x + PLAYER_SIZE > p.x && landing.x < p.x + p.width && p.y >= landing.y + PLAYER_SIZE && p.y < FLOOR);
        skill = facingTarget && Math.abs(dy) < 65 && Math.abs(dx) > 190 && Math.abs(dx) < 460 && safeLanding &&
          hostileZones.every(z => hazardRisk(landing, z) === 0) && warnings.every(s => Math.abs(landing.x + PLAYER_SIZE / 2 - s.x) >= 55);
        break;
      }
      case 'scientist': {
        const charge = now - (player.skillChargeStartTime ?? now);
        const shot = facingTarget && targetVulnerable && canHit(850, 0, 0, 40, 650);
        skill = player.isChargingSkill
          ? charge < 3500 && !(shot && charge >= 1500) && !threatened
          : shot && !threatened;
        break;
      }
      case 'hunter': skill = facingTarget && targetVulnerable && !(opponent.isMarked && opponent.markOwnerId === player.id) && canHit(750, -115, 360, 45, 500); break;
      case 'reaper': skill = facingTarget && targetVulnerable && canHit(550, 0, 0, 55, 550); break;
      case 'ice-mage': skill = facingTarget && targetVulnerable && !targetShieldFacingUs && canHit(920, 0, 0, 65, 600); break;
      case 'hacker': skill = facingTarget && Math.abs(dy) < 130 && Math.abs(dx) < 340 && !hazards.some(z => z.ownerId === player.id && z.type === 'packet-block-zone' && now - z.createdAt < z.duration); break;
    }
  }

  // Translate desired world movement through Hacker's input inversion, for both player IDs.
  const direction = player.isHacked ? -chosen.direction : chosen.direction;
  const jump = player.isHacked ? chosen.drop : chosen.jump;
  const drop = player.isHacked ? chosen.jump : chosen.drop;
  if (player.id === 2) {
    keys.arrowLeft = direction < 0; keys.arrowRight = direction > 0;
    keys.arrowUp = jump; keys.arrowDown = drop;
    keys.shift = attack; keys.enter = skill; keys.backslash = ultimate;
  } else {
    keys.a = direction < 0; keys.d = direction > 0;
    keys.w = jump; keys.s = drop;
    keys.f = attack; keys.g = skill; keys.h = ultimate;
  }
  return keys;
}
