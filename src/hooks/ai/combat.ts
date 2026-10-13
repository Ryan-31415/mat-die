import { PLAYER_SIZE, type Player } from '@/types/game';
import { checkProjectileCollision, getProjectileCollisionTime, hunterNetLaunch, scientistOrbLaunch, projectileProperties, type ProjectileSpawn } from '@/types/projectile';
import { basicMeleeGeometry, clampPlayerX, DEFAULT_PROJECTILE_LIFETIME_MS, FLOOR_Y, HUNTER_BULLET_LIFETIME_MS, NINJA_DASH_DISTANCE, NINJA_PARRY_MS, playerOverlapsRect, shieldFacesX, stepPlayerMobilityBuffs } from '@/types/combatPhysics';
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
import { hunterSpacing, type ScatterOpportunity } from './hunter';

export interface RangedShotPolicy {
  scatter: (origin: Pick<Player, 'x' | 'y' | 'facingRight'> & { leadMs?: number }) => ScatterOpportunity;
  rocket: (origin: Pick<Player, 'x' | 'y' | 'facingRight'>, homing: boolean, leadMs?: number) => ReturnType<typeof rocketeerShot>;
  work: () => { scatterCalls: number; rocketCalls: number };
}

export interface CombatProposal {
  action: Readonly<Action>; attack: boolean; skill: boolean; castValue: number; coilClear?: CoilClearOutcome;
}

export function chooseCombat(frame: AIFrame, player: Player, opponent: Player, model: OpponentModel, chosen: Readonly<Action>,
  facingTarget: boolean, threatened: boolean, strategy: Strategy, targetAt: (time: number) => Point, allowLongRange = false, options?: AIDecisionOptions,
  archerShot?: ArcherShotOutcome, rangedShots?: RangedShotPolicy) {
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
  const warnings = frame.world.lightningStrikes.filter(s => !s.struck && now - s.warningStart <= 1500);
  const targetVulnerable = !opponent.isInvulnerable && !opponent.isEvading;
  const shieldFacingUs = shieldFacesX(opponent, player.x + PLAYER_SIZE / 2);
  let castingPreference = 1;
  const canHit = (speed: number, vertical = 0, gravity = 0, tolerance = 30, range = character.attackRange, breakVine = false, reflectable = true, lifetime = DEFAULT_PROJECTILE_LIFETIME_MS, firstShot?: ProjectileSpawn & { width?: number; height?: number }, from = launch) => {
    if (firstShot) {
      if (!allowLongRange && Math.abs(opponent.x - from.x) > range + PLAYER_SIZE / 2) return false;
      return directShotOutcome(frame, from, opponent, firstShot, targetAt).kind === 'enemy';
    }
    const shotFacing = from.facingRight ? 1 : -1;
    const origin = { x: from.x + PLAYER_SIZE / 2, y: from.y + PLAYER_SIZE / 2 };
    let time = Math.max(0, Math.abs(opponent.x - from.x) - PLAYER_SIZE / 2) / speed;
    let target = targetAt(time);
    time = Math.max(0, Math.abs(target.x - from.x) - PLAYER_SIZE / 2) / speed;
    target = targetAt(time);
    if (time * 1000 > lifetime) return false;
    const effectiveRange = allowLongRange && !isMelee(id) ? Infinity : range;
    if (Math.abs(target.x - from.x) > effectiveRange + PLAYER_SIZE / 2 || Math.sign(target.x - from.x) !== shotFacing) return false;
    const shotY = origin.y + vertical * time + gravity * time * time / 2;
    if (Math.abs(shotY - target.y - PLAYER_SIZE / 2) >= tolerance * (0.6 + 0.4 * castingPreference)) return false;
    const width = 12, height = 12;
    let before = { x: origin.x, y: origin.y };
    for (let t = AI_DT; t <= time + AI_DT; t += AI_DT) {
      const at = Math.min(t, time);
      const after = { x: origin.x + shotFacing * speed * at, y: origin.y + vertical * at + gravity * at * at / 2, width, height };
      if (gravity && platforms.some(p => checkProjectileCollision(after, before, p))) return false;
      if (frame.vines.some(v => now + at * 1000 - v.createdAt <= v.duration && checkProjectileCollision(after, before, v))) return breakVine;
      if (reflectable && frame.hitboxes.some(h => h.ownerId === opponent.id && h.canDeflectProjectiles &&
          now + at * 1000 - h.createdAt <= h.duration && checkProjectileCollision(after, before, h))) return false;
      before = after;
    }
    return true;
  };
  let attack = false;
  const scatter = id === 'hunter' && rangedShots && facingTarget && targetVulnerable ? rangedShots.scatter(launch) : undefined;
  const rocketFacing = launchFacing;
  const normalRocket = id === 'rocketeer' && facingTarget && targetVulnerable
    ? rangedShots ? rangedShots.rocket(launch, false) : rocketeerShot(frame, launch, opponent, targetAt, false, rocketFacing, allowLongRange) : null;
  const guidedRocket = id === 'rocketeer' && facingTarget && targetVulnerable && !opponent.isInvisible
    ? (rangedShots ? rangedShots.rocket(launch, true) : rocketeerShot(frame, launch, opponent, targetAt, true, rocketFacing, allowLongRange)) === 'target' : false;
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
      if (id === 'rocketeer') attack = rangedShots ? normalRocket === 'target' || normalRocket === 'vine' : normalRocket !== null;
      else if (id === 'archer') attack = archerShot && (options?.parameters.character ?? 100) >= 50
        ? (archerShot.kind === 'enemy' || archerShot.kind === 'vine') && Math.abs(opponent.x - launch.x) <= range + PLAYER_SIZE / 2
        : canHit(1000, -80, 190, 30, range, true);
      else if (id === 'scientist') attack = scientistFlask(frame, launch, opponent, targetAt, allowLongRange) !== null;
      else if (id === 'hunter') attack = scatter ? scatter.hits > 0 || scatter.vines > 0 : canHit(player.hunterFocusedDuration ? 1562.5 : 1250, 0, 0, 35, allowLongRange ? Infinity : player.hunterFocusedDuration ? 350 : 275, true, true, HUNTER_BULLET_LIFETIME_MS);
      else attack = canHit(id === 'mage' ? 780 : id === 'hacker' ? 800 : 700, 0, 0, 30, range, true);
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
    const arrival = targetAt(Math.abs(dx) / 800);
    const selfRisk = zones.reduce((sum, z) => sum + hazardRisk(arrival, z), 0) * (lowHealth ? 1.8 : 1);
    const enemyRisk = frame.zones.reduce((sum, z) => sum + (z.ownerId === player.id ? hazardRisk(player, z) : 0), 0);
    const silenceValue = !opponent.isSilenced && opponent.mana >= opponent.character!.skill.manaCost ? 45 : 0;
    if (selfRisk > enemyRisk + silenceValue || (mapId === 'volcano' && arrival.y >= FLOOR_Y - 30) || warnings.some(s => Math.abs(arrival.x + PLAYER_SIZE / 2 - s.x) < 55)) attack = false;
  }
  let skill = false, ultimate = false;
  let selectedCoilClear: CoilClearOutcome | undefined;
  let coilCasts: { action: Readonly<Action>; outcome: CoilClearOutcome }[] = [];
  const canCast = !player.isSilenced && !player.isClone;
  castingPreference = traits.ultimate;
  if (canCast && traits.ultimate > 0 && player.mana >= character.ultimate.manaCost && !player.isChargingSkill && targetVulnerable) {
    const eagerDistance = distance / Math.max(0.25, traits.ultimate);
    switch (id) {
      case 'rocketeer': ultimate = player.napalmDuration <= 0 && eagerDistance < 600 &&
        ((normalRocket === 'target' && player.attackCooldownRemaining < 300) || (guidedRocket && player.skillCooldownRemaining < 1200)); break;
      case 'gladiator': ultimate = player.buffDuration <= 0 && (eagerDistance < 240 || (lowHealth && threatened)); break;
      case 'archer': ultimate = !(player.archerBurstRemaining > 0) && facingTarget && !shieldFacingUs && canHit(1000, -80, 190, 65, 650); break;
      case 'mage': ultimate = player.mageUltimateDuration <= 0 && eagerDistance < 420; break;
      case 'ninja': ultimate = !player.isInvisible && (eagerDistance < 350 || threatened); break;
      case 'scientist': ultimate = eagerDistance < 200 && !frame.zones.some(z => z.ownerId === player.id && z.type === 'tesla-coil'); break;
      case 'hunter': ultimate = (player.hunterFocusedDuration ?? 0) <= 0 && Math.abs(dy) < 65 && eagerDistance < 340 &&
        (!scatter || (facingTarget && scatter.vines === 0 && scatter.blocked === 0 &&
          distance <= hunterSpacing({ ...player, hunterFocusedDuration: 5000 }))); break;
      case 'reaper': ultimate = !player.isFlying && (eagerDistance < 300 || (lowHealth && threatened)); break;
      case 'ice-mage': ultimate = facingTarget && !shieldFacingUs && canHit(600, -100, 600, 100, 450); break;
      case 'hacker': ultimate = !opponent.isHacked && eagerDistance < 600; break;
    }
  }
  if (ultimate && options && options.random() > Math.min(1, traits.ultimate * (0.5 + understanding * 0.5))) ultimate = false;
  const reservedMana = character.skill.manaCost * Math.max(1, traits.recovery / Math.max(0.25, traits.skill));
  castingPreference = traits.skill;
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
      case 'archer': skill = player.poisonArrowsRemaining === 0 && targetVulnerable && canHit(1000, -80, 190, 50, 650); break;
      case 'mage': {
        const fallTime = Math.max(0, opponent.y - 21) / 750;
        const landing = targetAt(fallTime);
        const blocked = frame.vines.some(v => v.x < opponent.x + PLAYER_SIZE / 2 + 21 && v.x + v.width > opponent.x + PLAYER_SIZE / 2 - 21 && v.y < landing.y && now + fallTime * 1000 - v.createdAt <= v.duration);
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
        const orb = scientistOrbLaunch(launch, player.isChargingSkill ? charge : 1500, character.attackDamage);
        const shot = facingTarget && targetVulnerable && !shieldFacingUs && canHit(850, 0, 0, 40, 650, false, false,
          projectileProperties('electric-orb').lifetime, orb);
        const stable = !chosen.jump && !chosen.drop && (mapId !== 'volcano' || player.isGrounded);
        skill = player.isChargingSkill ? stable && charge < 3500 && !(shot && charge >= 1500) && !threatened : stable && shot && !threatened;
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
      case 'reaper': skill = facingTarget && targetVulnerable && !shieldFacingUs && !frame.paths.some(p => p.projectile.ownerId === player.id && p.projectile.type === 'bat') && canHit(550, 0, 0, 55, 550, false, false); break;
      case 'ice-mage': skill = facingTarget && targetVulnerable && !shieldFacingUs && canHit(920, 0, 0, 65, 600); break;
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
    if (skill && charge + frame.times[frame.steps] * 1000 > 3500)
      alternatives.push({ action, attack, skill: false, castValue: 0 });
    if (!skill && charge < 3500) alternatives.push({ action, attack, skill: true, castValue: 0 });
    for (const direction of [-1, 0, 1] as const) {
      const variant: Readonly<Action> = { ...chosen, direction };
      const input = { left: direction < 0, right: direction > 0, jump: variant.jump, down: variant.drop };
      const raw = player.isHacked ? { left: input.right, right: input.left, jump: input.down, down: input.jump } : input;
      const from = { ...player, ...predictActionStart(frame.world, player, raw, false) };
      const orb = scientistOrbLaunch(from, charge, character.attackDamage);
      const hits = targetVulnerable && !shieldFacesX(opponent, from.x + PLAYER_SIZE / 2) &&
        canHit(850, 0, 0, 40, 650, false, false, projectileProperties('electric-orb').lifetime, orb, from);
      const basic = attackIntent && scientistFlask(frame, from, opponent, targetAt, allowLongRange) !== null;
      // Preserve the existing full-charge preference; partial release remains
      // available when the original decision already needs to stop holding.
      if (hits && (charge >= 1500 || !skill)) {
        const castValue = orb.damage * 1.3 * traits.skill;
        const released = alternatives.find(proposal => !proposal.skill && proposal.action.direction === direction);
        if (released) released.castValue = castValue;
        else alternatives.push({ action: variant, attack: basic, skill: false, castValue });
      }
    }
  }
  return { attack, skill, ultimate, action, alternatives };
}
