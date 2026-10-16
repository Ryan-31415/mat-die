import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { checkProjectileCollision, getProjectileCollisionTime, hunterNetLaunch, scientistOrbLaunch, projectileProperties, hazardProperties, basicProjectileLaunches, archerBurstLaunch, mageFireballLaunch, reaperBatLaunch, iceMageAvalancheLaunch, blizzardStoneLaunch, SCIENTIST_FULL_CHARGE_MS, SCIENTIST_OVERCHARGE_MS, type Projectile, type ProjectileLaunch, type ProjectileSpawn } from '@/types/projectile';
import { basicMeleeGeometry, circleIntersectsRect, findProjectileCoilContact, clampPlayerX, FLOOR_Y, LIGHTNING_WARNING_MS, stepProjectileMotion, NINJA_DASH_DISTANCE, NINJA_PARRY_MS, playerOverlapsRect, shieldFacesX, stepPlayerMobilityBuffs } from '@/types/combatPhysics';
import { AI_DT, overlapsPlayer, type AIFrame } from './world';
import { hazardRisk, isMelee, type Point } from './navigation';
import type { Direction, OpponentModel } from './learning';
import type { Strategy } from './state';
import type { Action } from './controller';
import { NEUTRAL_AI_TRAITS, type AIDecisionOptions } from '@/types/ai';
import { rocketeerShot } from './rocketeer';
import { predictActionStart } from './actionStart';
import { scientistFlask } from './scientist';
import { directShotOutcome } from './directShot';
import { rootedCoilRescue, singleCoilSurvivalContext, type CoilClearOutcome } from './coilClear';
import type { ArcherShotOutcome } from './archerShot';

export interface CombatProposal {
  action: Readonly<Action>; attack: boolean; skill: boolean; castValue: number; coilClear?: CoilClearOutcome;
}

export function chooseCombat(frame: AIFrame, player: Player, opponent: Player, model: OpponentModel, chosen: Readonly<Action>,
  facingTarget: boolean, threatened: boolean, strategy: Strategy, targetAt: (time: number) => Point, allowLongRange = false, options?: AIDecisionOptions,
  archerShot?: ArcherShotOutcome) {
  const traits = options?.traits ?? NEUTRAL_AI_TRAITS;
  const understanding = (options?.parameters.character ?? 100) / 100;
  const { now, platforms, mapId } = frame.world;
  const character = player.character!, id = character.id;
  const dx = opponent.x - player.x, dy = opponent.y - player.y, distance = Math.hypot(dx, dy);
  const toward: Direction = dx >= 0 ? 1 : -1;
  // Forecast the selected physical movement intent. The difficulty runner still
  // owns imperfect inversion adaptation and delayed/omitted input application.
  const movement = { left: chosen.direction < 0, right: chosen.direction > 0, jump: chosen.jump, down: chosen.drop };
  const rawMovement = player.isHacked ? { left: movement.right, right: movement.left, jump: movement.down, down: movement.jump } : movement;
  const launch = { ...player, ...predictActionStart(frame.world, player, rawMovement, player.isShielding) };
  const launchFacing: Direction = launch.facingRight ? 1 : -1;
  const lowHealth = player.health < player.maxHealth * 0.35;
  const zones = frame.zones.filter(z => z.ownerId !== player.id);
  const warnings = frame.world.lightningStrikes.filter(s => !s.struck && now - s.warningStart <= LIGHTNING_WARNING_MS);
  const targetVulnerable = !opponent.isInvulnerable && !opponent.isEvading;
  const shieldFacingUs = shieldFacesX(opponent, player.x + PLAYER_SIZE / 2);
  const basicShot = basicProjectileLaunches(launch, character.attackDamage);
  const centered = (shot: ProjectileLaunch): ProjectileSpawn => ({ ...shot, x: launch.x + PLAYER_SIZE / 2, y: launch.y + PLAYER_SIZE / 2 });
  const canHit = (spawn: ProjectileSpawn & Partial<Pick<Projectile, 'width' | 'height'>>, range = character.attackRange,
    breakVine = false, from = launch) => {
    if (!allowLongRange && Math.abs(opponent.x - from.x) > range + PLAYER_SIZE / 2) return false;
    if (spawn.type === 'net' || spawn.type === 'electric-orb')
      return directShotOutcome(frame, from, opponent, spawn, targetAt).kind === 'enemy';
    const properties = projectileProperties(spawn.type, spawn.velocityX, spawn.velocityY);
    const shot: Projectile = { ...properties, ...spawn, id: 'prospective-combat-shot', ownerId: player.id,
      x: spawn.x - (spawn.width ?? properties.width) / 2, y: spawn.y - (spawn.height ?? properties.height) / 2,
      createdAt: now, lastHitTime: {} };
    if (shot.type === 'bat') {
      shot.x = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - shot.width, shot.x));
      shot.y = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - shot.height, shot.y));
    }
    const firstDt = Math.max(0.001, frame.world.deltaTime / 1000);
    const horizon = Math.min(shot.lifetime / 1000 + firstDt, (frame.forecasts?.projectiles.horizonMs ?? shot.lifetime + firstDt * 1000) / 1000);
    for (let time = firstDt; time <= Math.max(firstDt, horizon) + 1e-9; time += AI_DT) {
      const dt = time === firstDt ? firstDt : AI_DT;
      const previous = { x: shot.x, y: shot.y };
      const at = now + (time - firstDt) * 1000;
      if (at - shot.createdAt > shot.lifetime) return false;
      stepProjectileMotion(shot, from, at, dt);
      const target = { ...targetAt(time), width: PLAYER_SIZE, height: PLAYER_SIZE };
      const surface = shot.hasGravity ? platforms.find(p => checkProjectileCollision(shot, previous, p)) : undefined;
      if (surface || shot.type === 'blizzard-stone' && shot.y + shot.height >= ARENA.height - ARENA.padding) {
        if (shot.type !== 'blizzard-stone') return false;
        const zone = hazardProperties('blizzard');
        return circleIntersectsRect({ ...zone, x: shot.x + shot.width / 2 - zone.width / 2,
          y: (surface?.y ?? ARENA.height - ARENA.padding) - zone.height / 2 }, target);
      }
      const body = getProjectileCollisionTime(shot, previous, target) ?? Infinity;
      const sword = shot.canBeDeflected ? frame.hitboxes.reduce((first, h) => h.ownerId === opponent.id && h.canDeflectProjectiles && at - h.createdAt <= h.duration
        ? Math.min(first, getProjectileCollisionTime(shot, previous, h) ?? Infinity) : first, Infinity) : Infinity;
      const vine = mapId === 'jungle' ? frame.vines.reduce((first, v) => at - v.createdAt <= v.duration
        ? Math.min(first, getProjectileCollisionTime(shot, previous, v) ?? Infinity) : first, Infinity) : Infinity;
      if (vine < Math.min(body, sword)) return breakVine;
      const coil = findProjectileCoilContact(shot, frame.coilSnapshots.get(frame.times.findIndex(t => t >= time - 1e-9)) ?? frame.zones, previous);
      if (coil && (getProjectileCollisionTime(shot, previous, coil) ?? Infinity) < Math.min(body, sword)) return breakVine;
      if (sword < body) return false;
      if (body < Infinity) return true;
      if (shot.x + shot.width < 0 || shot.x > ARENA.width || shot.y + shot.height < 0 || shot.y > ARENA.height) return false;
    }
    return false;
  };
  let attack = false;
  const rocketFacing = launchFacing;
  const normalRocket = id === 'rocketeer' && facingTarget && targetVulnerable
    ? rocketeerShot(frame, launch, opponent, targetAt, false, rocketFacing, allowLongRange) : null;
  const guidedRocket = id === 'rocketeer' && facingTarget && targetVulnerable && !opponent.isInvisible
    ? rocketeerShot(frame, launch, opponent, targetAt, true, rocketFacing, allowLongRange) === 'target' : false;
  if (facingTarget && targetVulnerable && player.attackCooldownRemaining <= 0) {
    if (isMelee(id)) {
      const geometry = basicMeleeGeometry(launch);
      // Damage resolves after both fighters move. Use the permitted opponent
      // forecast at that same callback, rather than its pre-movement rectangle.
      const target = { ...opponent, ...targetAt(frame.times[1]) };
      attack = !shieldFacesX(target, launch.x + PLAYER_SIZE / 2) && !!geometry && playerOverlapsRect(target, geometry);
    }
    else if (!shieldFacingUs) {
      const range = allowLongRange ? Infinity : character.attackRange;
      if (id === 'rocketeer') attack = normalRocket !== null;
      else if (id === 'archer') attack = archerShot && (options?.parameters.character ?? 100) >= 50
        ? (archerShot.kind === 'enemy' || archerShot.kind === 'vine') && Math.abs(opponent.x - launch.x) <= range + PLAYER_SIZE / 2
        : !!basicShot[0] && canHit(centered(basicShot[0]), range, true);
      else if (id === 'scientist') attack = scientistFlask(frame, launch, opponent, targetAt, allowLongRange) !== null;
      else if (id === 'hunter') attack = basicShot.some(shot => canHit(centered(shot), Infinity, true));
      else attack = !!basicShot[0] && canHit(centered(basicShot[0]), range, true);
    }
  }
  const findParryDirection = (candidate: Readonly<Action>): Direction | undefined => {
    for (const path of frame.paths) {
      if (path.projectile.ownerId === player.id || !path.projectile.canBeDeflected) continue;
      const direction: Direction = path.projectile.x + path.projectile.width / 2 >= player.x + PLAYER_SIZE / 2 ? 1 : -1;
      if (candidate.direction && candidate.direction !== direction) continue;
      const parryMovement = { left: direction < 0, right: direction > 0, jump: candidate.jump, down: candidate.drop };
      const parryRaw = player.isHacked ? { left: parryMovement.right, right: parryMovement.left, jump: parryMovement.down, down: parryMovement.jump } : parryMovement;
      const parryLaunch = { ...player, ...predictActionStart(frame.world, player, parryRaw, false) };
      const sword = basicMeleeGeometry(parryLaunch)!;
      // The first projectile sweep happens in the callback that creates the
      // stationary sword. Later sweeps use its age, not a count of 60Hz samples.
      for (let i = 1; i <= path.endStep && (frame.times[i] - frame.times[1]) * 1000 <= NINJA_PARRY_MS + 1e-6; i++) {
        const shot = { x: path.x[i], y: path.y[i], width: path.projectile.width, height: path.projectile.height };
        const before = { x: path.x[i - 1], y: path.y[i - 1] };
        const swordTime = getProjectileCollisionTime(shot, before, sword);
        const bodyTime = getProjectileCollisionTime(shot, before, { ...parryLaunch, width: PLAYER_SIZE, height: PLAYER_SIZE });
        if (swordTime !== null && (bodyTime === null || swordTime < bodyTime)) {
          return direction;
        }
      }
    }
    return undefined;
  };
  let parryTurn: Direction | undefined, skillTurn: Direction | undefined;
  if (id === 'ninja' && player.attackCooldownRemaining <= 0) {
    parryTurn = findParryDirection(chosen);
    if (parryTurn !== undefined) attack = true;
  }
  if (id === 'hacker' && attack && frame.zones.some(z => z.ownerId === player.id && z.type === 'packet-block-zone' && overlapsPlayer(player, z))) {
    const arrival = targetAt(Math.abs(dx) / Math.abs(basicShot[0]!.velocityX));
    const selfRisk = zones.reduce((sum, z) => sum + hazardRisk(arrival, z), 0) * (lowHealth ? 1.8 : 1);
    const enemyRisk = frame.zones.reduce((sum, z) => sum + (z.ownerId === player.id ? hazardRisk(player, z) : 0), 0);
    const silenceValue = !opponent.isSilenced && opponent.mana >= opponent.character!.skill.manaCost ? 45 : 0;
    if (selfRisk > enemyRisk + silenceValue || (mapId === 'volcano' && arrival.y >= FLOOR_Y - 30) || warnings.some(s => Math.abs(arrival.x + PLAYER_SIZE / 2 - s.x) < 55)) attack = false;
  }
  let skill = false, ultimate = false;
  let selectedCoilClear: CoilClearOutcome | undefined;
  let coilCasts: { action: Readonly<Action>; outcome: CoilClearOutcome }[] = [];
  const canCast = !player.isSilenced && !player.isClone;
  if (canCast && traits.ultimate > 0 && player.mana >= character.ultimate.manaCost && !player.isChargingSkill && targetVulnerable) {
    const eagerDistance = distance / Math.max(0.25, traits.ultimate);
    switch (id) {
      case 'rocketeer': ultimate = player.napalmDuration <= 0 && eagerDistance < 600 &&
        ((normalRocket === 'target' && player.attackCooldownRemaining < 300) || (guidedRocket && player.skillCooldownRemaining < 1200)); break;
      case 'gladiator': ultimate = player.buffDuration <= 0 && (eagerDistance < 240 || (lowHealth && threatened)); break;
      case 'archer': ultimate = !(player.archerBurstRemaining > 0) && facingTarget && !shieldFacingUs && canHit(centered(archerBurstLaunch(launch.facingRight, character.attackDamage)), 650); break;
      case 'mage': ultimate = player.mageUltimateDuration <= 0 && eagerDistance < 420; break;
      case 'ninja': ultimate = !player.isInvisible && (eagerDistance < 350 || threatened); break;
      case 'scientist': ultimate = eagerDistance < 200 && !frame.zones.some(z => z.ownerId === player.id && z.type === 'tesla-coil'); break;
      case 'hunter': ultimate = (player.hunterFocusedDuration ?? 0) <= 0 && Math.abs(dy) < 65 && eagerDistance < 340; break;
      case 'reaper': ultimate = !player.isFlying && (eagerDistance < 300 || (lowHealth && threatened)); break;
      case 'ice-mage': ultimate = facingTarget && !shieldFacingUs && canHit(blizzardStoneLaunch(launch, character.attackDamage), 450); break;
      case 'hacker': ultimate = !opponent.isHacked && eagerDistance < 600; break;
    }
  }
  if (ultimate && options && options.random() > Math.min(1, traits.ultimate * (0.5 + understanding * 0.5))) ultimate = false;
  const reservedMana = character.skill.manaCost * Math.max(1, traits.recovery / Math.max(0.25, traits.skill));
  if (canCast && !ultimate && (traits.skill > 0 || player.isChargingSkill) && player.mana >= reservedMana && player.skillCooldownRemaining <= 0) {
    switch (id) {
      case 'rocketeer': skill = guidedRocket; break;
      case 'gladiator': {
        const incoming = frame.paths.find(path => path.projectile.ownerId !== player.id && path.projectile.canBeDeflected &&
          Array.from({ length: Math.min(path.endStep, 8) }, (_, i) => i + 1).some(i => getProjectileCollisionTime(
            { x: path.x[i], y: path.y[i], width: path.projectile.width, height: path.projectile.height },
            { x: path.x[i - 1], y: path.y[i - 1] }, { ...player, width: PLAYER_SIZE, height: PLAYER_SIZE }
          ) !== null));
        if (incoming && traits.defense > 0 && player.mana >= 5) {
          skillTurn = incoming.projectile.x + incoming.projectile.width / 2 >= player.x + PLAYER_SIZE / 2 ? 1 : -1;
          skill = true;
          break;
        }
        const learnedAttackSoon = model.attackCount >= 2 && model.lastAttackAt !== undefined && now - model.lastAttackAt > model.attackInterval - 180;
        skill = traits.defense > 0 && player.mana >= 5 && facingTarget && (threatened || (isMelee(opponent.character!.id) && distance < 140 * traits.defense && (opponent.attackCooldownRemaining < 180 || learnedAttackSoon)));
        break;
      }
      case 'archer': skill = player.poisonArrowsRemaining === 0 && targetVulnerable && !!basicShot[0] && canHit(centered({ ...basicShot[0], type: 'poison-arrow' }), 650); break;
      case 'mage': {
        const fireball = mageFireballLaunch(opponent, character.attackDamage);
        const halfWidth = projectileProperties(fireball.type).width / 2;
        const halfHeight = projectileProperties(fireball.type).height / 2;
        const fallTime = Math.max(0, opponent.y - halfHeight) / fireball.velocityY;
        const landing = targetAt(fallTime);
        const blocked = frame.vines.some(v => v.x < opponent.x + PLAYER_SIZE / 2 + halfWidth && v.x + v.width > opponent.x + PLAYER_SIZE / 2 - halfWidth && v.y < landing.y && now + fallTime * 1000 - v.createdAt <= v.duration);
        skill = targetVulnerable && !blocked && Math.abs(landing.x - opponent.x) < (opponent.isFrozen || opponent.rootDuration > 0 ? 80 : 48) * (0.5 + 0.5 * traits.skill);
        break;
      }
      case 'ninja': {
        const direction = strategy === 'escape' ? parryTurn ?? chosen.direction : toward;
        const dashInput = { left: direction < 0, right: direction > 0, jump: chosen.jump, down: chosen.drop };
        const dashRaw = player.isHacked ? { left: dashInput.right, right: dashInput.left, jump: dashInput.down, down: dashInput.jump } : dashInput;
        const dashStart = predictActionStart(frame.world, player, dashRaw, true);
        const landing = { x: clampPlayerX(dashStart.x + (dashStart.facingRight ? 1 : -1) * NINJA_DASH_DISTANCE), y: dashStart.y };
        const safe = mapId !== 'volcano' || platforms.some(p => p.id !== 'ground' && landing.x + PLAYER_SIZE > p.x && landing.x < p.x + p.width && p.y >= landing.y + PLAYER_SIZE && p.y < FLOOR_Y);
        skill = !!direction && safe && (strategy === 'escape' || (facingTarget && Math.abs(dy) < 65 && Math.abs(dx) > 190 / (0.5 + 0.5 * traits.skill) && Math.abs(dx) < 460)) && zones.every(z => !hazardRisk(landing, z)) && warnings.every(s => Math.abs(landing.x + PLAYER_SIZE / 2 - s.x) >= 55);
        if (skill) skillTurn = direction;
        break;
      }
      case 'scientist': {
        const charge = now - (player.skillChargeStartTime ?? now);
        const orb = scientistOrbLaunch(launch, player.isChargingSkill ? charge : SCIENTIST_FULL_CHARGE_MS, character.attackDamage);
        const shot = facingTarget && targetVulnerable && !shieldFacingUs && canHit(orb, 650);
        const stable = !chosen.jump && !chosen.drop && (mapId !== 'volcano' || player.isGrounded);
        skill = player.isChargingSkill ? stable && charge < SCIENTIST_OVERCHARGE_MS && !(shot && charge >= SCIENTIST_FULL_CHARGE_MS) && !threatened : stable && shot && !threatened;
        break;
      }
      case 'hunter': {
        const ticked = { ...player };
        stepPlayerMobilityBuffs(ticked, frame.world.deltaTime);
        const net = hunterNetLaunch(launch, character.attackDamage * (1 + ticked.damageBoost) * (frame.world.isOvertime ? 2 : 1));
        const outcome = directShotOutcome(frame, launch, opponent, net, targetAt);
        const rescue = !chosen.jump && !chosen.drop && rootedCoilRescue(frame, player, launch, outcome);
        if (rescue && outcome.kind === 'coil') selectedCoilClear = outcome;
        skill = rescue || facingTarget && targetVulnerable && !shieldFacingUs &&
          !(opponent.isMarked && opponent.markOwnerId === player.id) &&
          (allowLongRange || Math.abs(opponent.x - launch.x) <= 520) && outcome.kind === 'enemy';
        const coilId = singleCoilSurvivalContext(frame, player);
        if (coilId) for (const direction of [-1, 0, 1] as const) {
          const variant = { direction, jump: false, drop: false };
          const input = { left: direction < 0, right: direction > 0, jump: false, down: false };
          const raw = player.isHacked ? { ...input, left: input.right, right: input.left } : input;
          const from = { ...player, ...predictActionStart(frame.world, player, raw, true) };
          const cast = directShotOutcome(frame, from, opponent, hunterNetLaunch(from,
            character.attackDamage * (1 + ticked.damageBoost) * (frame.world.isOvertime ? 2 : 1)), targetAt);
          if (cast.kind === 'coil' && cast.coilId === coilId && cast.remainingHealth !== undefined &&
              cast.remainingHealth > 0 && cast.rawDamage >= cast.remainingHealth) coilCasts.push({ action: variant, outcome: cast });
        }
        break;
      }
      case 'reaper': skill = facingTarget && targetVulnerable && !shieldFacingUs && !frame.paths.some(p => p.projectile.ownerId === player.id && p.projectile.type === 'bat') && canHit(reaperBatLaunch(launch, character.attackDamage), 550); break;
      case 'ice-mage': skill = facingTarget && targetVulnerable && !shieldFacingUs && Array.from({ length: 4 }, (_, i) => iceMageAvalancheLaunch(launch, character.attackDamage, i)).some(shot => canHit(shot, 600)); break;
      case 'hacker': skill = Math.abs(dy) < 130 && Math.abs(dx) < 430 * (0.5 + 0.5 * traits.skill) && !frame.zones.some(z => z.ownerId === player.id && z.type === 'packet-block-zone') && facingTarget; break;
    }
  }
  // Held defense/charge inputs must not flicker just because a new decision was sampled.
  if ((skill || coilCasts.length > 0) && !player.isChargingSkill && !player.isShielding && options &&
      options.random() > Math.min(1, traits.skill * (0.5 + understanding * 0.5))) {
    skill = false; selectedCoilClear = undefined; coilCasts = [];
  }
  if (attack && traits.aggression < 1 && options && options.random() > traits.aggression) attack = false;
  const attackIntent = attack;
  const action: Readonly<Action> = { ...chosen, direction: skill && skillTurn !== undefined ? skillTurn
    : attack && parryTurn !== undefined ? parryTurn : chosen.direction };
  const resolveAttack = (action: Readonly<Action>, skill: boolean) => {
    if (!attackIntent || !isMelee(id)) return attackIntent;
    const finalInput = { left: action.direction < 0, right: action.direction > 0, jump: action.jump, down: action.drop };
    const finalRaw = player.isHacked ? { left: finalInput.right, right: finalInput.left, jump: finalInput.down, down: finalInput.jump } : finalInput;
    const finalLaunch = { ...player, ...predictActionStart(frame.world, player, finalRaw, skill) };
    const geometry = basicMeleeGeometry(finalLaunch)!;
    const target = { ...opponent, ...targetAt(frame.times[1]) };
    const hitsTarget = targetVulnerable && !shieldFacesX(target, finalLaunch.x + PLAYER_SIZE / 2) && playerOverlapsRect(target, geometry);
    return hitsTarget || (id === 'ninja' && findParryDirection(action) !== undefined);
  };
  attack = resolveAttack(action, skill);
  const alternatives: CombatProposal[] = [{ action, attack, skill, castValue: 0, coilClear: selectedCoilClear }];
  // Starting a charge is still optional. Once already charging, false releases
  // a paid orb and is handled separately below.
  if (id === 'scientist' && skill && !player.isChargingSkill)
    alternatives.push({ action, attack, skill: false, castValue: 0 });
  if (selectedCoilClear) alternatives.push({ action, attack, skill: false, castValue: 0 });
  for (const cast of coilCasts) if (!alternatives.some(p => p.skill && p.action.direction === cast.action.direction &&
      !p.action.jump && !p.action.drop && p.coilClear)) alternatives.push({ action: cast.action,
    attack: attack && cast.action.direction === action.direction && !action.jump && !action.drop,
    skill: true, castValue: 0, coilClear: cast.outcome });
  // Personality admission happens once above. Only legal variants of the
  // admitted movement skill compete; rejecting it never implies a free cast.
  if (skill && (id === 'gladiator' || id === 'ninja')) {
    const fallback: Readonly<Action> = { ...chosen, direction: attackIntent && parryTurn !== undefined ? parryTurn : chosen.direction };
    alternatives.push({ action: fallback, skill: false, attack: resolveAttack(fallback, false), castValue: 0 });
    if (id === 'gladiator') for (const direction of [-1, 0, 1] as const) {
      if (direction === action.direction) continue;
      const variant: Readonly<Action> = { ...chosen, direction };
      alternatives.push({ action: variant, skill: true, attack: resolveAttack(variant, true), castValue: 0 });
    }
  }
  if (id === 'scientist' && player.isChargingSkill && canCast && player.mana >= character.skill.manaCost) {
    const charge = now - (player.skillChargeStartTime ?? now);
    if (skill && charge + frame.times[frame.steps] * 1000 > SCIENTIST_OVERCHARGE_MS)
      alternatives.push({ action, attack, skill: false, castValue: 0 });
    if (!skill && charge < SCIENTIST_OVERCHARGE_MS) alternatives.push({ action, attack, skill: true, castValue: 0 });
    for (const direction of [-1, 0, 1] as const) {
      const variant: Readonly<Action> = { ...chosen, direction };
      const input = { left: direction < 0, right: direction > 0, jump: variant.jump, down: variant.drop };
      const raw = player.isHacked ? { left: input.right, right: input.left, jump: input.down, down: input.jump } : input;
      const from = { ...player, ...predictActionStart(frame.world, player, raw, false) };
      const orb = scientistOrbLaunch(from, charge, character.attackDamage);
      const hits = targetVulnerable && !shieldFacesX(opponent, from.x + PLAYER_SIZE / 2) &&
        canHit(orb, 650, false, from);
      const basic = attackIntent && scientistFlask(frame, from, opponent, targetAt, allowLongRange) !== null;
      // Preserve the existing full-charge preference; partial release remains
      // available when the original decision already needs to stop holding.
      if (hits && (charge >= SCIENTIST_FULL_CHARGE_MS || !skill)) {
        const castValue = orb.damage * 1.3 * traits.skill;
        const released = alternatives.find(proposal => !proposal.skill && proposal.action.direction === direction);
        if (released) released.castValue = castValue;
        else alternatives.push({ action: variant, attack: basic, skill: false, castValue });
      }
    }
  }
  return { attack, skill, ultimate, action, alternatives };
}
