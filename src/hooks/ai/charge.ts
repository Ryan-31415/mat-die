import { SCIENTIST_OVERCHARGE_MS, SCIENTIST_OVERCHARGE_STUN_MS, SCIENTIST_OVERCHARGE_SLOW } from '@/types/projectile';
import type { Player } from '@/types/game';
import { playerMoveSpeed, playerOverlapsRect } from '@/types/combatPhysics';
import type { ActionStart } from './actionStart';
import type { AIWorld } from './world';

/** Known charge input after the first movement callback; false releases an orb,
 * never cancels it for free. Enemy future actions and resource drains are unknown.
 */
export function scientistChargeMotion(world: AIWorld, player: Player, start: ActionStart, hold: boolean) {
  const blocked = player.silenceDuration > world.deltaTime || world.hazardZones.some(zone =>
    zone.type === 'packet-block-zone' && zone.ownerId !== player.id &&
    (playerOverlapsRect(player, zone) || playerOverlapsRect({ ...player, ...start }, zone)));
  const wasCharging = player.isChargingSkill && !blocked;
  const regen = wasCharging ? 0 : player.character!.manaRegen / 100 * world.deltaTime / 1000 * player.maxMana *
    (world.isOvertime ? 2 : 1) * (player.mageUltimateDuration > world.deltaTime ? 1.67 : 1);
  const funded = Math.min(player.maxMana, player.mana + regen) >= player.character!.skill.manaCost;
  const active = !blocked && funded && (wasCharging || hold && player.skillCooldownRemaining <= world.deltaTime);
  const beganAt = wasCharging ? player.skillChargeStartTime ?? world.now : world.now;
  const charging = active && hold && world.now - beganAt <= SCIENTIST_OVERCHARGE_MS;
  const alreadyOvercharged = active && world.now - beganAt > SCIENTIST_OVERCHARGE_MS;
  const overchargeAt = alreadyOvercharged ? 0 : charging ? beganAt + SCIENTIST_OVERCHARGE_MS - world.now : Infinity;
  return {
    overchargeAt,
    speedAt(elapsedMs: number, deltaMs: number) {
      // Future charge effects resolve after movement in that callback too.
      const overcharged = alreadyOvercharged || elapsedMs - deltaMs > overchargeAt;
      // Holding past the existing limit produces self-stun, not free acceleration.
      if (overcharged && elapsedMs - overchargeAt <= SCIENTIST_OVERCHARGE_STUN_MS) return 0;
      return playerMoveSpeed({ ...player, isChargingSkill: charging && !overcharged, skillChargeStartTime: beganAt,
        isSlowed: player.isSlowed || overcharged,
        slowAmount: overcharged ? SCIENTIST_OVERCHARGE_SLOW : player.slowAmount }, world.now + elapsedMs);
    },
  };
}
