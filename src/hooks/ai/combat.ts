import { PLAYER_SIZE, type Player } from '@/types/game';
import { checkProjectileCollision, getProjectileCollisionTime } from '@/types/projectile';
import { clampPlayerX, DEFAULT_PROJECTILE_LIFETIME_MS, FLOOR_Y, HUNTER_BULLET_LIFETIME_MS, NINJA_DASH_DISTANCE, NINJA_PARRY_MS, shieldFacesX } from '@/types/combatPhysics';
import { AI_DT, overlapsPlayer, type AIFrame } from './world';
import { hazardRisk, isMelee, type Point } from './navigation';
import type { Direction, OpponentModel } from './learning';
import type { Strategy } from './state';
import type { Action } from './controller';

export function chooseCombat(frame: AIFrame, player: Player, opponent: Player, model: OpponentModel, chosen: Action,
  facingTarget: boolean, threatened: boolean, strategy: Strategy, targetAt: (time: number) => Point, allowLongRange = false) {
  const { now, platforms, mapId } = frame.world;
  const character = player.character!, id = character.id;
  const dx = opponent.x - player.x, dy = opponent.y - player.y, distance = Math.hypot(dx, dy);
  const toward: Direction = dx >= 0 ? 1 : -1;
  const lowHealth = player.health < player.maxHealth * 0.35;
  const zones = frame.zones.filter(z => z.ownerId !== player.id);
  const warnings = frame.world.lightningStrikes.filter(s => !s.struck && now - s.warningStart <= 1500);
  const targetVulnerable = !opponent.isInvulnerable && !opponent.isEvading;
  const shieldFacingUs = shieldFacesX(opponent, player.x + PLAYER_SIZE / 2);
  const canHit = (speed: number, vertical = 0, gravity = 0, tolerance = 30, range = character.attackRange, breakVine = false, reflectable = true, lifetime = DEFAULT_PROJECTILE_LIFETIME_MS) => {
    let time = Math.max(0, Math.abs(dx) - PLAYER_SIZE / 2) / speed;
    let target = targetAt(time);
    time = Math.max(0, Math.abs(target.x - player.x) - PLAYER_SIZE / 2) / speed;
    target = targetAt(time);
    if (time * 1000 > lifetime) return false;
    const effectiveRange = allowLongRange && !isMelee(id) ? Infinity : range;
    if (Math.abs(target.x - player.x) > effectiveRange + PLAYER_SIZE / 2 || Math.sign(target.x - player.x) !== toward) return false;
    const shotY = player.y + PLAYER_SIZE / 2 + vertical * time + gravity * time * time / 2;
    if (Math.abs(shotY - target.y - PLAYER_SIZE / 2) >= tolerance) return false;
    let before = { x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2 };
    for (let t = AI_DT; t <= time + AI_DT; t += AI_DT) {
      const at = Math.min(t, time);
      const after = { x: player.x + PLAYER_SIZE / 2 + toward * speed * at, y: player.y + PLAYER_SIZE / 2 + vertical * at + gravity * at * at / 2, width: 12, height: 12 };
      if (gravity && platforms.some(p => checkProjectileCollision(after, before, p))) return false;
      if (frame.vines.some(v => now + at * 1000 - v.createdAt <= v.duration && checkProjectileCollision(after, before, v))) return breakVine;
      if (reflectable && frame.hitboxes.some(h => h.ownerId === opponent.id && h.canDeflectProjectiles &&
          now + at * 1000 - h.createdAt <= h.duration && checkProjectileCollision(after, before, h))) return false;
      before = after;
    }
    return true;
  };
  let attack = false;
  if (facingTarget && targetVulnerable && player.attackCooldownRemaining <= 0) {
    if (isMelee(id)) attack = !shieldFacingUs && Math.abs(dx) < character.attackRange + PLAYER_SIZE - 6 && Math.abs(dy) < PLAYER_SIZE - 4;
    else if (!shieldFacingUs) {
      const range = allowLongRange ? Infinity : character.attackRange;
      if (id === 'archer') attack = canHit(1000, -80, 190, 30, range, true);
      else if (id === 'scientist') attack = canHit(640, -105, 220, 35, range, true);
      else if (id === 'hunter') attack = canHit(player.hunterFocusedDuration ? 1562.5 : 1250, 0, 0, 35, allowLongRange ? Infinity : player.hunterFocusedDuration ? 350 : 275, true, true, HUNTER_BULLET_LIFETIME_MS);
      else attack = canHit(id === 'mage' ? 780 : id === 'hacker' ? 800 : 700, 0, 0, 30, range, true);
    }
  }
  if (id === 'ninja' && player.attackCooldownRemaining <= 0) {
    for (const path of frame.paths) {
      if (path.projectile.ownerId === player.id || !path.projectile.canBeDeflected) continue;
      const direction: Direction = path.projectile.x + path.projectile.width / 2 >= player.x + PLAYER_SIZE / 2 ? 1 : -1;
      if (chosen.direction && chosen.direction !== direction) continue;
      const sword = { x: direction > 0 ? player.x : player.x - character.attackRange, y: player.y - 10, width: character.attackRange + PLAYER_SIZE, height: PLAYER_SIZE * 1.1 };
      for (let i = 1; i <= Math.min(path.endStep, Math.floor(NINJA_PARRY_MS / (AI_DT * 1000))); i++) {
        const shot = { x: path.x[i], y: path.y[i], width: path.projectile.width, height: path.projectile.height };
        const before = { x: path.x[i - 1], y: path.y[i - 1] };
        const swordTime = getProjectileCollisionTime(shot, before, sword);
        const bodyTime = getProjectileCollisionTime(shot, before, { ...player, width: PLAYER_SIZE, height: PLAYER_SIZE });
        if (swordTime !== null && (bodyTime === null || swordTime < bodyTime)) {
          if (!chosen.direction) chosen.direction = direction;
          attack = true; break;
        }
      }
      if (attack) break;
    }
  }
  if (id === 'hacker' && attack && frame.zones.some(z => z.ownerId === player.id && z.type === 'packet-block-zone' && overlapsPlayer(player, z))) {
    const arrival = targetAt(Math.abs(dx) / 800);
    const selfRisk = zones.reduce((sum, z) => sum + hazardRisk(arrival, z), 0) * (lowHealth ? 1.8 : 1);
    const enemyRisk = frame.zones.reduce((sum, z) => sum + (z.ownerId === player.id ? hazardRisk(player, z) : 0), 0);
    const silenceValue = !opponent.isSilenced && opponent.mana >= opponent.character!.skill.manaCost ? 45 : 0;
    if (selfRisk > enemyRisk + silenceValue || (mapId === 'volcano' && arrival.y >= FLOOR_Y - 30) || warnings.some(s => Math.abs(arrival.x + PLAYER_SIZE / 2 - s.x) < 55)) attack = false;
  }
  let skill = false, ultimate = false;
  const canCast = !player.isSilenced && !player.isClone;
  if (canCast && player.mana >= character.ultimate.manaCost && !player.isChargingSkill && targetVulnerable) {
    switch (id) {
      case 'gladiator': ultimate = player.buffDuration <= 0 && (distance < 240 || (lowHealth && threatened)); break;
      case 'archer': ultimate = !(player.archerBurstRemaining > 0) && facingTarget && !shieldFacingUs && canHit(1000, -80, 190, 65, 650); break;
      case 'mage': ultimate = player.mageUltimateDuration <= 0 && distance < 420; break;
      case 'ninja': ultimate = !player.isInvisible && (distance < 350 || threatened); break;
      case 'scientist': ultimate = distance < 200 && !frame.zones.some(z => z.ownerId === player.id && z.type === 'tesla-coil'); break;
      case 'hunter': ultimate = (player.hunterFocusedDuration ?? 0) <= 0 && Math.abs(dy) < 65 && distance < 340; break;
      case 'reaper': ultimate = !player.isFlying && (distance < 300 || (lowHealth && threatened)); break;
      case 'ice-mage': ultimate = facingTarget && !shieldFacingUs && canHit(600, -100, 600, 100, 450); break;
      case 'hacker': ultimate = !opponent.isHacked && distance < 600; break;
    }
  }
  if (canCast && !ultimate && player.mana >= character.skill.manaCost && player.skillCooldownRemaining <= 0) {
    switch (id) {
      case 'gladiator': {
        const learnedAttackSoon = model.attackCount >= 2 && model.lastAttackAt !== undefined && now - model.lastAttackAt > model.attackInterval - 180;
        skill = player.mana >= 5 && facingTarget && (threatened || (isMelee(opponent.character!.id) && distance < 140 && (opponent.attackCooldownRemaining < 180 || learnedAttackSoon)));
        break;
      }
      case 'archer': skill = player.poisonArrowsRemaining === 0 && targetVulnerable && canHit(1000, -80, 190, 50, 650); break;
      case 'mage': {
        const fallTime = Math.max(0, opponent.y - 21) / 750;
        const landing = targetAt(fallTime);
        const blocked = frame.vines.some(v => v.x < opponent.x + PLAYER_SIZE / 2 + 21 && v.x + v.width > opponent.x + PLAYER_SIZE / 2 - 21 && v.y < landing.y && now + fallTime * 1000 - v.createdAt <= v.duration);
        skill = targetVulnerable && !blocked && Math.abs(landing.x - opponent.x) < (opponent.isFrozen || opponent.rootDuration > 0 ? 80 : 48);
        break;
      }
      case 'ninja': {
        const direction = strategy === 'escape' ? chosen.direction : toward;
        const landing = { x: clampPlayerX(player.x + direction * NINJA_DASH_DISTANCE), y: player.y };
        const safe = mapId !== 'volcano' || platforms.some(p => p.id !== 'ground' && landing.x + PLAYER_SIZE > p.x && landing.x < p.x + p.width && p.y >= landing.y + PLAYER_SIZE && p.y < FLOOR_Y);
        skill = !!direction && safe && (strategy === 'escape' || (facingTarget && Math.abs(dy) < 65 && Math.abs(dx) > 190 && Math.abs(dx) < 460)) && zones.every(z => !hazardRisk(landing, z)) && warnings.every(s => Math.abs(landing.x + PLAYER_SIZE / 2 - s.x) >= 55);
        if (skill) chosen.direction = direction;
        break;
      }
      case 'scientist': {
        const charge = now - (player.skillChargeStartTime ?? now);
        const shot = facingTarget && targetVulnerable && !shieldFacingUs && canHit(850, 0, 0, 40, 650, false, false);
        const stable = !chosen.jump && !chosen.drop && (mapId !== 'volcano' || player.isGrounded);
        skill = player.isChargingSkill ? stable && charge < 3500 && !(shot && charge >= 1500) && !threatened : stable && shot && !threatened;
        break;
      }
      case 'hunter': skill = facingTarget && targetVulnerable && !shieldFacingUs && !(opponent.isMarked && opponent.markOwnerId === player.id) && canHit(750, -115, 360, 55, 500, false, false); break;
      case 'reaper': skill = facingTarget && targetVulnerable && !shieldFacingUs && !frame.paths.some(p => p.projectile.ownerId === player.id && p.projectile.type === 'bat') && canHit(550, 0, 0, 55, 550, false, false); break;
      case 'ice-mage': skill = facingTarget && targetVulnerable && !shieldFacingUs && canHit(920, 0, 0, 65, 600); break;
      case 'hacker': skill = Math.abs(dy) < 130 && Math.abs(dx) < 430 && !frame.zones.some(z => z.ownerId === player.id && z.type === 'packet-block-zone') && facingTarget; break;
    }
  }
  return { attack, skill, ultimate };
}
