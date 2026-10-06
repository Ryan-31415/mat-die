import { CHARACTERS, PLAYER_SIZE, createInitialPlayer, type Player } from '@/types/game';
import type { AIParameters } from '@/types/ai';
import type { Projectile, HazardZone, AttackHitbox } from '@/types/projectile';
import type { AIWorld } from './world';

export interface PerceptionMemory {
  last?: AIWorld;
  traps: { zone: HazardZone; lastSeenAt: number }[];
}
export const createPerceptionMemory = (): PerceptionMemory => ({ traps: [] });
const tenthSecond = (ms: number) => Math.max(0, Math.round(ms / 100) * 100);
const durations: Record<HazardZone['type'], number> = {
  'fire-pool': 4000, 'toxic-pool': 3200, 'tesla-coil': 30000, 'electric-explosion': 500,
  'bear-trap': 10000, blizzard: 5000, 'fire-ring': 5000, 'packet-block-zone': 5000,
};

function visiblePlayer(raw: Player, world: AIWorld, previous: AIWorld | undefined, parameters: AIParameters): Player {
  const now = world.now;
  const character = raw.character ? CHARACTERS[raw.character.id] : null;
  const old = previous?.players[raw.id - 1];
  const dt = previous ? (now - previous.now) / 1000 : 0;
  const estimate = parameters.internal === 'estimated';
  // Construct from public defaults instead of copying engine fields and trying to blacklist them.
  const p = createInitialPlayer(raw.id, character);
  p.createdAt = now; p.lastGroundedTime = now;
  p.x = raw.x; p.y = raw.y; p.facingRight = raw.facingRight;
  p.isGrounded = world.platforms.some(s => Math.abs(p.y + PLAYER_SIZE - s.y) < 2 && p.x + PLAYER_SIZE > s.x && p.x < s.x + s.width);
  p.isJumping = !p.isGrounded;
  p.lastGroundedTime = p.isGrounded ? now : old?.lastGroundedTime ?? now - 1000;
  if (estimate && dt > 0 && dt <= 1.1 && old) {
    p.velocityX = Math.round((p.x - old.x) / dt / 10) * 10;
    p.velocityY = Math.round((p.y - old.y) / dt / 10) * 10;
  }
  const own = raw.id === 2;
  if (own || parameters.information.resources) {
    p.health = Math.floor(raw.health); p.maxHealth = raw.maxHealth;
    p.mana = Math.floor(raw.mana); p.maxMana = raw.maxMana;
  }
  p.isAttacking = raw.isAttacking; p.isUsingSkill = raw.isUsingSkill; p.isUsingUltimate = raw.isUsingUltimate;
  if (own || parameters.information.cooldowns) {
    const cooldown = character?.skill.cooldown ?? 0;
    p.skillCooldownRemaining = cooldown ? Math.round(raw.skillCooldownRemaining / cooldown * 100) / 100 * cooldown : 0;
  }
  // Basic attack cooldown is not displayed. Infer it from observed attack animation onsets.
  p.attackCooldownRemaining = estimate
    ? p.isAttacking && !old?.isAttacking ? character?.attackCooldown ?? 0 : Math.max(0, (old?.attackCooldownRemaining ?? 0) - dt * 1000)
    : 0;
  if (own || parameters.information.statuses) {
    for (const key of ['isShielding', 'isPoisoned', 'isSlowed', 'isStunned', 'isInvisible', 'isFrozen', 'isBurning', 'isMarked', 'isSilenced', 'isHacked', 'isFlying', 'isDashing'] as const) p[key] = raw[key];
    for (const key of ['poisonDuration', 'slowDuration', 'stunDuration', 'invisibleDuration', 'frozenDuration', 'burnDuration', 'buffDuration', 'regenDuration', 'mageUltimateDuration', 'markDuration', 'hunterFocusedDuration', 'silenceDuration', 'hackedDuration', 'invulnerableDuration'] as const) p[key] = tenthSecond(raw[key] ?? 0);
    // Root is shown as an icon rather than a countdown.
    p.rootDuration = raw.rootDuration > 0 ? 100 : 0;
    p.freezeGauge = raw.freezeGauge; p.dodgesRemaining = raw.dodgesRemaining;
    p.poisonArrowsRemaining = raw.poisonArrowsRemaining;
    p.archerBurstRemaining = raw.archerBurstRemaining ?? 0;
    p.archerBurstFacingRight = old?.archerBurstRemaining ? old.archerBurstFacingRight : raw.facingRight;
    p.isInvulnerable = p.invulnerableDuration > 0 && (p.isFlying || character?.id !== 'reaper');
    p.isChargingSkill = raw.isChargingSkill;
    if (p.isChargingSkill) {
      // Read the visible charge bar to 2%, then keep its observed onset after the bar fills.
      const ratio = Math.round(Math.min(1, (now - (raw.skillChargeStartTime ?? now)) / 1750) * 50) / 50;
      p.skillChargeStartTime = ratio < 1 ? now - ratio * 1750 : old?.skillChargeStartTime ?? now - 1750;
    }
    if (estimate) {
      p.slowAmount = p.isSlowed ? 0.33 : 0;
      p.speedBoost = p.isInvisible ? 0.5 : character?.id === 'gladiator' && p.buffDuration > 0 ? 0.25 : 0;
      p.damageBoost = p.buffDuration > 0 || p.isInvisible || p.mageUltimateDuration > 0 ? 0.3 : 0;
      p.markOwnerId = p.isMarked ? (raw.id === 1 ? 2 : 1) : undefined;
    }
  }
  return p;
}

function visibleProjectile(p: Projectile, world: AIWorld, previous: AIWorld | undefined, parameters: AIParameters): Projectile {
  const old = previous?.projectiles.find(s => s.id === p.id);
  const dt = previous ? (world.now - previous.now) / 1000 : 0;
  const speeds: Record<Projectile['type'], number> = {
    arrow: 1000, 'poison-arrow': 1000, fireball: 780, 'large-fireball': 750, flask: 640, 'electric-orb': 850,
    meteor: 750, bullet: 1250, 'super-bullet': 1562.5, bat: 550, snowball: 700, 'large-snowball': 920,
    'blizzard-stone': 600, net: 750, 'hacker-missile': 800, hacking: 0,
  };
  const estimate = parameters.internal === 'estimated';
  // Orientation is rendered for arrows and bats. Speed magnitude comes from displacement, never the engine velocity.
  const angle = ['arrow', 'poison-arrow', 'bat'].includes(p.type) ? Math.atan2(p.velocityY, p.velocityX) : p.ownerId === 1 ? 0 : Math.PI;
  const velocityX = estimate ? old && dt > 0 ? Math.round((p.x - old.x) / dt / 10) * 10 : Math.cos(angle) * speeds[p.type] : 0;
  const velocityY = estimate ? old && dt > 0 ? Math.round((p.y - old.y) / dt / 10) * 10 : Math.sin(angle) * speeds[p.type] : 0;
  const gravity = estimate ? p.type === 'arrow' || p.type === 'poison-arrow' ? 190 : p.type === 'flask' ? 220 : p.type === 'net' ? 360 : p.type === 'blizzard-stone' ? 600 : 0 : 0;
  const lifetime = p.type === 'bullet' || p.type === 'super-bullet' ? 240 : p.type === 'bat' ? 3600 : p.type === 'large-snowball' ? 1400 : p.type === 'net' ? 3500 : 3000;
  return {
    id: p.id, type: p.type, ownerId: p.ownerId, x: p.x, y: p.y, width: p.width, height: p.height,
    velocityX, velocityY, gravity, hasGravity: gravity > 0,
    damage: world.players[p.ownerId - 1].character ? CHARACTERS[world.players[p.ownerId - 1].character.id].attackDamage : 10,
    createdAt: old?.createdAt ?? world.now, lifetime,
    isExplosive: ['fireball', 'large-fireball', 'electric-orb', 'meteor', 'flask'].includes(p.type), explosionRadius: 50,
    isPoisonous: p.type === 'poison-arrow', poisonDuration: 5000, slowAmount: 0, slowDuration: 0, stunDuration: 0, knockback: 0,
    createsFirePool: p.type === 'large-fireball' || p.type === 'flask', firePoolDuration: 4000,
    canBeDeflected: !['large-fireball', 'electric-orb', 'bat', 'net', 'meteor'].includes(p.type),
    isReturning: p.type === 'bat', returnPhase: estimate && old && Math.sign(velocityX) !== Math.sign(old.velocityX) ? 'returning' : old?.returnPhase ?? 'outbound',
    damageAccumulated: 0, hasHitForward: false, hasHitReturn: false, lastHitTime: {},
    chargeLevel: p.type === 'electric-orb' ? Math.round((p.chargeLevel ?? 0) * 10) / 10 : undefined,
    isHackUltimate: p.type === 'hacking',
  };
}

/** The only restricted-AI boundary that may read engine state. Its output contains observations only. */
export function perceiveWorld(world: AIWorld, parameters: AIParameters, memory: PerceptionMemory, observationTime = world.now): { world: AIWorld; memory: PerceptionMemory } {
  const exact = parameters.internal === 'exact';
  const copyPlayer = (p: Player): Player => ({ ...p, trailPositions: p.trailPositions?.map(t => ({ ...t })) });
  const players: [Player, Player] = exact
    ? [copyPlayer(world.players[0]), copyPlayer(world.players[1])]
    : [visiblePlayer(world.players[0], world, memory.last, parameters), visiblePlayer(world.players[1], world, memory.last, parameters)];
  if (exact) {
    const publicEnemy = visiblePlayer(world.players[0], world, memory.last, parameters);
    if (!parameters.information.resources) {
      players[0].health = publicEnemy.health; players[0].mana = publicEnemy.mana;
      players[0].maxHealth = publicEnemy.maxHealth; players[0].maxMana = publicEnemy.maxMana;
    }
    if (!parameters.information.cooldowns) { players[0].skillCooldownRemaining = publicEnemy.skillCooldownRemaining; players[0].attackCooldownRemaining = 0; }
    if (!parameters.information.statuses) {
      // Preserve position/resources, but do not retain status fields from the exact snapshot.
      const masked = visiblePlayer(world.players[0], world, undefined, { ...parameters, internal: 'none' });
      players[0] = { ...masked, health: players[0].health, mana: players[0].mana, skillCooldownRemaining: players[0].skillCooldownRemaining, attackCooldownRemaining: players[0].attackCooldownRemaining };
    }
  }
  const projectiles = parameters.information.projectiles ? world.projectiles.filter(p => p.type !== 'hacking' || exact).map(p => exact ? { ...p, lastHitTime: { ...p.lastHitTime } } : visibleProjectile(p, world, memory.last, parameters)) : [];
  const traps = parameters.information.hazards && parameters.hidden !== 'all'
    ? memory.traps.filter(t => world.now - t.zone.createdAt <= t.zone.duration &&
      (parameters.hidden !== 'temporary' || observationTime - t.lastSeenAt < 3000)).map(t => ({ ...t, zone: { ...t.zone } })) : [];
  const hazards: HazardZone[] = [];
  if (parameters.information.hazards) for (const z of world.hazardZones) {
    // Visibility is observable; the position/removal of an already invisible trap is not.
    if (z.type === 'bear-trap' && parameters.hidden !== 'all' && world.now - z.createdAt > 1500) continue;
    const old = memory.last?.hazardZones.find(s => s.id === z.id);
    const observed: HazardZone = exact ? { ...z, lastAttackTarget: z.lastAttackTarget && { ...z.lastAttackTarget } } : {
      id: z.id, type: z.type, ownerId: z.ownerId, x: z.x, y: z.y, width: z.width, height: z.height,
      damage: 10, tickRate: 100, lastTick: world.now, createdAt: old?.createdAt ?? world.now, duration: durations[z.type],
      health: z.type === 'tesla-coil' ? Math.round((z.health ?? 240) / (z.maxHealth ?? 240) * 100) / 100 * 240 : undefined,
      maxHealth: z.type === 'tesla-coil' ? 240 : undefined, attackRange: z.type === 'tesla-coil' ? 225 : undefined,
    };
    if (z.type === 'bear-trap' && parameters.hidden !== 'all') {
      const index = traps.findIndex(t => t.zone.id === z.id);
      const remembered = { zone: observed, lastSeenAt: observationTime };
      if (index < 0) traps.push(remembered); else traps[index] = remembered;
    } else hazards.push(observed);
  }
  hazards.push(...traps.map(t => t.zone));
  // Invisible collision rectangles are reconstructed from visible attack animations.
  const hitboxes: AttackHitbox[] = parameters.information.projectiles ? exact ? world.attackHitboxes.map(h => ({ ...h })) : players.filter(p => p.isAttacking && ['gladiator', 'ninja', 'reaper'].includes(p.character?.id)).map(p => ({
    id: `observed-attack-${p.id}`, ownerId: p.id, x: p.facingRight ? p.x : p.x - p.character.attackRange,
    y: p.y - 10, width: p.character.attackRange + PLAYER_SIZE, height: PLAYER_SIZE,
    damage: p.character.attackDamage, duration: 120, createdAt: world.now, knockback: 50, canDeflectProjectiles: p.character.id === 'ninja',
  })) : [];
  const observed: AIWorld = {
    players, projectiles, hazardZones: hazards, attackHitboxes: hitboxes, platforms: world.platforms,
    mapId: world.mapId, now: world.now, deltaTime: world.deltaTime, isOvertime: world.isOvertime,
    roundTimeRemaining: exact ? world.roundTimeRemaining : Math.ceil(world.roundTimeRemaining),
    sandstormActive: parameters.information.environment && world.sandstormActive,
    sandstormDirection: parameters.information.environment && (exact || world.sandstormActive) ? world.sandstormDirection : 'right',
    sandstormTimer: parameters.information.environment && world.sandstormActive ? exact ? world.sandstormTimer : 1000 : 0,
    lightningStrikes: parameters.information.environment ? world.lightningStrikes.map(s => ({ x: s.x, struck: s.struck, warningStart: exact ? s.warningStart : memory.last?.lightningStrikes.find(v => v.x === s.x && !v.struck)?.warningStart ?? world.now })) : [],
    soulZones: parameters.information.environment ? world.soulZones.map(s => ({ id: s.id, x: s.x, y: s.y, width: s.width, height: s.height, createdAt: exact ? s.createdAt : memory.last?.soulZones.find(v => v.id === s.id)?.createdAt ?? world.now, duration: exact ? s.duration : 6000 })) : [],
    vineShields: parameters.information.environment ? exact ? world.vineShields.map(v => ({ ...v })) : world.vineShields.filter(v => v.hp > 0 && v.destroyedAt === undefined).map(v => ({ id: v.id, x: v.x, y: v.y, width: v.width, height: v.height, hp: 1, createdAt: memory.last?.vineShields.find(s => s.id === v.id)?.createdAt ?? world.now, duration: 12000 })) : [],
  };
  return { world: observed, memory: { last: observed, traps } };
}
