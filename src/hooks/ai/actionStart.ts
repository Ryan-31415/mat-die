import type { Player } from '@/types/game';
import { playerOverlapsRect, stepPlayerCrowdControl, stepPlayerForces, stepPlayerMobilityBuffs, stepPlayerMovement, stepPlayerSlowAndRoot,
  type PlayerMovementInput } from '@/types/combatPhysics';
import type { AIWorld } from './world';

export type ActionStart = Pick<Player, 'x' | 'y' | 'facingRight' | 'velocityX' | 'velocityY' |
  'knockbackVelocityX' | 'knockbackVelocityY' | 'isGrounded' | 'isJumping' | 'lastGroundedTime' | 'isStunned' | 'isFrozen' | 'isShielding'>;

/** Known self movement up to action generation. Inputs are raw keys, not imagined free aim.
 * Only the permitted snapshot is used; delayed input application remains the difficulty runner's job.
 * Does not claim future enemy motion, damage, shield upkeep mana or action outcomes.
 */
export function predictActionStart(world: AIWorld, player: Player, input: Readonly<PlayerMovementInput>, skill: boolean): ActionStart {
  const next = { ...player }, dt = world.deltaTime, now = world.now;
  const opponent = world.players[player.id === 1 ? 1 : 0];
  // The engine resolves inversion before ticking its timer, including the expiry tick.
  const effective = player.isHacked ? { left: input.right, right: input.left, jump: input.down, down: input.jump } : input;
  stepPlayerSlowAndRoot(next, dt);
  stepPlayerCrowdControl(next, opponent, world.hazardZones, now, dt);
  stepPlayerMobilityBuffs(next, dt);
  const silenced = next.silenceDuration - dt > 0;
  const inPacketBlock = () => world.hazardZones.some(z => z.type === 'packet-block-zone' && z.ownerId !== next.id && playerOverlapsRect(next, z));
  if (next.character?.id === 'scientist' && (silenced || inPacketBlock())) next.isChargingSkill = false;
  // Mana regeneration can lift a shield above its five-mana movement gate. The
  // private shield tick affects later upkeep only, so it is neither read nor guessed.
  if (next.character?.id === 'gladiator' && !next.isStunned && !next.isFrozen) {
    const mageDuration = Math.max(0, next.mageUltimateDuration - dt);
    const regen = next.character.manaRegen / 100 * dt / 1000 * next.maxMana * (world.isOvertime ? 2 : 1) * (mageDuration > 0 ? 1.67 : 1);
    next.isShielding = skill && Math.min(next.maxMana, next.mana + regen) >= 5;
  }
  stepPlayerForces(next, dt);
  const inBlizzard = world.hazardZones.some(z => z.type === 'blizzard' && z.ownerId !== next.id && playerOverlapsRect(next, z));
  stepPlayerMovement(next, effective, world.platforms, !next.isStunned && !next.isFrozen && inBlizzard, now, dt);
  const { x, y, facingRight, velocityX, velocityY, knockbackVelocityX, knockbackVelocityY,
    isGrounded, isJumping, lastGroundedTime, isStunned, isFrozen, isShielding } = next;
  return { x, y, facingRight, velocityX, velocityY, knockbackVelocityX, knockbackVelocityY,
    isGrounded, isJumping, lastGroundedTime, isStunned, isFrozen, isShielding };
}
