import { CHARACTERS, PLAYER_SIZE, createInitialPlayer, type Player } from '@/types/game';
import type { AIParameters } from '@/types/ai';
import type { Projectile, HazardZone, AttackHitbox } from '@/types/projectile';
import type { AIWorld } from './world';
import { estimateNumber } from './estimation';
import { playerMoveSpeed, ROCKET_EXPLOSION_RADIUS } from '@/types/combatPhysics';
import { GRAVITY, MAX_FALL_SPEED } from '@/types/platform';

export interface PerceptionMemory {
  last?: AIWorld;
  traps: { zone: HazardZone; lastSeenAt: number; expiresAt: number }[];
}
export const createPerceptionMemory = (): PerceptionMemory => ({ traps: [] });
const tenthSecond = (ms: number) => Math.max(0, Math.round(ms / 100) * 100);
const durations: Record<HazardZone['type'], number> = {
  'fire-pool': 4000, 'toxic-pool': 3200, 'tesla-coil': 30000, 'electric-explosion': 500,
  'bear-trap': 10000, blizzard: 5000, 'fire-ring': 5000, 'packet-block-zone': 5000,
};

function visiblePlayer(raw: Player, world: AIWorld, previous: AIWorld | undefined, parameters: AIParameters, random: () => number, inferred: Player[]): Player {
  const now = world.now;
  const character = raw.character ? CHARACTERS[raw.character.id] : null;
  const old = previous?.players[raw.id - 1];
  const dt = previous ? (now - previous.now) / 1000 : 0;
  const estimate = parameters.estimation.movement.mode === 'estimated';
  // Construct from public defaults instead of copying engine fields and trying to blacklist them.
  const p = createInitialPlayer(raw.id, character);
  p.createdAt = now; p.lastGroundedTime = now;
  p.x = raw.x; p.y = raw.y; p.facingRight = raw.facingRight;
  p.isGrounded = world.platforms.some(s => Math.abs(p.y + PLAYER_SIZE - s.y) < 2 && p.x + PLAYER_SIZE > s.x && p.x < s.x + s.width);
  p.isJumping = !p.isGrounded;
  p.lastGroundedTime = p.isGrounded ? now : old?.lastGroundedTime ?? now - 1000;
  if (estimate && dt > 0 && dt <= 1.1 && old) {
    p.velocityX = (p.x - old.x) / dt;
    p.velocityY = (p.y - old.y) / dt;
  }
  const own = raw.id === 2;
  if (own || parameters.information.health) {
    p.health = Math.floor(raw.health); p.maxHealth = raw.maxHealth;

  }
  if (own || parameters.information.mana) { p.mana = Math.floor(raw.mana); p.maxMana = raw.maxMana; }
  p.isAttacking = raw.isAttacking; p.isUsingSkill = raw.isUsingSkill; p.isUsingUltimate = raw.isUsingUltimate;
  if (own || parameters.information.skillCooldowns) {
    const cooldown = character?.skill.cooldown ?? 0;
    p.skillCooldownRemaining = cooldown ? Math.round(raw.skillCooldownRemaining / cooldown * 100) / 100 * cooldown : 0;
  }
  // Basic attack cooldown is not displayed. Infer it from observed attack animation onsets.
  p.attackCooldownRemaining = parameters.estimation.cooldowns.mode === 'estimated'
    ? p.isAttacking && !old?.isAttacking ? character?.attackCooldown ?? 0 : Math.max(0, (old?.attackCooldownRemaining ?? 0) - dt * 1000)
    : 0;
  if (own || parameters.information.statuses) {
    for (const key of ['isShielding', 'isPoisoned', 'isSlowed', 'isStunned', 'isInvisible', 'isFrozen', 'isBurning', 'isMarked', 'isSilenced', 'isHacked', 'isFlying', 'isDashing'] as const) p[key] = raw[key];
    for (const key of ['poisonDuration', 'slowDuration', 'stunDuration', 'invisibleDuration', 'frozenDuration', 'burnDuration', 'buffDuration', 'regenDuration', 'mageUltimateDuration', 'napalmDuration', 'markDuration', 'hunterFocusedDuration', 'silenceDuration', 'hackedDuration', 'invulnerableDuration'] as const) p[key] = tenthSecond(raw[key] ?? 0);
    // Root is shown as an icon rather than a countdown.
    p.rootDuration = raw.rootDuration > 0 ? 100 : 0;
    p.freezeGauge = raw.freezeGauge; p.dodgesRemaining = raw.dodgesRemaining;
    p.poisonArrowsRemaining = raw.poisonArrowsRemaining;
    p.archerBurstRemaining = raw.archerBurstRemaining ?? 0;
    p.isInvulnerable = p.invulnerableDuration > 0 && (p.isFlying || character?.id !== 'reaper');
    p.isChargingSkill = raw.isChargingSkill;
    if (p.isChargingSkill) {
      // Read the visible charge bar to 2%, then keep its observed onset after the bar fills.
      const ratio = Math.round(Math.min(1, (now - (raw.skillChargeStartTime ?? now)) / 1750) * 50) / 50;
      p.skillChargeStartTime = ratio < 1 ? now - ratio * 1750 : old?.skillChargeStartTime ?? now - 1750;
    }
    if (parameters.estimation.effects.mode === 'estimated') {
      p.slowAmount = p.isSlowed ? 0.33 : 0;
      p.speedBoost = p.isInvisible ? 0.5 : character?.id === 'gladiator' && p.buffDuration > 0 ? 0.25 : 0;
      p.damageBoost = p.buffDuration > 0 || p.isInvisible || p.mageUltimateDuration > 0 ? 0.3 : 0;
      if (character?.id === 'gladiator' && p.buffDuration > 0) {
        p.damageBoost = 0.33; p.damageReduction = 0.2; p.healthRegen = p.maxHealth * 0.03;
      }
      if (p.isFlying && character?.id === 'reaper') p.speedBoost = 0.7;
      p.markOwnerId = p.isMarked ? (raw.id === 1 ? 2 : 1) : undefined;
    }
  }

  const timers = ['poisonDuration', 'slowDuration', 'stunDuration', 'invisibleDuration', 'frozenDuration', 'burnDuration', 'buffDuration', 'regenDuration', 'mageUltimateDuration', 'napalmDuration', 'rootDuration', 'invulnerableDuration', 'evadeDuration', 'markDuration', 'hunterFocusedDuration', 'silenceDuration', 'hackedDuration', 'archerBurstCooldown'] as const;
  if (!own && !parameters.information.attackCooldowns) p.attackCooldownRemaining = 0;
  if (!own && !parameters.information.statusTimers) {
    for (const key of timers) p[key] = 0;
    p.skillChargeStartTime = p.isChargingSkill ? now : undefined;
  }
  if (estimate && old && dt > 0 && dt <= 1.1) {
    const normalSpeed = p.isStunned || p.isFrozen || p.rootDuration > 0 ? 0 : playerMoveSpeed(p, now);
    p.knockbackVelocityX = Math.sign(p.velocityX) * Math.max(0, Math.abs(p.velocityX) - normalSpeed);
    const hit = p.health < old.health || (p.isStunned && !old.isStunned);
    const vertical = old.isGrounded ? 0 : Math.min(MAX_FALL_SPEED, old.velocityY + GRAVITY * dt);
    p.knockbackVelocityY = hit ? p.velocityY - vertical : (old.knockbackVelocityY ?? 0) * Math.pow(0.9, dt * 1000 / 16);
    p.velocityX -= p.knockbackVelocityX;
    p.velocityY -= p.knockbackVelocityY;
  }
  // Keep observation-derived values before noise so later observations do not compound it.
  inferred.push({ ...p });
  // Exact groups grant only their own fields. Information masks are applied last.
  for (const key of ['velocityX', 'velocityY', 'knockbackVelocityX', 'knockbackVelocityY'] as const) {
    const e = parameters.estimation.movement;
    p[key] = e.mode === 'exact' ? raw[key] : estimateNumber(p[key], e, random, 1, true);
  }
  if (parameters.estimation.movement.mode === 'exact') {
    p.isGrounded = raw.isGrounded; p.isJumping = raw.isJumping; p.lastGroundedTime = raw.lastGroundedTime; p.canDoubleJump = raw.canDoubleJump;
  }
  const cooldowns = parameters.estimation.cooldowns;
  for (const key of ['attackCooldownRemaining', 'skillCooldownRemaining'] as const) p[key] = cooldowns.mode === 'exact' ? raw[key] : estimateNumber(p[key], cooldowns, random);
  const duration = parameters.estimation.durations;
  for (const key of timers) p[key] = duration.mode === 'exact' ? raw[key] : estimateNumber(p[key] ?? 0, duration, random);
  if (p.isChargingSkill) p.skillChargeStartTime = duration.mode === 'exact' ? raw.skillChargeStartTime : now - estimateNumber(now - (p.skillChargeStartTime ?? now), duration, random);
  const effects = parameters.estimation.effects;
  for (const key of ['slowAmount', 'speedBoost', 'damageBoost', 'damageReduction', 'healthRegen'] as const) p[key] = effects.mode === 'exact' ? raw[key] : estimateNumber(p[key], effects, random, key === 'healthRegen' ? p.maxHealth / 100 : 0.01);
  if (effects.mode === 'exact') { p.markOwnerId = raw.markOwnerId; p.burnOwner = raw.burnOwner; p.burnDamagePerTick = raw.burnDamagePerTick; }
  if (parameters.estimation.properties.mode === 'exact') { p.isEvading = raw.isEvading; p.isInvulnerable = raw.isInvulnerable; }
  const allExact = Object.values(parameters.estimation).every(e => e.mode === 'exact');
  if ((own || parameters.information.health) && allExact) p.health = raw.health;
  if ((own || parameters.information.mana) && allExact) p.mana = raw.mana;
  if (!own && !parameters.information.attackCooldowns) p.attackCooldownRemaining = 0;
  if (!own && !parameters.information.skillCooldowns) p.skillCooldownRemaining = 0;
  if (!own && !parameters.information.statusTimers) {
    for (const key of timers) p[key] = 0;
    p.skillChargeStartTime = p.isChargingSkill ? now : undefined;
  }
  if (!own && !parameters.information.statuses) {
    const clean = createInitialPlayer(raw.id, character);
    for (const key of ['isShielding', 'isPoisoned', 'isSlowed', 'isStunned', 'isInvisible', 'isFrozen', 'isBurning', 'isMarked', 'isSilenced', 'isHacked', 'isFlying', 'isDashing', 'isInvulnerable', 'isEvading', 'isChargingSkill'] as const) p[key] = clean[key];
    for (const key of ['slowAmount', 'speedBoost', 'damageBoost', 'damageReduction', 'healthRegen', 'freezeGauge', 'dodgesRemaining', 'poisonArrowsRemaining', 'archerBurstRemaining', 'burnDamagePerTick'] as const) p[key] = clean[key];
    p.markOwnerId = undefined; p.burnOwner = null; p.skillChargeStartTime = undefined;
  }
  return p;
}

function visibleProjectile(p: Projectile, world: AIWorld, previous: AIWorld | undefined, parameters: AIParameters, random: () => number): Projectile {
  const old = previous?.projectiles.find(s => s.id === p.id);
  const dt = previous ? (world.now - previous.now) / 1000 : 0;
  const speeds: Record<Projectile['type'], number> = {
    arrow: 1000, 'poison-arrow': 1000, fireball: 780, 'large-fireball': 750, flask: 640, 'electric-orb': 850,
    meteor: 750, bullet: 1250, 'super-bullet': 1562.5, bat: 550, snowball: 700, 'large-snowball': 920,
    'blizzard-stone': 600, net: 750, 'hacker-missile': 800, hacking: 0, rocket: 550, 'homing-rocket': 660,
  };
  const estimate = parameters.estimation.properties.mode === 'estimated';
  // Orientation is rendered for arrows and bats. Speed magnitude comes from displacement, never the engine velocity.
  const angle = ['arrow', 'poison-arrow', 'bat', 'rocket', 'homing-rocket'].includes(p.type) ? Math.atan2(p.velocityY, p.velocityX) : p.ownerId === 1 ? 0 : Math.PI;
  const velocityX = estimate ? old && dt > 0 ? (p.x - old.x) / dt : Math.cos(angle) * speeds[p.type] : 0;
  const velocityY = estimate ? old && dt > 0 ? (p.y - old.y) / dt : Math.sin(angle) * speeds[p.type] : 0;
  const gravity = estimate ? p.type === 'arrow' || p.type === 'poison-arrow' ? 190 : p.type === 'flask' ? 220 : p.type === 'net' ? 360 : p.type === 'blizzard-stone' ? 600 : 0 : 0;
  const lifetime = p.type === 'bullet' || p.type === 'super-bullet' ? 240 : p.type === 'bat' ? 3600 : p.type === 'large-snowball' ? 1400 : p.type === 'net' ? 3500 : 3000;
  const observed: Projectile = {
    id: p.id, type: p.type, ownerId: p.ownerId, x: p.x, y: p.y, width: p.width, height: p.height,
    velocityX, velocityY, gravity, hasGravity: gravity > 0,
    damage: world.players[p.ownerId - 1].character ? CHARACTERS[world.players[p.ownerId - 1].character.id].attackDamage : 10,
    createdAt: old?.createdAt ?? world.now, lifetime,
    isExplosive: ['fireball', 'large-fireball', 'electric-orb', 'meteor', 'flask', 'rocket', 'homing-rocket'].includes(p.type), explosionRadius: ['rocket', 'homing-rocket'].includes(p.type) ? ROCKET_EXPLOSION_RADIUS : 50,
    isPoisonous: p.type === 'poison-arrow', poisonDuration: 5000, slowAmount: 0, slowDuration: 0, stunDuration: 0, knockback: 0,
    createsFirePool: p.type === 'large-fireball' || p.type === 'flask' || p.isNapalm === true, firePoolDuration: 4000,
    canBeDeflected: !['large-fireball', 'electric-orb', 'bat', 'net', 'meteor'].includes(p.type),
    isReturning: p.type === 'bat', returnPhase: estimate && old && Math.sign(velocityX) !== Math.sign(old.velocityX) ? 'returning' : old?.returnPhase ?? 'outbound',
    damageAccumulated: 0, hasHitForward: false, hasHitReturn: false, lastHitTime: {},
    chargeLevel: p.type === 'electric-orb' ? Math.round((p.chargeLevel ?? 0) * 10) / 10 : undefined,
    isHackUltimate: p.type === 'hacking',
    isNapalm: p.isNapalm === true,
  };
  if (p.type === 'rocket' || p.type === 'homing-rocket') {
    observed.initialSpeed = speeds[p.type];
    observed.flightTimeMs = Math.min(1000, Math.max(0, (Math.hypot(velocityX, velocityY) / speeds[p.type] - 1) / 0.6 * 1000));
    if (observed.isNapalm) {
      observed.firePoolDamage = observed.damage * 0.1;
      observed.burnDamage = observed.damage * 0.075;
    }
  }
  const properties = parameters.estimation.properties;
  for (const key of ['velocityX', 'velocityY', 'gravity', 'damage', 'explosionRadius', 'knockback', 'slowAmount', 'damageAccumulated', 'chargeLevel'] as const) {
    const base = key === 'velocityX' || key === 'velocityY' ? speeds[p.type] : key === 'gravity' ? gravity : observed[key] ?? 0;
    observed[key] = properties.mode === 'exact' ? p[key] : estimateNumber(observed[key] ?? 0, properties, random, Math.max(1, Math.abs(base)) / 100, key === 'velocityX' || key === 'velocityY');
  }
  if (properties.mode === 'exact') {
    observed.initialSpeed = p.initialSpeed; observed.flightTimeMs = p.flightTimeMs;
    observed.firePoolDamage = p.firePoolDamage; observed.burnDamage = p.burnDamage;
    observed.hasGravity = p.hasGravity; observed.isExplosive = p.isExplosive; observed.isPoisonous = p.isPoisonous;
    observed.createsFirePool = p.createsFirePool; observed.canBeDeflected = p.canBeDeflected;
    observed.isReturning = p.isReturning; observed.returnPhase = p.returnPhase; observed.hasHitForward = p.hasHitForward;
    observed.hasHitReturn = p.hasHitReturn; observed.isSwapMissile = p.isSwapMissile; observed.lastHitTime = { ...p.lastHitTime };
  }
  const duration = parameters.estimation.durations;
  for (const key of ['lifetime', 'poisonDuration', 'slowDuration', 'stunDuration', 'firePoolDuration'] as const) observed[key] = duration.mode === 'exact' ? p[key] : estimateNumber(observed[key], duration, random);
  if (duration.mode === 'exact') observed.createdAt = p.createdAt;
  return observed;
}

/** The only restricted-AI boundary that may read engine state. */

export function perceiveWorld(world: AIWorld, parameters: AIParameters, memory: PerceptionMemory, observationTime = world.now, random: () => number = () => 0.5): { world: AIWorld; memory: PerceptionMemory } {
  const inferred: Player[] = [];
  const players: [Player, Player] = [
    visiblePlayer(world.players[0], world, memory.last, parameters, random, inferred),
    visiblePlayer(world.players[1], world, memory.last, parameters, random, inferred),
  ];
  const projectiles = parameters.information.projectiles ? world.projectiles
    .filter(p => p.type !== 'hacking' || parameters.hiddenAttacks === 'exact')
    .map(p => visibleProjectile(p, world, memory.last, parameters, random)) : [];
  const remembers = parameters.hidden === 'temporary' || parameters.hidden === 'remembered';
  const traps = parameters.information.hazards && remembers
    ? memory.traps.filter(t => observationTime < t.expiresAt && (parameters.hidden !== 'temporary' || observationTime - t.lastSeenAt < parameters.hiddenMemoryMs))
      .map(t => ({ ...t, zone: { ...t.zone } })) : [];
  const hazards: HazardZone[] = [];
  if (parameters.information.hazards) for (const z of world.hazardZones) {
    if (z.type === 'bear-trap' && (parameters.hidden === 'none' || (parameters.hidden !== 'all' && world.now - z.createdAt > 1500))) continue;
    const old = memory.last?.hazardZones.find(s => s.id === z.id);
    const observed: HazardZone = {
      id: z.id, type: z.type, ownerId: z.ownerId, x: z.x, y: z.y, width: z.width, height: z.height,
      isNapalm: z.isNapalm === true,
      damage: z.isNapalm ? (players[z.ownerId - 1].character?.attackDamage ?? 16) * 0.1 : 10, tickRate: 100, lastTick: world.now, createdAt: old?.createdAt ?? world.now, duration: durations[z.type],
      health: z.type === 'tesla-coil' ? Math.round((z.health ?? 240) / (z.maxHealth ?? 240) * 100) / 100 * 240 : undefined,
      maxHealth: z.type === 'tesla-coil' ? 240 : undefined, attackRange: z.type === 'tesla-coil' ? 225 : undefined,
    };
    const properties = parameters.estimation.properties;
    for (const key of ['damage', 'tickRate', 'health', 'maxHealth', 'attackRange'] as const) {
      const base = observed[key];
      observed[key] = properties.mode === 'exact' ? z[key] : base === undefined ? undefined : estimateNumber(base, properties, random, Math.max(1, base) / 100);
    }
    if (properties.mode === 'exact') { observed.lastTick = z.lastTick; observed.lastAttackTarget = z.lastAttackTarget && { ...z.lastAttackTarget }; }
    const duration = parameters.estimation.durations;
    observed.duration = duration.mode === 'exact' ? z.duration : estimateNumber(observed.duration, duration, random);
    if (duration.mode === 'exact') observed.createdAt = z.createdAt;
    if (z.type === 'bear-trap' && remembers) {
      const index = traps.findIndex(t => t.zone.id === z.id);
      const remembered = { zone: observed, lastSeenAt: observationTime, expiresAt: observationTime + Math.max(0, observed.duration - (world.now - observed.createdAt)) };
      if (index < 0) traps.push(remembered); else traps[index] = remembered;
    } else hazards.push(observed);
  }
  hazards.push(...traps.map(t => ({ ...t.zone, createdAt: world.now - (t.zone.duration - (t.expiresAt - observationTime)) })));
  const hitboxes: AttackHitbox[] = !parameters.information.meleeHitboxes || parameters.hiddenAttacks === 'none' ? []
    : parameters.hiddenAttacks === 'exact' ? world.attackHitboxes.map(h => ({ ...h }))
    : players.filter(p => p.isAttacking && ['gladiator', 'ninja', 'reaper'].includes(p.character?.id)).map(p => ({
      id: 'observed-attack-' + p.id, ownerId: p.id, x: p.facingRight ? p.x : p.x - p.character.attackRange,
      y: p.y - 10, width: p.character.attackRange + PLAYER_SIZE, height: PLAYER_SIZE,
      damage: p.character.attackDamage, duration: 120, createdAt: world.now, knockback: 50, canDeflectProjectiles: p.character.id === 'ninja',
    }));
  for (const h of hitboxes) {
    const duration = parameters.estimation.durations, properties = parameters.estimation.properties;
    h.duration = duration.mode === 'exact' ? h.duration : estimateNumber(120, duration, random);
    if (duration.mode !== 'exact') h.createdAt = memory.last?.attackHitboxes.find(old => old.id === h.id)?.createdAt ?? world.now;
    const damage = players[h.ownerId - 1].character?.attackDamage ?? 10;
    h.damage = properties.mode === 'exact' ? h.damage : estimateNumber(damage, properties, random, damage / 100);
    h.knockback = properties.mode === 'exact' ? h.knockback : estimateNumber(50, properties, random, 0.5);
  }
  const duration = parameters.estimation.durations;
  const time = (estimated: number, exact: number) => duration.mode === 'exact' ? exact : estimateNumber(estimated, duration, random);
  const observed: AIWorld = {
    players, projectiles, hazardZones: hazards, attackHitboxes: hitboxes, platforms: world.platforms,
    mapId: world.mapId, now: world.now, deltaTime: world.deltaTime, isOvertime: world.isOvertime,
    roundTimeRemaining: duration.mode === 'exact' ? world.roundTimeRemaining : Math.ceil(world.roundTimeRemaining),
    sandstormActive: parameters.information.wind && world.sandstormActive,
    sandstormDirection: parameters.information.wind && world.sandstormActive ? world.sandstormDirection : 'right',
    sandstormTimer: parameters.information.wind && world.sandstormActive ? time(1000, world.sandstormTimer) : 0,
    lightningStrikes: parameters.information.lightning ? world.lightningStrikes.map(s => {
      const seen = memory.last?.lightningStrikes.find(v => v.x === s.x && !v.struck)?.warningStart ?? world.now;
      return { x: s.x, struck: s.struck, warningStart: world.now - time(world.now - seen, world.now - s.warningStart) };
    }) : [],
    soulZones: parameters.information.recoveryZones ? world.soulZones.map(s => ({
      id: s.id, x: s.x, y: s.y, width: s.width, height: s.height,
      createdAt: duration.mode === 'exact' ? s.createdAt : memory.last?.soulZones.find(v => v.id === s.id)?.createdAt ?? world.now, duration: time(6000, s.duration),
    })) : [],
    vineShields: parameters.information.vines ? world.vineShields.filter(v => v.hp > 0 && v.destroyedAt === undefined).map(v => ({
      id: v.id, x: v.x, y: v.y, width: v.width, height: v.height, hp: parameters.estimation.properties.mode === 'exact' ? v.hp : 1,
      createdAt: duration.mode === 'exact' ? v.createdAt : memory.last?.vineShields.find(s => s.id === v.id)?.createdAt ?? world.now, duration: time(12000, v.duration),
    })) : [],
  };
  return { world: observed, memory: { last: { ...observed, players: [inferred[0], inferred[1]] }, traps } };
}
