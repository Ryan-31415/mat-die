import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType, type Player } from '@/types/game';
import { MAPS } from '@/types/map';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { getAIKeys } from './gameAI';

const now = Date.now();
const player = (id: 1 | 2, character: CharacterType, props: Partial<Player> = {}): Player => ({
  ...createInitialPlayer(id, CHARACTERS[character]), x: id === 1 ? 200 : 500, y: 440,
  mana: 60, lastGroundedTime: now, ...props,
});
const decide = (ai: Player, enemy: Player) => getAIKeys(ai, enemy, [], [], MAPS.wasteland.platforms, false, now, 'wasteland');

describe('AI combat decisions', () => {
  it.each(['gladiator', 'ninja', 'reaper'] as const)('closes to actual melee range with %s', id => {
    const keys = decide(player(2, id), player(1, 'mage'));
    expect(keys.arrowLeft).toBe(true);
    expect(keys.shift).toBe(false);
  });

  it('does not waste the hunter shot outside its projectile lifetime', () => {
    expect(decide(player(2, 'hunter', { x: 550 }), player(1, 'mage')).shift).toBe(false);
    expect(decide(player(2, 'hunter', { x: 400 }), player(1, 'mage')).shift).toBe(true);
  });

  it('predicts that a falling opponent will enter the horizontal firing line', () => {
    const keys = decide(player(2, 'mage'), player(1, 'hacker', { y: 340, isGrounded: false, velocityY: 700 }));
    expect(keys.shift).toBe(true);
  });

  it('does not fire a straight shot at a high platform', () => {
    const keys = getAIKeys(player(2, 'mage'), player(1, 'hacker', { y: 140, x: 150 }), [], [], MAPS.default.platforms, false, now);
    expect(keys.shift).toBe(false);
  });

  it('avoids firing reflectable attacks into a facing shield', () => {
    expect(decide(player(2, 'mage'), player(1, 'gladiator', { isShielding: true, facingRight: true })).shift).toBe(false);
  });

  it.each(['isInvulnerable', 'isEvading'] as const)('saves attacks against %s', status => {
    const keys = decide(player(2, 'hunter', { x: 350 }), player(1, 'reaper', { [status]: true }));
    expect(keys.shift).toBe(false);
    expect(keys.enter).toBe(false);
  });

  it('prioritizes an ultimate over a skill competing for the same mana', () => {
    const keys = decide(player(2, 'archer', { mana: 100 }), player(1, 'mage'));
    expect(keys.backslash).toBe(true);
    expect(keys.enter).toBe(false);
  });

  it('backs away from an invulnerable reaper instead of chasing it into contact damage', () => {
    const keys = decide(player(2, 'gladiator', { x: 350 }), player(1, 'reaper', { isInvulnerable: true, isFlying: true }));
    expect(keys.arrowRight).toBe(true);
    expect(keys.shift).toBe(false);
  });

  it('does not refresh unused poison arrows or an active burst', () => {
    const keys = decide(player(2, 'archer', { mana: 100, poisonArrowsRemaining: 2, archerBurstRemaining: 4 }), player(1, 'mage'));
    expect(keys.enter).toBe(false);
    expect(keys.backslash).toBe(false);
  });

  it('does not place an out-of-range tesla coil even with full mana', () => {
    expect(decide(player(2, 'scientist', { mana: 100, x: 650 }), player(1, 'mage')).backslash).toBe(false);
    expect(decide(player(2, 'scientist', { mana: 100, x: 350 }), player(1, 'mage')).backslash).toBe(true);
  });

  it('holds scientist charge across decision ticks and releases at full power', () => {
    const ai = player(2, 'scientist', { isChargingSkill: true, skillChargeStartTime: now - 1000 });
    const enemy = player(1, 'mage');
    expect(decide(ai, enemy).enter).toBe(true);
    expect(decide({ ...ai, skillChargeStartTime: now - 1510 }, enemy).enter).toBe(false);
    expect(decide({ ...ai, skillChargeStartTime: now - 3600 }, { ...enemy, y: 100 }).enter).toBe(false);
  });

  it('blocks skills and ultimates while silenced and resumes a fresh charge afterward', () => {
    const ai = player(2, 'scientist', { mana: 100, isSilenced: true });
    const keys = decide(ai, player(1, 'mage'));
    expect(keys.enter).toBe(false);
    expect(keys.backslash).toBe(false);
    expect(decide({ ...ai, isSilenced: false }, player(1, 'mage')).enter).toBe(true);
  });

  it.each([1, 2] as const)('maps inverted controls correctly for player %s', id => {
    const ai = player(id, 'reaper', { x: 500 });
    const enemy = player(id === 1 ? 2 : 1, 'mage', { x: 200 });
    const normal = decide(ai, enemy);
    const hacked = decide({ ...ai, isHacked: true }, enemy);
    expect(hacked.a).toBe(normal.d); expect(hacked.d).toBe(normal.a);
    expect(hacked.arrowLeft).toBe(normal.arrowRight); expect(hacked.arrowRight).toBe(normal.arrowLeft);
    expect(hacked.w).toBe(normal.s); expect(hacked.arrowUp).toBe(normal.arrowDown);
  });

  it('keeps clones on basic attacks without spending abilities', () => {
    const keys = decide(player(1, 'ninja', { x: 450, mana: 100, isClone: true }), player(2, 'mage'));
    expect(keys.f).toBe(true); expect(keys.g).toBe(false); expect(keys.h).toBe(false);
  });
});

describe('AI navigation and survival', () => {
  it('escapes a falling projectile rather than treating zero horizontal speed as harmless', () => {
    const ai = player(2, 'mage', { x: 500 });
    const projectile = createProjectile('large-fireball', 1, 520, 320, 0, 750, 35);
    const keys = getAIKeys(ai, player(1, 'mage'), [projectile], [], MAPS.wasteland.platforms, false, now);
    expect(keys.arrowLeft || keys.arrowRight).toBe(true);
  });

  it('does not let attacking override escape from an imminent lightning strike', () => {
    const ai = player(2, 'mage', { x: 510 });
    const keys = getAIKeys(ai, player(1, 'mage'), [], [], MAPS.wasteland.platforms, false, now, 'graveyard', [
      { x: 490, warningStart: now - 1200, struck: false },
    ]);
    expect(keys.arrowRight).toBe(true);
    expect(keys.arrowLeft).toBe(false);
    expect(keys.shift).toBe(false);
  });

  it('ignores expired and friendly projectiles', () => {
    const ai = player(2, 'mage'); const enemy = player(1, 'mage');
    const shot = createProjectile('large-fireball', 2, 520, 320, 0, 750, 35);
    const expired = { ...shot, ownerId: 1 as const, createdAt: now - 5000 };
    expect(getAIKeys(ai, enemy, [shot, expired], [], MAPS.wasteland.platforms, false, now)).toEqual(decide(ai, enemy));
  });

  it('escapes a zone at an arena wall instead of running farther into the wall', () => {
    const ai = player(2, 'mage', { x: 740 });
    const zone = createHazardZone('toxic-pool', 1, 700, 420, 10, 5000);
    zone.width = 100; zone.height = 60;
    const keys = getAIKeys(ai, player(1, 'mage'), [], [zone], MAPS.wasteland.platforms, false, now);
    expect(keys.arrowLeft || keys.arrowUp).toBe(true);
    expect(keys.arrowRight).toBe(false);
  });

  it('takes a reachable intermediate platform instead of jumping at an unreachable target', () => {
    const ai = player(2, 'reaper', { x: 650 });
    const keys = getAIKeys(ai, player(1, 'mage', { x: 340, y: 210 }), [], [], MAPS.default.platforms, false, now);
    expect(keys.arrowUp).toBe(true);
    expect(keys.arrowLeft).toBe(true);
  });

  it('releases the jump key after landing so the next jump can trigger', () => {
    const ai = player(2, 'reaper', { x: 570, y: 310, isJumping: true });
    const enemy = player(1, 'mage', { x: 340, y: 210 });
    const keys = getAIKeys(ai, enemy, [], [], MAPS.default.platforms, false, now);
    expect(keys.arrowUp).toBe(false);
    expect(getAIKeys({ ...ai, isJumping: false }, enemy, [], [], MAPS.default.platforms, false, now).arrowUp).toBe(true);
  });

  it('does not follow a low opponent into lava', () => {
    const keys = getAIKeys(player(2, 'reaper', { x: 600, y: 320 }), player(1, 'mage', { x: 400 }), [], [], MAPS.volcano.platforms, false, now, 'volcano');
    expect(keys.arrowDown).toBe(false);
    expect(keys.enter).toBe(false);
  });

  it('does not dash to an unsupported volcano landing', () => {
    const keys = getAIKeys(player(2, 'ninja', { x: 650, y: 320 }), player(1, 'mage', { x: 350, y: 320 }), [], [], MAPS.volcano.platforms, false, now, 'volcano');
    expect(keys.enter).toBe(false);
  });

  it('is deterministic and does not mutate the world snapshot', () => {
    const ai = player(2, 'mage'); const enemy = player(1, 'mage');
    const snapshot = JSON.stringify([ai, enemy, MAPS.default.platforms]);
    expect(decide(ai, enemy)).toEqual(decide(ai, enemy));
    expect(JSON.stringify([ai, enemy, MAPS.default.platforms])).toBe(snapshot);
  });
});
