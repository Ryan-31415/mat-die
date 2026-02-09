import { useState, useCallback, useRef, useEffect } from 'react';
import { Player, Character, ARENA, PLAYER_SIZE, createInitialPlayer } from '@/types/game';
import { Projectile, HazardZone, AttackHitbox, createProjectile, createHazardZone, createAttackHitbox } from '@/types/projectile';
import { Platform, PLATFORMS, GRAVITY, JUMP_FORCE, MAX_FALL_SPEED, COYOTE_TIME } from '@/types/platform';
import { KeyboardState } from './useKeyboard';

const TICK_RATE = 1000 / 60; // 60 FPS

interface GameEngineState {
  players: [Player, Player];
  clones: Player[];
  projectiles: Projectile[];
  hazardZones: HazardZone[];
  attackHitboxes: AttackHitbox[];
  roundTimeRemaining: number;
  isRoundActive: boolean;
  roundWinner: 1 | 2 | 'draw' | null;
  isPaused: boolean;
  platforms: Platform[];
  isOvertime: boolean;
}

export const useGameEngine = (
  player1Character: Character,
  player2Character: Character,
  roundTimeLimit: number,
  onRoundEnd: (winner: 1 | 2 | 'draw') => void,
  gameMode: 'single' | 'multi' = 'multi',
  isOvertimeProp: boolean = false,
  roundNumber: number = 1
) => {
  const [gameState, setGameState] = useState<GameEngineState>(() => ({
    players: [
      createInitialPlayer(1, player1Character),
      createInitialPlayer(2, player2Character),
    ],
    clones: [],
    projectiles: [],
    hazardZones: [],
    attackHitboxes: [],
    roundTimeRemaining: isOvertimeProp ? 30 : roundTimeLimit,
    isRoundActive: true,
    roundWinner: null,
    isPaused: false,
    platforms: PLATFORMS,
    isOvertime: isOvertimeProp,
  }));

  const gameStateRef = useRef(gameState);
  const keysRefHolder = useRef<React.MutableRefObject<KeyboardState> | null>(null);
  const lastTickRef = useRef(Date.now());
  const roundStartTimeRef = useRef(Date.now());
  const shieldManaTickRef = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Flag to prevent duplicate round end calls
  const roundEndingRef = useRef(false);

  const setKeysRef = useCallback((ref: React.MutableRefObject<KeyboardState>) => {
    keysRefHolder.current = ref;
  }, []);

  const checkCollision = (
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number
  ): boolean => {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  };

  // Check platform collision and return the platform player is standing on
  const checkPlatformCollision = (
    player: Player,
    newY: number,
    velocityY: number,
    platforms: Platform[]
  ): { y: number; isGrounded: boolean; platform: Platform | null } => {
    const playerBottom = newY + PLAYER_SIZE;
    const playerLeft = player.x;
    const playerRight = player.x + PLAYER_SIZE;
    const playerTop = newY;

    for (const platform of platforms) {
      const platformTop = platform.y;
      const platformBottom = platform.y + platform.height;
      const platformLeft = platform.x;
      const platformRight = platform.x + platform.width;

      // Check horizontal overlap
      if (playerRight > platformLeft && playerLeft < platformRight) {
        // For one-way platforms, only check if falling down onto it
        if (platform.type === 'one-way') {
          // Player must be falling (or standing) and was above the platform
          if (velocityY >= 0 && player.y + PLAYER_SIZE <= platformTop + 10 && playerBottom >= platformTop) {
            return {
              y: platformTop - PLAYER_SIZE,
              isGrounded: true,
              platform,
            };
          }
        } else {
          // Solid platform - check all sides
          // Landing on top
          if (velocityY > 0 && player.y + PLAYER_SIZE <= platformTop && playerBottom >= platformTop) {
            return {
              y: platformTop - PLAYER_SIZE,
              isGrounded: true,
              platform,
            };
          }
          // Hitting from below
          if (velocityY < 0 && player.y >= platformBottom && playerTop < platformBottom) {
            return {
              y: platformBottom,
              isGrounded: false,
              platform: null,
            };
          }
        }
      }
    }

    return { y: newY, isGrounded: false, platform: null };
  };

  const applyDamage = (player: Player, damage: number, isHazard: boolean = false): { player: Player; dealt: number } => {
    // If truly invulnerable (Reaper ult), block everything
    if (player.isInvulnerable) return { player, dealt: 0 };

    // If Ninja is evading, block non-hazard hits
    if (player.isEvading && !isHazard) return { player, dealt: 0 };

    let damageMultiplier = 1.0;
    let isBreakingFreeze = false;

    if (player.isFrozen) {
      damageMultiplier = 1.0;
      isBreakingFreeze = false;
    }

    const actualDamage = damage * damageMultiplier * (1 - player.damageReduction);

    // Check dodge for ninja (non-hazard only)
    if (player.dodgesRemaining > 0 && !isHazard) {
      return {
        player: {
          ...player,
          dodgesRemaining: player.dodgesRemaining - 1,
          isEvading: true,
          evadeDuration: 500, // 0.5s
        },
        dealt: 0
      };
    }

    const newHealth = Math.max(0, player.health - actualDamage);

    let updatedPlayer = { ...player, health: newHealth };

    if (isBreakingFreeze) {
      updatedPlayer.isFrozen = false;
      updatedPlayer.frozenDuration = 0;
      updatedPlayer.freezeGauge = 0;
    }

    return {
      player: updatedPlayer,
      dealt: actualDamage
    };
  };

  // AI decision making for single-player mode
  const getAIKeys = (aiPlayer: Player, opponent: Player, projectiles: Projectile[], hazardZones: HazardZone[], platforms: Platform[], isOvertime: boolean, now: number): KeyboardState => {
    const distX = opponent.x - aiPlayer.x;
    const distY = opponent.y - aiPlayer.y;
    const distance = Math.sqrt(distX * distX + distY * distY);

    const isVerticalAligned = Math.abs(distY) < 60;
    const canMelee = aiPlayer.character!.id === 'gladiator' || aiPlayer.character!.id === 'ninja';

    // AI decision variables
    const isPlayer2 = aiPlayer.id === 2; // Player 2 uses arrow keys
    const aggressiveness = aiPlayer.health > aiPlayer.maxHealth * 0.5 ? 0.75 : 0.4;
    const ultimateChance = 0.25;

    const keys: KeyboardState = {
      a: false, d: false, w: false, s: false, space: false, q: false, e: false,
      arrowLeft: false, arrowRight: false, arrowUp: false, arrowDown: false,
      enter: false, shift: false, slash: false,
    };

    // 1. Dodging Logic (High Priority)
    const threateningProjectiles = projectiles.filter(p =>
      p.ownerId !== aiPlayer.id &&
      Math.abs(p.x - aiPlayer.x) < 300 &&
      Math.abs(p.y - aiPlayer.y) < 150 &&
      ((p.velocityX > 0 && p.x < aiPlayer.x) || (p.velocityX < 0 && p.x > aiPlayer.x))
    );

    const isHazardThreat = hazardZones.some(h => {
      if (h.ownerId === aiPlayer.id) return false;

      const hazardCenterX = h.x + h.width / 2;
      const hazardCenterY = h.y + h.height / 2;
      const playerCenterX = aiPlayer.x + PLAYER_SIZE / 2;
      const playerCenterY = aiPlayer.y + PLAYER_SIZE / 2;

      if (h.type === 'tesla-coil') {
        const dist = Math.sqrt(Math.pow(hazardCenterX - playerCenterX, 2) + Math.pow(hazardCenterY - playerCenterY, 2));
        return dist < (h.attackRange || 210) + 50; // Add 50px buffer
      }

      return Math.abs(hazardCenterX - playerCenterX) < (h.width / 2 + PLAYER_SIZE / 2 + 20) &&
        Math.abs(hazardCenterY - playerCenterY) < (h.height / 2 + PLAYER_SIZE / 2 + 20);
    });

    const isThreatened = threateningProjectiles.length > 0 || isHazardThreat;

    if (isThreatened) {
      if (aiPlayer.isGrounded) {
        if (Math.random() < 0.7) {
          if (isPlayer2) keys.arrowUp = true;
          else keys.w = true;
        }

        // Move away from the nearest threat
        let escapeDirection = 0; // -1 for left, 1 for right

        if (isHazardThreat) {
          // Find the nearest hazard and move away from it
          const nearestHazard = hazardZones
            .filter(h => h.ownerId !== aiPlayer.id)
            .sort((a, b) => {
              const distA = Math.sqrt(Math.pow(a.x - aiPlayer.x, 2) + Math.pow(a.y - aiPlayer.y, 2));
              const distB = Math.sqrt(Math.pow(b.x - aiPlayer.x, 2) + Math.pow(b.y - aiPlayer.y, 2));
              return distA - distB;
            })[0];

          if (nearestHazard) {
            escapeDirection = aiPlayer.x + PLAYER_SIZE / 2 > nearestHazard.x + nearestHazard.width / 2 ? 1 : -1;
          }
        } else if (threateningProjectiles.length > 0) {
          // Move away from the average projectile direction or just move sideways
          escapeDirection = distX > 0 ? -1 : 1;
        }

        if (escapeDirection === -1) {
          if (isPlayer2) keys.arrowLeft = true;
          else keys.a = true;
        } else if (escapeDirection === 1) {
          if (isPlayer2) keys.arrowRight = true;
          else keys.d = true;
        }
      }
    }

    // 2. Movement Logic
    const preferredDistance = aiPlayer.character!.attackRange * 0.8;
    const atLeftEdge = aiPlayer.x < ARENA.padding + 60;
    const atRightEdge = aiPlayer.x > ARENA.width - ARENA.padding - PLAYER_SIZE - 60;

    // Stable decision making based on time (every 150ms)
    // This prevents the AI from toggling keys every single frame
    const decisionSeed = Math.floor(now / 150);
    const getStableRandom = (offset: number) => {
      const val = Math.sin(decisionSeed + offset + aiPlayer.id) * 10000;
      return val - Math.floor(val);
    };

    const shouldFaceRight = distX > 0;
    let moveLeft = false;
    let moveRight = false;
    let jump = false;
    let drop = false;

    // Smart Navigation: Find stepping stones if target is too high
    let targetX = opponent.x;
    const isTargetTooHigh = distY < -180;

    if (isTargetTooHigh) {
      // Find a platform that is between us and the target vertically
      const steppingStone = platforms
        .filter(p => p.y < aiPlayer.y - 20 && p.y > opponent.y - 40)
        .sort((a, b) => {
          // Prefer platforms closer to our current X, then by proximity to target
          const distA = Math.abs(a.x + a.width / 2 - aiPlayer.x);
          const distB = Math.abs(b.x + b.width / 2 - aiPlayer.x);
          return distA - distB;
        })[0];

      if (steppingStone) {
        targetX = steppingStone.x + steppingStone.width / 2 - PLAYER_SIZE / 2;
      }
    }

    const relativeTargetX = targetX - aiPlayer.x;

    // Movement logic with larger deadzones
    const isCornered = (atLeftEdge && distX > 0 && distX < 250) || (atRightEdge && distX < 0 && distX > -250);

    if (atLeftEdge) {
      moveRight = true;
      // Only jump to escape if grounded or can double jump, and not already very high
      if (isCornered && !canMelee && (aiPlayer.isGrounded || aiPlayer.canDoubleJump) && aiPlayer.y > 300) {
        jump = true;
      }
    } else if (atRightEdge) {
      moveLeft = true;
      if (isCornered && !canMelee && (aiPlayer.isGrounded || aiPlayer.canDoubleJump) && aiPlayer.y > 300) {
        jump = true;
      }
    } else {
      if (distance > preferredDistance + 100 || isTargetTooHigh) {
        // Chase or move to stepping stone
        if (relativeTargetX > 40) moveRight = true;
        else if (relativeTargetX < -40) moveLeft = true;
      } else if (distance < preferredDistance - 100) {
        // Kite away ONLY if not currently attacking or preparing to attack
        if (aiPlayer.attackCooldownRemaining > 300) {
          if (distX > 0) moveLeft = true;
          else moveRight = true;
        }
      }
    }

    // Vertical Pursuit Logic
    // Only pursue vertically if we are "chasing" or trying to align for an attack
    // And not currently dodging a threat
    if (!isThreatened) {
      if (distY < -80) { // Target is significantly above
        // Jump if grounded
        if (aiPlayer.isGrounded || (aiPlayer.canDoubleJump && !aiPlayer.isJumping)) {
          // Prevent stuck jumping in corners if we're not moving horizontally towards target
          const isStuck = isCornered && Math.abs(relativeTargetX) < 50;
          if (!isStuck || Math.random() < 0.3) {
            jump = true;
          }
        }
      } else if (distY > 80) { // Target is significantly below
        // Drop down (crouch/move down)
        drop = true;
      }
    }

    // Apply movement keys
    if (isPlayer2) {
      keys.arrowLeft = moveLeft;
      keys.arrowRight = moveRight;
      if (jump) keys.arrowUp = true;
      if (drop) keys.arrowDown = true;
    } else {
      keys.a = moveLeft;
      keys.d = moveRight;
      if (jump) keys.w = true;
      if (drop) keys.s = true;
    }

    // 3. Attacking logic & Direction Correction
    const attackRangeThreshold = aiPlayer.character!.attackRange + (canMelee ? 40 : 180);

    // Use stable random for attack decision to prevent flickering
    // Require vertical alignment for ALL basic attacks (melee and ranged projectiles are horizontal)
    const isReadyToAttack = aiPlayer.attackCooldownRemaining === 0 &&
      distance < attackRangeThreshold &&
      isVerticalAligned;

    if (isReadyToAttack) {
      const attackChance = canMelee ? 0.6 : 0.3;
      if (getStableRandom(1) < attackChance) {
        // When attacking, OVERRIDE movement to face the player
        if (isPlayer2) {
          keys.arrowLeft = !shouldFaceRight;
          keys.arrowRight = shouldFaceRight;
          keys.enter = true;
        } else {
          keys.a = !shouldFaceRight;
          keys.d = shouldFaceRight;
          keys.space = true;
        }
      }
    }

    // 4. Skill usage with stable decision
    if (aiPlayer.mana >= aiPlayer.character!.skill.manaCost &&
      aiPlayer.skillCooldownRemaining === 0 &&
      distance < 450 &&
      getStableRandom(2) < 0.4) {

      let skillRequiresVertical = true;
      // Exceptions: Vertical drops or non-projectile skills
      if (aiPlayer.character!.id === 'mage') skillRequiresVertical = false; // Large Fireball (Drop)
      if (aiPlayer.character!.id === 'hunter') skillRequiresVertical = false; // Trap (Ground)
      if (aiPlayer.character!.id === 'gladiator') skillRequiresVertical = false; // Shield (Self)
      // Ninja Dash should probably align to hit, but used for gap close too. Let's require align for "attack" but maybe relax for gap close? 
      // User asked: "except... not horizontal projectiles". Ninja dash is horizontal movement.
      // If used for gap closing (dist > 200), we don't strictly need vertical align to initiate, but better if aligned.

      if (!skillRequiresVertical || isVerticalAligned) {
        // Character specific skill logic
        if (aiPlayer.character!.id === 'ninja' && distance > 200) {
          // Use dash to close gap
          if (isPlayer2) keys.shift = true;
          else keys.q = true;
        } else if (aiPlayer.character!.id === 'gladiator') {
          // Gladiator uses shield if threatened
          if (isThreatened || distance < 100) {
            if (isPlayer2) keys.shift = true;
            else keys.q = true;
          }
        } else {
          if (isPlayer2) keys.shift = true;
          else keys.q = true;
        }
      }
    }

    // 5. Ultimate usage
    if (aiPlayer.mana >= 100 &&
      (aiPlayer.health < aiPlayer.maxHealth * 0.4 || distance < 300 || Math.random() < ultimateChance)) {

      let ultRequiresVertical = true;
      // Exceptions: Global or Buffs or Vertical Drops
      if (aiPlayer.character!.id === 'mage') ultRequiresVertical = false; // Meteor (Random)
      if (aiPlayer.character!.id === 'ice-mage') ultRequiresVertical = false; // Blizzard (Global)
      if (aiPlayer.character!.id === 'ninja') ultRequiresVertical = false; // Buff + Clone
      if (aiPlayer.character!.id === 'gladiator') ultRequiresVertical = false; // Buff
      if (aiPlayer.character!.id === 'scientist') ultRequiresVertical = false; // Tesla Coil (Place)

      // Archer, Hunter, Reaper require alignment
      if (!ultRequiresVertical || isVerticalAligned) {
        if (isPlayer2) keys.slash = true;
        else keys.e = true;
      }
    }

    return keys;
  };

  const updatePlayer = (
    player: Player,
    keys: KeyboardState,
    deltaTime: number,
    otherPlayer: Player,
    shieldManaTick: number,
    hazardZones: HazardZone[],
    platforms: Platform[]
  ): { player: Player; newProjectiles: Projectile[]; newHitboxes: AttackHitbox[]; newHazards: HazardZone[]; newClones: Player[]; newShieldTick: number } => {
    const now = Date.now();
    const isP1 = player.id === 1;
    const character = player.character!;
    const manaMultiplier = gameState.isOvertime ? 2.0 : 1.0;
    const newProjectiles: Projectile[] = [];
    const newHitboxes: AttackHitbox[] = [];
    const newHazards: HazardZone[] = [];
    const newClones: Player[] = [];
    let newShieldTick = shieldManaTick;

    // Movement keys - W/ArrowUp is now JUMP
    const jumpKey = isP1 ? keys.w : keys.arrowUp;
    const moveDown = isP1 ? keys.s : keys.arrowDown; // For dropping through platforms
    const moveLeft = isP1 ? keys.a : keys.arrowLeft;
    const moveRight = isP1 ? keys.d : keys.arrowRight;
    const attackKey = isP1 ? keys.space : keys.enter;
    const skillKey = isP1 ? keys.q : keys.shift;
    const ultimateKey = isP1 ? keys.e : keys.slash;

    let updatedPlayer = { ...player };

    // HACKER ULTIMATE: System Override (Input Inversion)
    // If player is hacked, invert controls
    let effectiveMoveLeft = moveLeft;
    let effectiveMoveRight = moveRight;
    let effectiveJump = jumpKey;
    let effectiveMoveDown = moveDown;

    if (updatedPlayer.isHacked) {
      effectiveMoveLeft = moveRight;
      effectiveMoveRight = moveLeft;
      effectiveJump = moveDown;
      effectiveMoveDown = jumpKey;
    }

    // Use effective keys for movement logic
    // We need to override the variables used later
    // Logic below uses explicit checks like 'moveLeft', 'moveRight' etc.
    // So we'll use these effective variables in the movement section.

    // Update status effect durations
    if (updatedPlayer.poisonDuration > 0) {
      updatedPlayer.poisonDuration -= deltaTime;
      if (updatedPlayer.poisonDuration <= 0) {
        updatedPlayer.isPoisoned = false;
        updatedPlayer.poisonDuration = 0;
      }
    }
    if (updatedPlayer.slowDuration > 0) {
      updatedPlayer.slowDuration -= deltaTime;
      if (updatedPlayer.slowDuration <= 0) {
        updatedPlayer.isSlowed = false;
        updatedPlayer.slowDuration = 0;
        updatedPlayer.slowAmount = 0;
      }
    }
    if (updatedPlayer.rootDuration > 0) {
      updatedPlayer.rootDuration -= deltaTime;
      if (updatedPlayer.rootDuration <= 0) {
        updatedPlayer.rootDuration = 0;
      }
    }
    if (updatedPlayer.regenDuration > 0) {
      updatedPlayer.regenDuration -= deltaTime;
      const regenAmount = updatedPlayer.healthRegen * (deltaTime / 1000);
      updatedPlayer.health = Math.min(updatedPlayer.maxHealth, updatedPlayer.health + regenAmount);
      if (updatedPlayer.regenDuration <= 0) {
        updatedPlayer.regenDuration = 0;
        updatedPlayer.healthRegen = 0;
      }
    }
    if (updatedPlayer.stunDuration > 0) {
      updatedPlayer.stunDuration -= deltaTime;
      if (updatedPlayer.stunDuration <= 0) {
        updatedPlayer.isStunned = false;
        updatedPlayer.stunDuration = 0;
      }
    }
    if (updatedPlayer.frozenDuration > 0) {
      updatedPlayer.frozenDuration -= deltaTime;
      if (updatedPlayer.frozenDuration <= 0) {
        updatedPlayer.isFrozen = false;
        updatedPlayer.frozenDuration = 0;
      }
    }

    // Ice Mage Passive - check for freeze and decay
    // This logic applies to the player being updated, if their opponent is an Ice Mage
    if (otherPlayer.character?.id === 'ice-mage') {
      if (updatedPlayer.freezeGauge >= 5) {
        updatedPlayer.isFrozen = true;
        let freezeDur = 1000;

        // Ice Mage Blizzard: Increased freeze duration
        const inBlizzard = hazardZones.some(z =>
          z.type === 'blizzard' &&
          checkCollision(updatedPlayer.x, updatedPlayer.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
        );
        if (inBlizzard) {
          freezeDur *= 1.25;
        }

        updatedPlayer.frozenDuration = freezeDur;
        updatedPlayer.freezeGauge = 0;
      } else if (updatedPlayer.freezeGauge > 0 && now - updatedPlayer.lastHitByIceMage > 3000) {
        if (now - (updatedPlayer.lastFreezeGaugeDecay || 0) > 1500) {
          updatedPlayer.freezeGauge = Math.max(0, updatedPlayer.freezeGauge - 1);
          updatedPlayer.lastFreezeGaugeDecay = now;
        }
      }
    }
    if (updatedPlayer.invisibleDuration > 0) {
      updatedPlayer.invisibleDuration -= deltaTime;
      if (updatedPlayer.invisibleDuration <= 0) {
        updatedPlayer.isInvisible = false;
        updatedPlayer.invisibleDuration = 0;
        updatedPlayer.dodgesRemaining = 0;
        // Reset ninja ultimate buffs
        updatedPlayer.damageBoost = 0;
        updatedPlayer.speedBoost = 0;
      }
    }
    if (updatedPlayer.buffDuration > 0) {
      updatedPlayer.buffDuration -= deltaTime;
      if (updatedPlayer.buffDuration <= 0) {
        updatedPlayer.damageBoost = 0;
        updatedPlayer.speedBoost = 0;
        updatedPlayer.damageReduction = 0;
        updatedPlayer.buffDuration = 0;
      }
    }
    if (updatedPlayer.invulnerableDuration > 0) {
      updatedPlayer.invulnerableDuration -= deltaTime;
      if (updatedPlayer.invulnerableDuration <= 0) {
        updatedPlayer.isInvulnerable = false;
        updatedPlayer.invulnerableDuration = 0;
        updatedPlayer.isFlying = false;
        // Reset reaper ultimate speed boost
        if (updatedPlayer.character?.id === 'reaper') {
          updatedPlayer.speedBoost = 0;
          updatedPlayer.trailPositions = [];
        }
      }
    }
    if (updatedPlayer.markDuration && updatedPlayer.markDuration > 0) {
      updatedPlayer.markDuration -= deltaTime;
      if (updatedPlayer.markDuration <= 0) {
        updatedPlayer.isMarked = false;
        updatedPlayer.markDuration = 0;
        updatedPlayer.markOwnerId = undefined;
      }
    }
    if (updatedPlayer.hunterFocusedDuration && updatedPlayer.hunterFocusedDuration > 0) {
      updatedPlayer.hunterFocusedDuration -= deltaTime;
      if (updatedPlayer.hunterFocusedDuration <= 0) {
        updatedPlayer.hunterFocusedDuration = 0;
      }
    }
    if (updatedPlayer.evadeDuration > 0) {
      updatedPlayer.evadeDuration -= deltaTime;
      if (updatedPlayer.evadeDuration <= 0) {
        updatedPlayer.isEvading = false;
        updatedPlayer.evadeDuration = 0;
      }
    }

    // Mage ultimate duration
    if (updatedPlayer.mageUltimateDuration > 0) {
      updatedPlayer.mageUltimateDuration -= deltaTime;
      if (updatedPlayer.mageUltimateDuration <= 0) {
        updatedPlayer.mageUltimateDuration = 0;
        updatedPlayer.damageBoost = 0;
      }
    }

    // Hacker Status Effects
    if (updatedPlayer.silenceDuration > 0) {
      updatedPlayer.silenceDuration -= deltaTime;
      if (updatedPlayer.silenceDuration <= 0) {
        updatedPlayer.isSilenced = false;
        updatedPlayer.silenceDuration = 0;
      }
    }
    if (updatedPlayer.hackedDuration > 0) {
      updatedPlayer.hackedDuration -= deltaTime;
      if (updatedPlayer.hackedDuration <= 0) {
        updatedPlayer.isHacked = false;
        updatedPlayer.hackedDuration = 0;
      }
    }

    // Packet Block Zone Effect (Continuous Silence while inside)
    // Check if player is inside an ENEMY packet-block-zone
    const inPacketBlock = hazardZones.some(z =>
      z.type === 'packet-block-zone' &&
      z.ownerId !== updatedPlayer.id &&
      checkCollision(updatedPlayer.x, updatedPlayer.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
    );

    if (inPacketBlock) {
      updatedPlayer.isSilenced = true;
      updatedPlayer.silenceDuration = 100; // Persist for small amount after leaving
    } else if (updatedPlayer.silenceDuration <= 0) {
      updatedPlayer.isSilenced = false;
    }

    // Burn damage (from Mage ultimate)
    if (updatedPlayer.isBurning && updatedPlayer.burnDuration > 0) {
      updatedPlayer.burnDuration -= deltaTime;
      // Apply burn damage every 500ms
      if (now - updatedPlayer.lastBurnTick >= 500) {
        updatedPlayer.health = Math.max(0, updatedPlayer.health - updatedPlayer.burnDamagePerTick);
        updatedPlayer.lastBurnTick = now;
      }
      if (updatedPlayer.burnDuration <= 0) {
        updatedPlayer.isBurning = false;
        updatedPlayer.burnDuration = 0;
        updatedPlayer.burnDamagePerTick = 0;
        updatedPlayer.burnOwner = null;
      }
    }

    // Poison damage
    if (updatedPlayer.isPoisoned) {
      const poisonDamage = (updatedPlayer.maxHealth * 0.025) * (deltaTime / 1000);
      updatedPlayer.health = Math.max(0, updatedPlayer.health - poisonDamage);
    }

    // Mana regeneration
    // Scientist only regenerates mana when NOT charging
    const isCharging = character.id === 'scientist' && updatedPlayer.isChargingSkill;
    const manaRegen = isCharging ? 0 : (character.manaRegen / 100) * (deltaTime / 1000) * updatedPlayer.maxMana * manaMultiplier * (updatedPlayer.mageUltimateDuration > 0 ? 1.6 : 1.0);
    updatedPlayer.mana = Math.min(updatedPlayer.maxMana, updatedPlayer.mana + manaRegen);

    // Cooldown reduction
    if (updatedPlayer.skillCooldownRemaining > 0) {
      updatedPlayer.skillCooldownRemaining = Math.max(0, updatedPlayer.skillCooldownRemaining - deltaTime);
    }
    if (updatedPlayer.attackCooldownRemaining > 0) {
      updatedPlayer.attackCooldownRemaining = Math.max(0, updatedPlayer.attackCooldownRemaining - deltaTime);
    }

    // Apply gravity even when stunned

    // Apply gravity
    if (!updatedPlayer.isFlying && (!updatedPlayer.isGrounded || updatedPlayer.velocityY < 0)) {
      updatedPlayer.velocityY += GRAVITY * (deltaTime / 1000);
      updatedPlayer.velocityY = Math.min(MAX_FALL_SPEED, updatedPlayer.velocityY);
    } else if (updatedPlayer.isFlying) {
      updatedPlayer.velocityY = 0; // No gravity while flying
    }

    // Apply knockback decay
    if (Math.abs(updatedPlayer.knockbackVelocityX) > 10) {
      updatedPlayer.knockbackVelocityX *= Math.pow(0.9, deltaTime / 16); // Decay ~10% per frame (60fps)
    } else {
      updatedPlayer.knockbackVelocityX = 0;
    }
    if (Math.abs(updatedPlayer.knockbackVelocityY) > 10) {
      updatedPlayer.knockbackVelocityY *= Math.pow(0.9, deltaTime / 16);
    } else {
      updatedPlayer.knockbackVelocityY = 0;
    }

    // Skip movement/actions if stunned or frozen (but gravity was already applied)
    if (updatedPlayer.isStunned || updatedPlayer.isFrozen) {
      // Apply knockback even when stunned
      let stunnedNewX = updatedPlayer.x + updatedPlayer.knockbackVelocityX * (deltaTime / 1000);
      stunnedNewX = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, stunnedNewX));
      updatedPlayer.x = stunnedNewX;

      // Calculate new Y position for gravity even when stunned, including vertical knockback
      let stunnedNewY = updatedPlayer.y + (updatedPlayer.velocityY + updatedPlayer.knockbackVelocityY) * (deltaTime / 1000);

      let stunnedPlatformResult = { y: stunnedNewY, isGrounded: false, platform: null as Platform | null };
      if (!updatedPlayer.isFlying) {
        stunnedPlatformResult = checkPlatformCollision(updatedPlayer, stunnedNewY, updatedPlayer.velocityY + updatedPlayer.knockbackVelocityY, platforms);
      }
      if (stunnedPlatformResult.isGrounded && !updatedPlayer.isFlying) {
        stunnedNewY = stunnedPlatformResult.y;
        updatedPlayer.velocityY = 0;
        updatedPlayer.knockbackVelocityY = 0;
        updatedPlayer.isGrounded = true;
      } else {
        updatedPlayer.isGrounded = false;
      }
      stunnedNewY = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - PLAYER_SIZE, stunnedNewY));
      updatedPlayer.y = stunnedNewY;
      return { player: updatedPlayer, newProjectiles, newHitboxes, newHazards, newClones, newShieldTick };
    }

    // Shield handling for gladiator
    if (character.id === 'gladiator' && skillKey) {
      if (updatedPlayer.mana >= 5) {
        updatedPlayer.isShielding = true;
        newShieldTick += deltaTime;
        if (newShieldTick >= 500) {
          updatedPlayer.mana = Math.max(0, updatedPlayer.mana - 20); // Increased mana cost
          newShieldTick = 0;
        }
      } else {
        updatedPlayer.isShielding = false;
      }
    } else if (character.id === 'gladiator') {
      updatedPlayer.isShielding = false;
    }

    // Calculate speed
    let speed = character.speed;
    if (updatedPlayer.isShielding) speed *= 0.5;
    // Scientist charging speed penalty
    if (updatedPlayer.isChargingSkill) {
      const chargeTime = now - (updatedPlayer.skillChargeStartTime || now);
      const chargeRatio = Math.min(1, chargeTime / 1750);

      // Base penalty: 33% slow
      let slowFactor = 0.33;

      // Reinforced penalty: 40% slow if charged >= 50%
      if (chargeRatio >= 0.5) slowFactor = 0.40;

      speed *= (1 - slowFactor);
    }
    if (updatedPlayer.isSlowed) speed *= (1 - updatedPlayer.slowAmount);
    // Apply freeze gauge slow (10% per stack)
    if (updatedPlayer.freezeGauge > 0) speed *= (1 - (updatedPlayer.freezeGauge * 0.1));
    if (updatedPlayer.rootDuration > 0) speed = 0;
    speed *= (1 + updatedPlayer.speedBoost);

    // Horizontal Movement
    let dx = 0;
    if (effectiveMoveLeft) dx -= 1;
    if (effectiveMoveRight) dx += 1;

    let dy = 0;
    if (updatedPlayer.isFlying) {
      if (effectiveJump) dy -= 1;
      if (effectiveMoveDown) dy += 1;

      // Force horizontal movement if isFlying (Reaper constant movement)
      // Even if moving vertically, add horizontal component to ensure no stopping
      if (dx === 0) {
        dx = updatedPlayer.facingRight ? 1 : -1;
      }

      // Normalize for constant speed
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 0) {
        dx /= length;
        dy /= length;
      }
    }

    // Update facing direction
    if (dx > 0) updatedPlayer.facingRight = true;
    else if (dx < 0) updatedPlayer.facingRight = false;



    // Apply horizontal movement
    const moveAmount = speed * (deltaTime / 16) * 1.2;

    // Ice Mage Blizzard: Sliding physics
    const inBlizzard = hazardZones.some(z =>
      z.type === 'blizzard' &&
      z.ownerId !== updatedPlayer.id &&
      checkCollision(updatedPlayer.x, updatedPlayer.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
    );

    if (inBlizzard) {  // Preventing self-slide
      // Sliding physics: use velocityX for movement with low friction
      const acceleration = speed * 100; // Force applied when moving (increased to match normal speed)
      const friction = 0.99; // Low friction for sliding

      // Apply input force
      updatedPlayer.velocityX += dx * acceleration * (deltaTime / 1000);

      // Apply friction
      updatedPlayer.velocityX *= Math.pow(friction, deltaTime / 16);

      // Apply velocity to position
      let newX = updatedPlayer.x + updatedPlayer.velocityX * (deltaTime / 1000);

      // Combine with knockback (which is separate velocity)
      newX += updatedPlayer.knockbackVelocityX * (deltaTime / 1000);

      // Boundary checking
      newX = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, newX));
      updatedPlayer.x = newX;

      // Dampen velocity if hitting wall
      if (newX <= ARENA.padding || newX >= ARENA.width - ARENA.padding - PLAYER_SIZE) {
        updatedPlayer.velocityX *= -0.5; // Bounce slightly
      }

    } else {
      // Normal physics: high friction (instant stop)
      // moveAmount is already calculated above
      let newX = updatedPlayer.x + dx * moveAmount;
      newX += updatedPlayer.knockbackVelocityX * (deltaTime / 1000);

      // Boundary checking
      newX = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, newX));
      updatedPlayer.x = newX;

      // Reset horizontal velocity when not sliding (except knockback which is handled separately)
      updatedPlayer.velocityX = 0;
    }

    // Jumping logic
    const canJump = updatedPlayer.isGrounded || (now - updatedPlayer.lastGroundedTime < COYOTE_TIME);

    if (effectiveJump && canJump && !updatedPlayer.isJumping) {
      updatedPlayer.velocityY = JUMP_FORCE;
      updatedPlayer.isJumping = true;
      updatedPlayer.isGrounded = false;
    }

    // Reset jump flag when key released
    if (!effectiveJump) {
      updatedPlayer.isJumping = false;
    }

    // Calculate new Y position
    let newY = updatedPlayer.y;
    if (updatedPlayer.isFlying) {
      newY += dy * moveAmount;
    } else {
      newY += updatedPlayer.velocityY * (deltaTime / 1000);
    }

    // Apply vertical knockback to all modes
    newY += updatedPlayer.knockbackVelocityY * (deltaTime / 1000);

    // Platform collision detection
    let platformResult = { y: newY, isGrounded: false, platform: null as Platform | null };
    if (!updatedPlayer.isFlying) {
      platformResult = checkPlatformCollision(updatedPlayer, newY, updatedPlayer.velocityY + updatedPlayer.knockbackVelocityY, platforms);
    }

    if (platformResult.isGrounded) {
      newY = platformResult.y;
      updatedPlayer.velocityY = 0;
      updatedPlayer.knockbackVelocityY = 0;
      updatedPlayer.isGrounded = true;
      updatedPlayer.lastGroundedTime = now;

      // Drop through one-way platform - only if NOT currently jumping
      if (effectiveMoveDown && platformResult.platform?.type === 'one-way' && !updatedPlayer.isJumping) {
        updatedPlayer.isGrounded = false;
        newY += 25; // Push through platform
        updatedPlayer.velocityY = 300; // Add downward velocity
      }
    } else {
      updatedPlayer.isGrounded = false;
    }

    // Vertical boundary checking
    newY = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - PLAYER_SIZE, newY));

    // If hit bottom boundary, ground the player
    if (newY >= ARENA.height - ARENA.padding - PLAYER_SIZE) {
      newY = ARENA.height - ARENA.padding - PLAYER_SIZE;
      updatedPlayer.velocityY = 0;
      updatedPlayer.knockbackVelocityY = 0;
      updatedPlayer.isGrounded = true;
      updatedPlayer.lastGroundedTime = now;
    }

    updatedPlayer.y = newY;

    // Basic Attack
    if (attackKey && updatedPlayer.attackCooldownRemaining <= 0) {
      let cooldown = character.attackCooldown;
      // Archer Ultimate: +15% Attack Speed (reduce cooldown)
      if (character.id === 'archer' && updatedPlayer.buffDuration > 0) {
        cooldown /= 1.15;
      }
      updatedPlayer.attackCooldownRemaining = cooldown;
      updatedPlayer.isAttacking = true;

      const attackDirection = updatedPlayer.facingRight ? 1 : -1;
      // Start hitbox from the character's body edge (left if facing right, left-range if facing left)
      // This includes the character's own width in the hitbox to hit overlapping enemies
      const attackX = updatedPlayer.facingRight ? updatedPlayer.x : updatedPlayer.x - character.attackRange;
      const attackY = updatedPlayer.y + PLAYER_SIZE / 4;

      const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
      let damageBoost = updatedPlayer.damageBoost;
      // Archer Ultimate: +5% damage per stack
      if (character.id === 'archer' && updatedPlayer.buffDuration > 0) {
        damageBoost += (updatedPlayer.archerBuffStacks || 0) * 0.05;
      }

      // Hacker System Override: Reduce damage by 20%
      if (updatedPlayer.isHacked) {
        damageBoost -= 0.20;
      }

      // Hacker Packet Block: Check if standing in OWN packet-block-zone
      const inOwnPacketBlock = hazardZones.some(z =>
        z.type === 'packet-block-zone' &&
        z.ownerId === updatedPlayer.id &&
        checkCollision(updatedPlayer.x, updatedPlayer.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
      );

      if (character.id === 'hacker' && inOwnPacketBlock) {
        damageBoost += 0.25;
      }

      const baseDamage = character.attackDamage * (1 + damageBoost) * damageMultiplier;

      switch (character.id) {
        case 'gladiator':
          newHitboxes.push(createAttackHitbox(
            player.id,
            attackX,
            updatedPlayer.y, // Centered vertically for slash
            character.attackRange + PLAYER_SIZE, // Extended width to cover self
            PLAYER_SIZE, // Full height for slash
            baseDamage,
            200,
            false
          ));
          break;
        case 'archer': {
          const isPoisoned = updatedPlayer.poisonArrowsRemaining > 0;
          const isHoming = updatedPlayer.buffDuration > 0;
          newProjectiles.push({
            ...createProjectile(
              isPoisoned ? 'poison-arrow' : 'arrow',
              player.id,
              updatedPlayer.x + PLAYER_SIZE / 2,
              updatedPlayer.y + PLAYER_SIZE / 2,
              (isHoming ? attackDirection * 1330 : attackDirection * 1000), // Increased speed
              -80,
              isPoisoned ? baseDamage * 1.0 : baseDamage
            ),
            isHoming: isHoming
          });
          if (isPoisoned) {
            updatedPlayer.poisonArrowsRemaining--;
          }
          break;
        }
        case 'mage':
          newProjectiles.push(createProjectile(
            'fireball',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2,
            updatedPlayer.y + PLAYER_SIZE / 2,
            attackDirection * 750,
            0,
            baseDamage
          ));
          break;
        case 'ninja':
          newHitboxes.push(createAttackHitbox(
            player.id,
            attackX,
            updatedPlayer.y - 10, // Slightly higher for katana slash
            character.attackRange + PLAYER_SIZE, // Extended width to cover self
            PLAYER_SIZE * 1.1, // Larger slash area
            baseDamage,
            120, // Reduced duration for harder deflect
            true // Can deflect projectiles
          ));
          break;
        case 'scientist':
          newProjectiles.push(createProjectile(
            'flask',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2,
            updatedPlayer.y + PLAYER_SIZE / 2,
            attackDirection * 490,
            -120,
            baseDamage * 0.4
          ));
          break;
        case 'hunter':
          // Shotgun: 5 bullets (or 9 if Focused Fire) with spread
          const isFocused = (updatedPlayer.hunterFocusedDuration || 0) > 0;
          const bulletCount = isFocused ? 7 : 5;
          const spreadFactor = isFocused ? 0.35 : 1.0; // Tighter spread if focused
          const speedMultiplier = isFocused ? 1.2 : 1.0; // Faster bullets if focused
          const damageMultiplier = isFocused ? 1.0 : 1.0; // Increased damage if focused, Not used but kept for future use

          for (let i = 0; i < bulletCount; i++) {
            const centerIndex = (bulletCount - 1) / 2;
            const spreadAngle = (i - centerIndex) * 8 * spreadFactor;
            const radians = spreadAngle * (Math.PI / 180);

            newProjectiles.push(createProjectile(
              isFocused ? 'super-bullet' : 'bullet',
              player.id,
              updatedPlayer.x + PLAYER_SIZE / 2,
              updatedPlayer.y + PLAYER_SIZE / 2,
              attackDirection * 1250 * speedMultiplier * Math.cos(radians),
              850 * Math.sin(radians),
              baseDamage * 0.4 * damageMultiplier // Each bullet does 40% of base damage
            ));
          }
          break;
        case 'reaper':
          newHitboxes.push(createAttackHitbox(
            player.id,
            attackX - 10,
            updatedPlayer.y - 10,
            character.attackRange + PLAYER_SIZE + 20,
            PLAYER_SIZE + 20,
            baseDamage,
            250
          ));
          break;
        case 'ice-mage':
          newProjectiles.push(createProjectile(
            'snowball',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2,
            updatedPlayer.y + PLAYER_SIZE / 2,
            attackDirection * 680, // Direct fire
            0,
            baseDamage
          ));
          break;
        case 'hacker':
          const missile = createProjectile(
            'hacker-missile',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2,
            updatedPlayer.y + PLAYER_SIZE / 2,
            attackDirection * 800,
            0,
            baseDamage
          );
          // If in own packet block, this missile carries the swap effect
          // We can mark it using a special property not on the type yet, or deduce it on hit.
          // Actually, we calculated baseDamage with +25% already.
          // We need to know if we should swap on hit.
          if (inOwnPacketBlock) {
            // We'll use a property on the projectile to indicate it's a swap missile
            // Since we don't have a dedicated field, we can abuse `createsFirePool` or similar, or just check damage? 
            // Checking baseDamage is unreliable due to other buffs.
            // Let's add a temporary property or use `stunDuration` to flag it? No, stun has effect.
            // Let's rely on the damage calculation at hit time ONLY if we added a specific flag.
            // OR: We update Projectile interface to support `isSwapMissile`.
            // For now, let's cast it to any and add the prop, or add it to interface.
            // Let's stick to adding it to interface in types/projectile.ts? 
            // It's cleaner to check at hit time: "If projectile owner is Hacker AND projectile has specific damage?" No.
            // Let's add `knockback` as a signal? No.
            // Let's assume we can attach the swap logic to the hit handler by checking if the source was boosted.
            // We can just add a property to the object literal. JS allows it.
            (missile as any).isSwapMissile = true;
          }
          newProjectiles.push(missile);
          break;
      }

      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p =>
            p.id === player.id ? { ...p, isAttacking: false } : p
          ) as [Player, Player],
        }));
      }, 200);
    }

    // Skills (non-gladiator and non-scientist)
    // Also block skill if Silenced
    if (skillKey && !character.id.match(/^(gladiator|scientist)$/) && updatedPlayer.skillCooldownRemaining <= 0 && !updatedPlayer.isSilenced) {
      const manaCost = character.skill.manaCost;
      if (updatedPlayer.mana >= manaCost) {
        updatedPlayer.mana -= manaCost;
        updatedPlayer.skillCooldownRemaining = character.skill.cooldown;
        updatedPlayer.isUsingSkill = true;

        const attackDirection = updatedPlayer.facingRight ? 1 : -1;
        const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
        const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;

        switch (character.id) {
          case 'archer':
            updatedPlayer.poisonArrowsRemaining = 3;
            break;
          case 'mage':
            const largeFireball = createProjectile(
              'large-fireball',
              player.id,
              otherPlayer.x + PLAYER_SIZE / 2,
              0,
              0,
              675,
              baseDamage * 1.75
            );
            newProjectiles.push(largeFireball);
            break;
          case 'ninja':
            updatedPlayer.isDashing = true;
            const dashDistance = 270; // Increased range
            const dashX = updatedPlayer.x + (attackDirection * dashDistance);
            updatedPlayer.x = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, dashX));
            setTimeout(() => {
              setGameState(prev => ({
                ...prev,
                players: prev.players.map(p =>
                  p.id === player.id ? { ...p, isDashing: false } : p
                ) as [Player, Player],
              }));
            }, 200);
            break;
          case 'hunter':
            newProjectiles.push(createProjectile(
              'net',
              player.id,
              updatedPlayer.x + PLAYER_SIZE / 2,
              updatedPlayer.y + PLAYER_SIZE / 2,
              attackDirection * 750,
              -125,
              baseDamage * 0.2 // Low damage, utility focus
            ));
            break;
          case 'reaper':
            // Spawn bat slightly in front of the player to avoid initial overlap
            const batSpawnX = updatedPlayer.x + PLAYER_SIZE / 2 + (attackDirection * (PLAYER_SIZE / 2 + 20));
            const bat = createProjectile(
              'bat',
              player.id,
              batSpawnX,
              updatedPlayer.y + PLAYER_SIZE / 2, // Center vertically
              attackDirection * 550,
              0,
              baseDamage * 0.8,
            );
            // Clamp bat top-left inside arena so it doesn't immediately trigger bounds
            bat.x = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - bat.width, bat.x));
            bat.y = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - bat.height, bat.y));
            // Dev log: bat spawn (with clamped coords)
            if (process.env.NODE_ENV !== 'production') {
              // eslint-disable-next-line no-console
              console.log('BAT SPAWN', { id: bat.id, owner: bat.ownerId, x: bat.x, y: bat.y, vx: bat.velocityX, vy: bat.velocityY });
            }
            newProjectiles.push(bat);
            break;
          case 'ice-mage':
            // Avalanche: 4 large snowballs
            for (let i = 0; i < 4; i++) {
              setTimeout(() => {
                setGameState(prev => {
                  const projGap = 33;
                  const currentPlayer = prev.players[player.id - 1];
                  if (!currentPlayer) return prev;
                  const newProj = createProjectile(
                    'large-snowball',
                    player.id,
                    currentPlayer.x + PLAYER_SIZE / 2,
                    currentPlayer.y + PLAYER_SIZE / 2 + (i - 1) * projGap - projGap * 0.5, // Offset each snowball vertically
                    (currentPlayer.facingRight ? 1 : -1) * 900,
                    0,
                    baseDamage * 0.2
                  );
                  return {
                    ...prev,
                    projectiles: [...prev.projectiles, newProj],
                  };
                });
              }, 0);
            }
            break;
          case 'hacker':
            const zone = createHazardZone(
              'packet-block-zone',
              player.id,
              updatedPlayer.x + (attackDirection * 150),
              updatedPlayer.y - 50, // Slightly higher
              0, // No direct damage
              5000
            );
            // Center the zone ahead of player
            zone.x = updatedPlayer.x + PLAYER_SIZE / 2 + (attackDirection * 150) - (zone.width / 2);
            zone.y = ARENA.height - ARENA.padding - zone.height; // On ground? Or floating? "Install square area"
            // Let's put it on the ground level or centered on player Y?
            // "In front" implies same Y level.
            zone.y = updatedPlayer.y + PLAYER_SIZE / 2 - zone.height / 2;

            newHazards.push(zone);
            break;
        }

        setTimeout(() => {
          setGameState(prev => ({
            ...prev,
            players: prev.players.map(p =>
              p.id === player.id ? { ...p, isUsingSkill: false } : p
            ) as [Player, Player],
          }));
        }, 300);
      }
    }

    // Scientist Charge Logic
    if (character.id === 'scientist') {
      const manaCost = character.skill.manaCost;

      // Start Charging
      if (skillKey && !updatedPlayer.isChargingSkill && updatedPlayer.skillCooldownRemaining <= 0 && updatedPlayer.mana >= manaCost) {
        updatedPlayer.isChargingSkill = true;
        updatedPlayer.skillChargeStartTime = now;
      }

      // Continue Charging & Overcharge Check
      if (updatedPlayer.isChargingSkill) {
        // If mana drops below cost (e.g. drained), cancel charge
        if (updatedPlayer.mana < manaCost) {
          updatedPlayer.isChargingSkill = false;
          updatedPlayer.skillChargeStartTime = undefined;
        } else {
          const chargeDuration = now - (updatedPlayer.skillChargeStartTime || now);
          const fullChargeTime = 1750;
          const overchargeTime = fullChargeTime + 3000; // 3 seconds after full charge

          // Overcharge Self-Destruct
          if (chargeDuration > overchargeTime) {
            updatedPlayer.isChargingSkill = false;
            updatedPlayer.skillChargeStartTime = undefined;
            updatedPlayer.skillCooldownRemaining = character.skill.cooldown;

            // Self Damage: 6x Attack Damage
            const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
            const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;
            const selfDamage = baseDamage * 6;

            // Apply Self Damage
            const selfDamageResult = applyDamage(updatedPlayer, selfDamage);
            updatedPlayer = selfDamageResult.player;
            // If survived, apply status effects
            if (updatedPlayer.health > 0) {
              updatedPlayer.isStunned = true;
              updatedPlayer.stunDuration = 1250;

              updatedPlayer.isSlowed = true;
              updatedPlayer.slowAmount = 0.5;
              updatedPlayer.slowDuration = 6500;

              // Knockback backwards
              const facingDir = updatedPlayer.facingRight ? 1 : -1;
              updatedPlayer.knockbackVelocityX = -facingDir * 300;
              updatedPlayer.knockbackVelocityY = -200; // Slight pop up
              updatedPlayer.isGrounded = false;
            }

            // Area Damage to enemies
            // 3.75x Damage, Slow 40% 5s, Knockback 220
            const explosionDamage = baseDamage * 3.75;
            const explosion = createHazardZone(
              'electric-explosion',
              player.id,
              updatedPlayer.x,
              updatedPlayer.y,
              explosionDamage,
              200 // Instant duration
            );
            // Customizing hazard for explosion effect
            explosion.width = 250;
            explosion.height = 250;
            // Center it
            explosion.x = updatedPlayer.x + PLAYER_SIZE / 2 - explosion.width / 2;
            explosion.y = updatedPlayer.y + PLAYER_SIZE / 2 - explosion.height / 2;

            newHazards.push(explosion);

            // We need to apply this immediately to the other player? 
            // Hazard zones are processed in next tick usually, but instant explosion might need immediate handling if we want it "instant".
            // For now, let's use a short duration hazard or a projectile that explodes instantly.
            // Actually hazard zone logic handles damage over time. For instant burst, maybe projectile is better? 
            // Or just check collision right here.

            if (checkCollision(explosion.x, explosion.y, explosion.width, explosion.height, otherPlayer.x, otherPlayer.y, PLAYER_SIZE, PLAYER_SIZE)) {
              // Apply effects to opponent directly here or let hazard handle it?
              // Hazard logic in game loop applies damage based on tickRate. 
              // Let's create a special projectile "explosion" that lasts 1 frame?
              // Or simply stick to hazard but ensure it ticks once. 
              // The current hazard logic checks tickRate. If we set tickRate to 0 or small, it should tick.
              // Re-using 'electric-orb' logic but stationary might be easier visually.

              // Let's use a "System" where we manually apply damage to other player for instant effects?
              // No, sticking to patterns is better. 
              // Let's use a large projectile that explodes immediately.
              const explosionProj = createProjectile(
                'electric-orb',
                player.id,
                updatedPlayer.x + PLAYER_SIZE / 2,
                updatedPlayer.y + PLAYER_SIZE / 2,
                0, 0,
                explosionDamage
              );
              explosionProj.width = 1; // Invisible center
              explosionProj.height = 1;
              explosionProj.isExplosive = true;
              explosionProj.explosionRadius = 125; // 250 diameter
              explosionProj.lifetime = 50; // Instant
              explosionProj.knockback = 220;
              explosionProj.slowAmount = 0.4;
              explosionProj.slowDuration = 5000;
              newProjectiles.push(explosionProj);
            }
          }
        }
      }

      // Fire (Release Key)
      if (!skillKey && updatedPlayer.isChargingSkill) {
        const chargeStartTime = updatedPlayer.skillChargeStartTime || now;
        const chargeDuration = now - chargeStartTime;
        const chargeRatio = Math.min(1, chargeDuration / 1500);

        updatedPlayer.isChargingSkill = false;
        updatedPlayer.skillChargeStartTime = undefined;

        // Consume Mana
        updatedPlayer.mana -= manaCost;
        updatedPlayer.skillCooldownRemaining = character.skill.cooldown;

        // Calculate Stats
        const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
        // Damage: 1.25x to 3.75x of Attack Damage
        const damageScale = 1.25 + (2.5 * chargeRatio);
        const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier * damageScale;

        // Knockback: 90 to 220
        const knockback = 90 + (130 * chargeRatio);

        // Status: Slow -25% 4s (Base)
        // If >= 50% charge: Slow -40% 5s
        let slowAmount = 0.25;
        let slowDuration = 4000;
        if (chargeRatio >= 0.5) {
          slowAmount = 0.40;
          slowDuration = 5000;
        }

        // Stun: None base, 1s if 100% charge
        let stunDuration = 0;
        if (chargeRatio >= 1.0) {
          stunDuration = 1000;
        }

        const attackDirection = updatedPlayer.facingRight ? 1 : -1;

        const projectile = createProjectile(
          'electric-orb',
          player.id,
          updatedPlayer.x + PLAYER_SIZE / 2,
          updatedPlayer.y + PLAYER_SIZE / 2,
          attackDirection * 850,
          0,
          baseDamage
        );

        projectile.knockback = knockback;
        projectile.slowAmount = slowAmount;
        projectile.slowDuration = slowDuration;
        projectile.stunDuration = stunDuration;
        projectile.chargeLevel = chargeRatio; // For visuals

        // Scale projectile size based on charge?
        // Base size 33, max size 54
        projectile.width = 33 + (21 * chargeRatio);
        projectile.height = 33 + (21 * chargeRatio);
        // Adjust center after resize
        projectile.x = updatedPlayer.x + PLAYER_SIZE / 2 - projectile.width / 2;
        projectile.y = updatedPlayer.y + PLAYER_SIZE / 2 - projectile.height / 2;

        newProjectiles.push(projectile);
      }
    }

    // Ultimate
    // Block if Silenced
    if (ultimateKey && updatedPlayer.mana >= 100 && !updatedPlayer.isSilenced) {
      updatedPlayer.mana = 0;
      updatedPlayer.isUsingUltimate = true;

      const attackDirection = updatedPlayer.facingRight ? 1 : -1;
      const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
      const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;

      switch (character.id) {
        case 'gladiator':
          // enrage - boosts damage, speed, and damage reduction
          updatedPlayer.damageBoost = 0.35;
          updatedPlayer.speedBoost = 0.30;
          updatedPlayer.damageReduction = 0.25;
          updatedPlayer.buffDuration = 5000;
          updatedPlayer.regenDuration = 5000;
          updatedPlayer.healthRegen = updatedPlayer.maxHealth * 0.04; // 4% max health per second
          break;
        case 'archer':
          // Archer Ultimate: 4s buff, +20% damage (base), +15% attack speed (handled in cooldown)
          updatedPlayer.buffDuration = 4000;
          updatedPlayer.archerBuffStacks = 0;
          updatedPlayer.damageBoost = 0.20; // Base +20%
          break;
        case 'mage':
          // Fire Avatar - 5 second buff with fire ring
          updatedPlayer.mageUltimateDuration = 5000;
          updatedPlayer.damageBoost = 0.3; // 30% damage increase
          // Create fire ring hazard zone centered on mage
          newHazards.push(createHazardZone(
            'fire-ring',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2 - 90, // Center on player
            updatedPlayer.y + PLAYER_SIZE / 2 - 90,
            baseDamage * 0.15, // 15% of attack damage per tick
            5000 // 5 seconds duration
          ));
          break;

        case 'ninja':
          updatedPlayer.isInvisible = true;
          updatedPlayer.invisibleDuration = 4000;
          updatedPlayer.damageBoost = 0.25;
          updatedPlayer.speedBoost = 0.40;
          updatedPlayer.dodgesRemaining = 1;
          break;
        case 'scientist':
          newHazards.push(createHazardZone(
            'tesla-coil',
            player.id,
            updatedPlayer.x,
            updatedPlayer.y,
            baseDamage * 0.15,
            30000
          ));
          break;
        case 'hunter':
          // Focused Fire: 5s buff
          updatedPlayer.hunterFocusedDuration = 5000;
          updatedPlayer.damageBoost = 0.15; // +15% damage
          break;
        case 'reaper':
          updatedPlayer.isInvulnerable = true;
          updatedPlayer.isFlying = true;
          updatedPlayer.invulnerableDuration = 2500;
          updatedPlayer.speedBoost = 0.7;
          updatedPlayer.trailPositions = [];
          break;
        case 'ice-mage':
          // Throw blizzard stone
          const blizzardStone = createProjectile(
            'blizzard-stone',
            player.id,
            updatedPlayer.x,
            updatedPlayer.y,
            attackDirection * 600, // Throw forward
            -100, // High arc
            baseDamage * 0.05
          );
          newProjectiles.push(blizzardStone);
          break;
        case 'hacker':
          // System Override: Hack enemy
          // Effect applied in updatePlayer (via flags) immediately?
          // We need to set the state on the OTHER player.
          // updatePlayer returns new state for THIS player.
          // But we need to affect the OTHER player.
          // We can't do it here directly for the other player struct.
          // We should launch an invisible "hack" projectile or handle it in the game loop via a flag/event?
          // or just cheat and use a "hack-request" that gets processed in game loop?

          // Simplest way: Create a "hack-projectile" that instant hits.
          const hackProj = createProjectile(
            'electric-orb', // Reuse orb for visual or make invisible
            player.id,
            otherPlayer.x + PLAYER_SIZE / 2, // Instant hit location
            otherPlayer.y + PLAYER_SIZE / 2,
            0, 0, 0
          );
          hackProj.width = 1;
          hackProj.height = 1;
          hackProj.lifetime = 50;
          (hackProj as any).isHackUltimate = true; // Flag for collision handler
          newProjectiles.push(hackProj);
          break;
      }

      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p =>
            p.id === player.id ? { ...p, isUsingUltimate: false } : p
          ) as [Player, Player],
        }));
      }, 500);
    }

    return { player: updatedPlayer, newProjectiles, newHitboxes, newHazards, newClones, newShieldTick };
  };

  const gameLoop = useCallback(() => {
    const now = Date.now();
    const deltaTime = now - lastTickRef.current;
    lastTickRef.current = now;

    if (!keysRefHolder.current) {
      return;
    }
    const keys = keysRefHolder.current.current;

    setGameState(prev => {
      if (!prev.isRoundActive || prev.isPaused) return prev;

      // Update time
      const elapsedSeconds = (now - roundStartTimeRef.current) / 1000;
      const newTimeRemaining = Math.max(0, roundTimeLimit - elapsedSeconds);

      // Get player 1 keys from keyboard input
      const p1Keys = keysRefHolder.current?.current || {
        a: false,
        d: false,
        w: false,
        s: false,
        space: false,
        q: false,
        e: false,
        arrowLeft: false,
        arrowRight: false,
        arrowUp: false,
        arrowDown: false,
        enter: false,
        shift: false,
        slash: false,
      };


      // Get player 2 keys from AI or keyboard
      const p2Keys = gameMode === 'single' ? getAIKeys(prev.players[1], prev.players[0], prev.projectiles, prev.hazardZones, prev.platforms, prev.isOvertime, now) : p1Keys;

      // Update players
      const p1Result = updatePlayer(
        prev.players[0],
        p1Keys,
        deltaTime,
        prev.players[1],
        shieldManaTickRef.current[0],
        prev.hazardZones,
        prev.platforms
      );
      const p2Result = updatePlayer(
        prev.players[1],
        p2Keys,
        deltaTime,
        prev.players[0],
        shieldManaTickRef.current[1],
        prev.hazardZones,
        prev.platforms
      );

      shieldManaTickRef.current = [p1Result.newShieldTick, p2Result.newShieldTick];

      let players: [Player, Player] = [p1Result.player, p2Result.player];

      // Update clones
      let nextClones: Player[] = [];
      let cloneProjectiles: Projectile[] = [];
      let cloneHitboxes: AttackHitbox[] = [];
      let cloneHazards: HazardZone[] = [];

      prev.clones.forEach(clone => {
        if (clone.health <= 0) return;
        // Remove clones after 6 seconds
        if (now - clone.createdAt > 6000) return;

        const target = prev.players[clone.id === 1 ? 1 : 0];

        // Clone AI
        let aiKeys = getAIKeys(clone, target, prev.projectiles, prev.hazardZones, prev.platforms, prev.isOvertime, now);
        // Disable skills/ultimate for clones
        aiKeys = { ...aiKeys, q: false, e: false, shift: false, slash: false };

        const cloneRes = updatePlayer(
          clone,
          aiKeys,
          deltaTime,
          target,
          0,
          prev.hazardZones,
          prev.platforms
        );

        nextClones.push(cloneRes.player);
        cloneProjectiles.push(...cloneRes.newProjectiles);
        cloneHitboxes.push(...cloneRes.newHitboxes);
        cloneHazards.push(...cloneRes.newHazards);
      });

      // Add new clones spawned by players
      nextClones.push(...p1Result.newClones, ...p2Result.newClones);

      let projectiles = [...prev.projectiles, ...p1Result.newProjectiles, ...p2Result.newProjectiles, ...cloneProjectiles];
      let attackHitboxes = [...prev.attackHitboxes, ...p1Result.newHitboxes, ...p2Result.newHitboxes, ...cloneHitboxes];

      // Handle Replacements
      let hazardZones = [...prev.hazardZones];
      const newCoils = [...p1Result.newHazards, ...p2Result.newHazards, ...cloneHazards].filter(h => h.type === 'tesla-coil');
      if (newCoils.length > 0) {
        hazardZones = hazardZones.map(z => {
          if (z.type === 'tesla-coil' && newCoils.some(nc => nc.ownerId === z.ownerId)) {
            return { ...z, duration: 0, createdAt: 0 };
          }
          return z;
        });
      }
      const newTraps = [...p1Result.newHazards, ...p2Result.newHazards, ...cloneHazards].filter(h => h.type === 'bear-trap');
      if (newTraps.length > 0) {
        hazardZones = hazardZones.map(z => {
          if (z.type === 'bear-trap' && newTraps.some(nt => nt.ownerId === z.ownerId)) {
            return { ...z, duration: 0, createdAt: 0 };
          }
          return z;
        });
      }
      hazardZones = [...hazardZones, ...p1Result.newHazards, ...p2Result.newHazards, ...cloneHazards];

      const coilDamageMap = new Map<string, number>();

      // Update projectiles
      projectiles = projectiles.map(proj => {
        let newProj = { ...proj };

        // For bat projectiles: check if hit arena bounds and start returning (only once)
        if (newProj.type === 'bat' && newProj.isReturning) {
          const timeSinceCreated = now - newProj.createdAt;
          const owner = players[newProj.ownerId - 1];

          // Check if should return: after 35% of lifetime OR hit bounds
          const lifetimeThreshold = newProj.lifetime * 0.35;
          const shouldReturnByTime = timeSinceCreated > lifetimeThreshold;

          // Calculate next position to check bounds
          const nextX = newProj.x + newProj.velocityX * (deltaTime / 1000);
          const nextY = newProj.y + newProj.velocityY * (deltaTime / 1000);

          // Check if will hit arena bounds (only check after initial delay to prevent false positives)
          const hitBounds = timeSinceCreated > 50 && (
            nextX < ARENA.padding ||
            nextX > ARENA.width - ARENA.padding - newProj.width ||
            nextY < ARENA.padding ||
            nextY > ARENA.height - ARENA.padding - newProj.height
          );

          // Only set return velocity once; don't recalculate every frame near bounds
          if ((shouldReturnByTime || hitBounds) && Math.abs(newProj.velocityX) < 600) {
            // Start returning to owner (velocity < 600 ensures we set it only once from forward flight)
            const dx = (owner.x + PLAYER_SIZE / 2) - (newProj.x + newProj.width / 2);
            const dy = (owner.y + PLAYER_SIZE / 2) - (newProj.y + newProj.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 10) {
              const speed = 650;
              newProj.velocityX = (dx / dist) * speed;
              newProj.velocityY = (dy / dist) * speed;
              if (process.env.NODE_ENV !== 'production') {
                // eslint-disable-next-line no-console
                console.log('BAT RETURN', {
                  id: newProj.id,
                  owner: owner.id,
                  projCenter: { x: newProj.x + newProj.width / 2, y: newProj.y + newProj.height / 2 },
                  ownerCenter: { x: owner.x + PLAYER_SIZE / 2, y: owner.y + PLAYER_SIZE / 2 },
                  velocity: { x: newProj.velocityX, y: newProj.velocityY },
                  hitBounds,
                  timeSinceCreated,
                });
              }
            }
          }
          // Once returning, maintain velocity toward owner until collision
        } else if (newProj.isReturning) {
          // Other returning projectiles: original logic
          const owner = players[newProj.ownerId - 1];
          const timeSinceCreated = now - newProj.createdAt;
          // Start returning after 35% of lifetime
          if (timeSinceCreated > newProj.lifetime * 0.35) {
            const dx = (owner.x + PLAYER_SIZE / 2) - (newProj.x + newProj.width / 2);
            const dy = (owner.y + PLAYER_SIZE / 2) - (newProj.y + newProj.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 10) {
              const speed = 750;
              newProj.velocityX = (dx / dist) * speed;
              newProj.velocityY = (dy / dist) * speed;
            }
          }
        }

        // Homing Logic for Archer Ultimate
        if (newProj.isHoming && newProj.type === 'arrow') {
          const owner = players[newProj.ownerId - 1];
          const opponentId = newProj.ownerId === 1 ? 2 : 1;
          const target = players[opponentId - 1];

          // Basic Homing
          const dx = (target.x + PLAYER_SIZE / 2) - newProj.x;
          const dy = (target.y + PLAYER_SIZE / 2) - newProj.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist > 0) {
            const currentSpeed = Math.sqrt(newProj.velocityX * newProj.velocityX + newProj.velocityY * newProj.velocityY);
            const targetVx = (dx / dist) * currentSpeed;
            const targetVy = (dy / dist) * currentSpeed;

            // Turn rate increases with flight time (lifetime) and stacks
            const flightTime = now - newProj.createdAt;
            // Base turn rate + bonus from time + bonus from stacks
            // Time bonus: max at 325ms
            const timeFactor = Math.min(1, flightTime / 360);
            // Stack bonus: each stack adds performance
            const stackFactor = (owner.archerBuffStacks || 0);

            const turnRate = timeFactor >= 0.33 ? 0.045 + (0.015 * timeFactor) + (0.005 * stackFactor) : 0;

            newProj.velocityX += (targetVx - newProj.velocityX) * turnRate;
            newProj.velocityY += (targetVy - newProj.velocityY) * turnRate;

            // Normalize speed
            const newSpeed = Math.sqrt(newProj.velocityX * newProj.velocityX + newProj.velocityY * newProj.velocityY);
            newProj.velocityX = (newProj.velocityX / newSpeed) * currentSpeed;
            newProj.velocityY = (newProj.velocityY / newSpeed) * currentSpeed;

            // Rotate arrow visual (if renderer supports it, usually based on velocity)
          }
        }

        newProj.x += newProj.velocityX * (deltaTime / 1000);
        newProj.y += newProj.velocityY * (deltaTime / 1000);

        // Clamp bat position inside arena bounds and adjust velocity if clamped
        if (newProj.type === 'bat') {
          const clampedX = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - newProj.width, newProj.x));
          const clampedY = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - newProj.height, newProj.y));

          // If position was clamped (hit boundary), reset velocity toward owner
          const isClamped = clampedX !== newProj.x || clampedY !== newProj.y;
          if (isClamped && newProj.isReturning) {
            newProj.x = clampedX;
            newProj.y = clampedY;
            // Recalculate velocity to escape boundary
            const owner = players[newProj.ownerId - 1];
            const dx = (owner.x + PLAYER_SIZE / 2) - (newProj.x + newProj.width / 2);
            const dy = (owner.y + PLAYER_SIZE / 2) - (newProj.y + newProj.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 10) {
              const speed = 750;
              newProj.velocityX = (dx / dist) * speed;
              newProj.velocityY = (dy / dist) * speed;
            }
          } else {
            newProj.x = clampedX;
            newProj.y = clampedY;
          }
        }

        if (newProj.hasGravity) {
          newProj.velocityY += newProj.gravity * (deltaTime / 1000);
        }

        return newProj;
      });

      const newlySpawnedProjectiles: Projectile[] = [];

      // Check projectile collisions
      projectiles = projectiles.filter(proj => {
        // Check lifetime
        if (now - proj.createdAt > proj.lifetime) return false;

        // Check projectile-platform collision
        for (const platform of prev.platforms) {
          if (checkCollision(proj.x, proj.y, proj.width, proj.height, platform.x, platform.y, platform.width, platform.height)) {
            if (proj.type === 'flask') {
              const pool = createHazardZone(
                'toxic-pool',
                proj.ownerId,
                0, 0,
                proj.damage * 0.2,
                proj.firePoolDuration
              );

              pool.y = platform.y - pool.height / 2;
              pool.x = proj.x + proj.width / 2 - pool.width / 2;
              pool.x = Math.max(platform.x, Math.min(pool.x, platform.x + platform.width - pool.width));

              hazardZones.push(pool);
              return false; // Remove the flask
            }

            // For now, only projectiles with gravity are blocked by platforms (except meteors)
            if (proj.hasGravity && proj.type !== 'meteor' && !proj.isHoming) {
              if (proj.type === 'blizzard-stone') {
                const blizzard = createHazardZone(
                  'blizzard',
                  proj.ownerId,
                  0, 0,
                  proj.damage,
                  5000
                );
                blizzard.x = proj.x + proj.width / 2 - blizzard.width / 2;
                blizzard.y = platform.y - blizzard.height / 2; // On top of platform

                // Initial freeze on spawn
                const opponentId = proj.ownerId === 1 ? 2 : 1;
                const opponent = players[opponentId - 1];
                if (checkCollision(blizzard.x, blizzard.y, blizzard.width, blizzard.height, opponent.x, opponent.y, PLAYER_SIZE, PLAYER_SIZE)) {
                  players[opponentId - 1].isFrozen = true;
                  players[opponentId - 1].frozenDuration = 1500;
                }

                hazardZones.push(blizzard);
              }
              return false;
            }
          }
        }

        // Blizzard Stone ground collision
        if (proj.type === 'blizzard-stone' && proj.y + proj.height >= ARENA.height - ARENA.padding) {
          const blizzard = createHazardZone(
            'blizzard',
            proj.ownerId,
            0, 0,
            proj.damage,
            5000 // 5 seconds duration
          );
          blizzard.x = proj.x + proj.width / 2 - blizzard.width / 2;
          blizzard.y = ARENA.height - ARENA.padding - blizzard.height / 2; // On ground

          // Initial freeze on spawn
          const opponentId = proj.ownerId === 1 ? 2 : 1;
          const opponent = players[opponentId - 1];
          if (checkCollision(blizzard.x, blizzard.y, blizzard.width, blizzard.height, opponent.x, opponent.y, PLAYER_SIZE, PLAYER_SIZE)) {
            players[opponentId - 1].isFrozen = true;
            players[opponentId - 1].frozenDuration = 1500;
          }

          hazardZones.push(blizzard);
          return false;
        }

        // Check bounds
        if (proj.x < 0 || proj.x > ARENA.width || proj.y > ARENA.height) {
          if (proj.y > ARENA.height - ARENA.padding) {
            // Explode on ground
            if (proj.isExplosive && proj.createsFirePool) {
              const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
              const isToxic = proj.type === 'flask';
              const damage = isToxic ? proj.damage * 0.2 : proj.damage * 0.01;
              const pool = createHazardZone(
                poolType,
                proj.ownerId,
                0, 0,
                damage,
                proj.firePoolDuration
              );
              pool.y = ARENA.height - ARENA.padding - pool.width / 2; // Fixed to use width/height of pool
              // proj.x is top-left; center pool on projectile
              pool.x = proj.x + proj.width / 2 - pool.width / 2;
              hazardZones.push(pool);
            }


          }
          return false;
        }

        // Check collision with Tesla Coils
        const hitCoil = hazardZones.find(z => z.type === 'tesla-coil' && z.ownerId !== proj.ownerId && checkCollision(proj.x, proj.y, proj.width, proj.height, z.x, z.y, z.width, z.height));
        if (hitCoil) {
          coilDamageMap.set(hitCoil.id, (coilDamageMap.get(hitCoil.id) || 0) + proj.damage);

          if (proj.createsFirePool) {
            const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
            const isToxic = proj.type === 'flask';
            const damage = isToxic ? proj.damage * 0.2 : proj.damage * 0.01;
            const pool = createHazardZone(
              poolType,
              proj.ownerId,
              0, 0,
              damage,
              proj.firePoolDuration
            );
            // proj.x is top-left; center pool on projectile
            pool.x = proj.x + proj.width / 2 - pool.width / 2;
            pool.y = hitCoil.y + hitCoil.height - pool.height / 2;
            hazardZones.push(pool);
          }
          return false;
        }

        // Check player collision
        const timeSinceCreated = now - proj.createdAt;
        const isReturningToOwner = proj.isReturning && timeSinceCreated > proj.lifetime * 0.35;

        const opponentId = proj.ownerId === 1 ? 2 : 1;
        const targetPlayerIndex = opponentId - 1;
        const playerTarget = players[targetPlayerIndex];

        // For bat projectiles: allow damage on both forward and return path, but only once per direction
        if (proj.type === 'bat') {
          if (isReturningToOwner) {
            // Bat on return path - can hit if hasn't hit on return yet
            if (!playerTarget.isEvading && !playerTarget.isInvulnerable && !proj.hasHitReturn && checkCollision(
              proj.x, proj.y, proj.width, proj.height,
              playerTarget.x, playerTarget.y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              // Apply damage on return path
              const damageRes = applyDamage(playerTarget, proj.damage);
              players[targetPlayerIndex] = damageRes.player;
              proj.hasHitReturn = true; // Mark as hit on return path

              // Reaper Passive: Life steal 20%
              const ownerIndex = proj.ownerId - 1;
              if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
                const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.5 : 0.2;
                players[ownerIndex].health = Math.min(
                  players[ownerIndex].maxHealth,
                  players[ownerIndex].health + damageRes.dealt * regenMultiplier
                );
                // Accumulate damage for extra healing on return
                proj.damageAccumulated = (proj.damageAccumulated || 0) + damageRes.dealt;
              }
              // Continue returning to owner
              return true;
            }
          } else {
            // Bat on forward path - can hit player
            if (!playerTarget.isEvading && !playerTarget.isInvulnerable && !proj.hasHitForward && checkCollision(
              proj.x, proj.y, proj.width, proj.height,
              playerTarget.x, playerTarget.y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              if (playerTarget.isShielding) {
                const fromFront = (proj.ownerId === 1 && !playerTarget.facingRight) ||
                  (proj.ownerId === 2 && playerTarget.facingRight);
                if (fromFront) {
                  // Shield blocks bat
                  return false;
                }
              }

              const damageRes = applyDamage(playerTarget, proj.damage);
              players[targetPlayerIndex] = damageRes.player;
              proj.hasHitForward = true; // Mark as hit on forward path

              // Reaper Passive: Life steal 20%
              const ownerIndex = proj.ownerId - 1;
              if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
                const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.5 : 0.2;
                players[ownerIndex].health = Math.min(
                  players[ownerIndex].maxHealth,
                  players[ownerIndex].health + damageRes.dealt * regenMultiplier
                );
                // Accumulate damage for extra healing on return
                proj.damageAccumulated = (proj.damageAccumulated || 0) + damageRes.dealt;
              }

              // Returning projectiles don't disappear immediately on hit if they haven't returned yet
              if (proj.isReturning && timeSinceCreated < proj.lifetime * 0.35) {
                return true;
              }

              return false;
            }

            // Check collision with clones on forward path
            for (let i = 0; i < nextClones.length; i++) {
              const clone = nextClones[i];
              if (clone.id !== proj.ownerId && !clone.isEvading && !clone.isInvulnerable && checkCollision(proj.x, proj.y, proj.width, proj.height, clone.x, clone.y, PLAYER_SIZE, PLAYER_SIZE)) {
                const damageRes = applyDamage(clone, proj.damage);
                nextClones[i] = damageRes.player;
                if (proj.isReturning && timeSinceCreated < proj.lifetime * 0.35) {
                  return true;
                }
                return false;
              }
            }
          }
        } else {
          // Non-bat projectiles: original logic
          if (!isReturningToOwner) {
            // Check player collision first
            const hitPlayer = !playerTarget.isEvading && !playerTarget.isInvulnerable && checkCollision(
              proj.x, proj.y, proj.width, proj.height,
              playerTarget.x, playerTarget.y, PLAYER_SIZE, PLAYER_SIZE
            );

            // Find clone collision if player not hit
            let hitCloneIndex = -1;
            if (!hitPlayer) {
              hitCloneIndex = nextClones.findIndex(c => c.id !== proj.ownerId && !c.isEvading && !c.isInvulnerable && checkCollision(proj.x, proj.y, proj.width, proj.height, c.x, c.y, PLAYER_SIZE, PLAYER_SIZE));
            }

            if (hitPlayer || hitCloneIndex !== -1) {
              const target = hitPlayer ? playerTarget : nextClones[hitCloneIndex];
              let currentTarget = { ...target };

              if (currentTarget.isShielding) {
                const fromFront = (proj.ownerId === 1 && !currentTarget.facingRight) ||
                  (proj.ownerId === 2 && currentTarget.facingRight);
                if (fromFront) {
                  if (proj.canBeDeflected) {
                    proj.velocityX *= -1;
                    proj.ownerId = currentTarget.id as 1 | 2;
                    return true;
                  }
                  return false;
                }
              }

              // Check if this projectile has recently hit this target (for penetrating projectiles)
              // Allow re-hit after 100ms
              const lastHit = proj.lastHitTime[currentTarget.id] || 0;
              if (now - lastHit < 100) {
                return true;
              }

              // Archer Passive: Long range shot (> 325ms) deals 15% bonus damage
              if (players[proj.ownerId - 1].character?.id === 'archer' && now - proj.createdAt > 360) {
                // Check if it's an arrow
                if (proj.type === 'arrow' || proj.type === 'poison-arrow') {
                  const bonusDamage = proj.damage * 0.15;
                  const bonusRes = applyDamage(currentTarget, bonusDamage);
                  currentTarget = bonusRes.player;
                }
              }

              // Apply Mark Damage Boost
              let finalDamage = proj.damage;
              if (currentTarget.isMarked && currentTarget.markOwnerId === proj.ownerId) {
                finalDamage *= 1.2;
              }

              const damageRes = applyDamage(currentTarget, finalDamage);
              currentTarget = damageRes.player;

              // Archer Ultimate: Stacking buff on hit
              const ownerIndex = proj.ownerId - 1;
              if (players[ownerIndex].character?.id === 'archer' && players[ownerIndex].buffDuration > 0) {
                if (proj.type === 'arrow' || proj.type === 'poison-arrow') {
                  // Add stack
                  // Ensure stack count logic
                  const currentStacks = players[ownerIndex].archerBuffStacks || 0;
                  if (currentStacks < 4) {
                    players[ownerIndex].archerBuffStacks = currentStacks + 1;
                  }
                  // Extend duration
                  players[ownerIndex].buffDuration += 600;
                }
              }

              // Record hit time
              proj.lastHitTime[currentTarget.id] = now;

              // Ice Mage Passive
              if (players[proj.ownerId - 1].character?.id === 'ice-mage' && !currentTarget.isFrozen) {
                if (proj.type === 'snowball') {
                  currentTarget.freezeGauge = (currentTarget.freezeGauge || 0) + 1;
                  currentTarget.lastHitByIceMage = now;
                } else if (proj.type === 'large-snowball') {
                  if (Math.random() < 0.33) {
                    currentTarget.freezeGauge = (currentTarget.freezeGauge || 0) + 1;
                  }
                  currentTarget.lastHitByIceMage = now;
                }
              }

              // Reaper Passive: Life steal 20%

              if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
                const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.5 : 0.2;
                players[ownerIndex].health = Math.min(
                  players[ownerIndex].maxHealth,
                  players[ownerIndex].health + damageRes.dealt * regenMultiplier
                );
                // Accumulate damage for extra healing on return
                proj.damageAccumulated = (proj.damageAccumulated || 0) + damageRes.dealt;
              }

              // Net Logic: Pull + Mark
              if (proj.type === 'net') {
                currentTarget.isMarked = true;
                currentTarget.markDuration = 6000;
                currentTarget.markOwnerId = proj.ownerId;

                // Pull target towards owner
                const owner = players[proj.ownerId - 1];

                // Calculate pull direction
                let pullDirX = owner.x - currentTarget.x;
                // Add weak vertical pull (mostly horizontal)
                const pullDirY = (owner.y - currentTarget.y) * 0.5;

                const dist = Math.sqrt(pullDirX * pullDirX + pullDirY * pullDirY);

                if (dist > 20) { // Don't pull if already very close
                  const pullForce = 1050; // Increased force

                  // Use knockback velocity slots which are added to movement
                  currentTarget.knockbackVelocityX = (pullDirX / dist) * pullForce;
                  currentTarget.knockbackVelocityY = -300; // Tiny hop to ensure they get off ground

                  // Reset regular velocity to prevent fighting against the pull
                  currentTarget.velocityX = 0;
                  // Don't reset velocityY entirely so gravity still works naturally after hop

                  currentTarget.isGrounded = false;

                  // Brief stun to preventing immediate counter-movement
                  currentTarget.isStunned = true;
                  currentTarget.stunDuration = 200;
                }
              }

              // Hunter Mark Passive: Slow on hit by Hunter
              if (currentTarget.isMarked && currentTarget.markOwnerId === proj.ownerId) {
                // Apply 15% slow for 0.7s
                // Stack or overwrite? Let's overwrite/extend max
                const existingSlow = currentTarget.isSlowed ? currentTarget.slowAmount : 0;
                if (existingSlow < 0.15) {
                  currentTarget.isSlowed = true;
                  currentTarget.slowAmount = 0.15;
                  currentTarget.slowDuration = 700;
                } else if (currentTarget.isSlowed && currentTarget.slowAmount === 0.15) {
                  // Refresh duration if same strength
                  currentTarget.slowDuration = 700;
                }
                // If already slowed more (e.g. 50%), don't reduce it.
              }

              // Mage Skill: Large-fireball improvements
              if (proj.type === 'large-fireball' && players[ownerIndex].character?.id === 'mage') {
                // 25% bonus damage if target is airborne
                if (!currentTarget.isGrounded) {
                  const bonusDamage = proj.damage * 0; // Remaining former logic. but not used.
                  const bonusRes = applyDamage(currentTarget, bonusDamage);
                  currentTarget = bonusRes.player;
                }
                // Spawn 5 meteors at hit location with random offsets
                for (let i = 0; i < 5; i++) {
                  const xOffset = 0 + (i - 2) * 35;
                  const meteorProj = createProjectile(
                    'meteor',
                    proj.ownerId,
                    proj.x + proj.width / 2 + xOffset,
                    0, // Start from top
                    0,
                    750,
                    proj.damage * 0.25 // Adjusted damage for 5 meteors
                  );
                  newlySpawnedProjectiles.push(meteorProj);
                }
              }

              // Mage Ultimate: Apply burn effect on any attack
              if (players[ownerIndex].character?.id === 'mage' && players[ownerIndex].mageUltimateDuration > 0 && damageRes.dealt > 0) {
                currentTarget.isBurning = true;
                currentTarget.burnDuration = 3000; // 3 seconds
                currentTarget.burnDamagePerTick = players[ownerIndex].character.attackDamage * 0.20; // 20% of mage attack per tick
                currentTarget.burnOwner = proj.ownerId;
                currentTarget.lastBurnTick = now;
              }

              if (proj.isPoisonous) {
                currentTarget.isPoisoned = true;
                currentTarget.poisonDuration = proj.poisonDuration;
              }

              if (proj.slowAmount > 0) {
                currentTarget.isSlowed = true;
                let slowAmt = proj.slowAmount;

                // Ice Mage Blizzard: Increased slow amount
                const inBlizzard = hazardZones.some(z =>
                  z.type === 'blizzard' &&
                  checkCollision(currentTarget.x, currentTarget.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
                );
                if (inBlizzard) {
                  slowAmt *= 1.5;
                }

                currentTarget.slowAmount = slowAmt;
                currentTarget.slowDuration = proj.slowDuration;
              }
              if (proj.stunDuration > 0 && proj.type === 'electric-orb') {
                currentTarget.isStunned = true;
                currentTarget.stunDuration = proj.stunDuration;
              }
              if (proj.knockback > 0) {
                const knockbackDir = proj.velocityX > 0 ? 1 : -1;
                // Apply smooth knockback force instead of instant teleport
                // Apply smooth knockback force instead of instant teleport
                let kbForce = proj.knockback * 10;

                // Ice Mage Blizzard: Increased knockback
                const inBlizzard = hazardZones.some(z =>
                  z.type === 'blizzard' &&
                  checkCollision(currentTarget.x, currentTarget.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
                );
                if (inBlizzard) {
                  kbForce *= 1.5;
                }

                currentTarget.knockbackVelocityX = knockbackDir * kbForce;
              }

              // Ice Mage Blizzard Stone impact on player
              if (proj.type === 'blizzard-stone') {
                const blizzard = createHazardZone(
                  'blizzard',
                  proj.ownerId,
                  0, 0,
                  proj.damage,
                  5000 // 5 seconds duration
                );
                blizzard.x = proj.x + proj.width / 2 - blizzard.width / 2;
                blizzard.y = proj.y + proj.height / 2 - blizzard.height / 2; // Centered on impact

                // Initial freeze on spawn
                if (checkCollision(blizzard.x, blizzard.y, blizzard.width, blizzard.height, currentTarget.x, currentTarget.y, PLAYER_SIZE, PLAYER_SIZE)) {
                  currentTarget.isFrozen = true;
                  currentTarget.frozenDuration = 1000;
                }
                hazardZones.push(blizzard);
              }

              // Hacker Position Swap
              if ((proj as any).isSwapMissile) {
                // Swap positions!
                const attacker = players[proj.ownerId - 1];
                const victim = currentTarget;

                // Temp store
                const tempX = attacker.x;
                const tempY = attacker.y;

                // Apply swap
                // We need to update the attacker in the `players` array too.
                players[proj.ownerId - 1].x = victim.x;
                players[proj.ownerId - 1].y = victim.y;

                currentTarget.x = tempX;
                currentTarget.y = tempY;
              }

              // Hacker Ultimate Instant Hit
              if ((proj as any).isHackUltimate) {
                currentTarget.isHacked = true;
                currentTarget.hackedDuration = 4000;
              }

              // Final target update
              if (hitPlayer) players[targetPlayerIndex] = currentTarget;
              else nextClones[hitCloneIndex] = currentTarget;

              if ((proj as any).isHackUltimate) return false;

              if (proj.createsFirePool) {
                const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
                const isToxic = proj.type === 'flask';
                const damage = isToxic ? proj.damage * 0.2 : proj.damage * 0.02;
                const pool = createHazardZone(
                  poolType,
                  proj.ownerId,
                  0, 0,
                  damage,
                  proj.firePoolDuration
                );
                // proj.x/proj.y are top-left; center pool on projectile
                pool.x = proj.x + proj.width / 2 - pool.width / 2;
                pool.y = proj.y + proj.height / 2 - pool.height / 2;
                hazardZones.push(pool);
              }

              // Returning projectiles don't disappear immediately on hit if they haven't returned yet
              if (proj.isReturning) {
                if (timeSinceCreated < proj.lifetime * 0.35) {
                  return true;
                }
              }

              // Ice Mage skill projectiles (large-snowball) penetrate
              if (proj.type === 'large-snowball') {
                return true;
              }

              return false;
            }
          }
        }

        // If it's a returning projectile, check if it hits the owner to heal
        if (proj.isReturning) {
          const owner = players[proj.ownerId - 1];
          const timeSinceCreated = now - proj.createdAt;
          if (timeSinceCreated > proj.lifetime * 0.35) {
            if (checkCollision(
              proj.x, proj.y, proj.width, proj.height,
              owner.x, owner.y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              // For bat: heal base 50% of damage + bonus from hits
              if (proj.type === 'bat') {
                const baseHeal = 0;
                const bonusHeal = (proj.damageAccumulated || 0) * 0.5;
                const totalHeal = baseHeal + bonusHeal;
                if (totalHeal > 0) {
                  players[proj.ownerId - 1].health = Math.min(
                    players[proj.ownerId - 1].maxHealth,
                    players[proj.ownerId - 1].health + totalHeal
                  );
                }
              } else {
                // Other returning projectiles: heal only from accumulated damage
                const healAmount = (proj.damageAccumulated || 0) * 0.5;
                if (healAmount > 0) {
                  players[proj.ownerId - 1].health = Math.min(
                    players[proj.ownerId - 1].maxHealth,
                    players[proj.ownerId - 1].health + healAmount
                  );
                }
              }
              return false; // Remove projectile immediately
            }
          }
        }

        attackHitboxes.forEach(hitbox => {
          if (hitbox.ownerId !== proj.ownerId && hitbox.canDeflectProjectiles && proj.canBeDeflected) {
            if (checkCollision(
              proj.x, proj.y, proj.width, proj.height,
              hitbox.x, hitbox.y, hitbox.width, hitbox.height
            )) {
              proj.velocityX *= -1;
              proj.ownerId = hitbox.ownerId;
            }
          }
        });

        return true;
      });

      projectiles = [...projectiles, ...newlySpawnedProjectiles];

      // Check melee attack hitboxes
      attackHitboxes = attackHitboxes.filter(hitbox => {
        if (now - hitbox.createdAt > hitbox.duration) return false;

        const hitCoil = hazardZones.find(z => z.type === 'tesla-coil' && z.ownerId !== hitbox.ownerId && checkCollision(hitbox.x, hitbox.y, hitbox.width, hitbox.height, z.x, z.y, z.width, z.height));
        if (hitCoil) {
          coilDamageMap.set(hitCoil.id, (coilDamageMap.get(hitCoil.id) || 0) + hitbox.damage);
        }

        const targetIndex = hitbox.ownerId === 1 ? 1 : 0;
        const playerTarget = players[targetIndex];

        // Check collision with player
        const hitPlayer = !playerTarget.isEvading && !playerTarget.isInvulnerable && checkCollision(
          hitbox.x, hitbox.y, hitbox.width, hitbox.height,
          playerTarget.x, playerTarget.y, PLAYER_SIZE, PLAYER_SIZE
        );

        // Check collision with clones
        let hitCloneIndex = -1;
        if (!hitPlayer) {
          hitCloneIndex = nextClones.findIndex(c => c.id !== hitbox.ownerId && !c.isEvading && !c.isInvulnerable && checkCollision(hitbox.x, hitbox.y, hitbox.width, hitbox.height, c.x, c.y, PLAYER_SIZE, PLAYER_SIZE));
        }

        if (hitPlayer || hitCloneIndex !== -1) {
          const target = hitPlayer ? playerTarget : nextClones[hitCloneIndex];
          let currentTarget = { ...target };

          if (currentTarget.isShielding) {
            const fromFront = (hitbox.ownerId === 1 && !currentTarget.facingRight) ||
              (hitbox.ownerId === 2 && currentTarget.facingRight);
            if (fromFront) return true;
          }

          // Apply Mark Damage Boost
          let finalDamage = hitbox.damage;
          if (currentTarget.isMarked && currentTarget.markOwnerId === hitbox.ownerId) {
            finalDamage *= 1.2;
          }

          const damageRes = applyDamage(currentTarget, finalDamage);
          currentTarget = damageRes.player;

          // Reaper Passive: Life steal 20%
          const ownerIndex = hitbox.ownerId - 1;
          if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
            const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.5 : 0.2;
            players[ownerIndex].health = Math.min(
              players[ownerIndex].maxHealth,
              players[ownerIndex].health + damageRes.dealt * regenMultiplier
            );
          }

          // Mage Ultimate: Apply burn effect on melee attacks
          if (players[ownerIndex].character?.id === 'mage' && players[ownerIndex].mageUltimateDuration > 0 && damageRes.dealt > 0) {
            currentTarget.isBurning = true;
            currentTarget.burnDuration = 3500; // 3.5 seconds
            currentTarget.burnDamagePerTick = players[ownerIndex].character.attackDamage * 0.20;
            currentTarget.burnOwner = hitbox.ownerId;
            currentTarget.lastBurnTick = now;
          }

          // Apply smooth knockback
          currentTarget.knockbackVelocityX = (hitbox.x < currentTarget.x ? 1 : -1) * hitbox.knockback * 10;

          // Final target update
          if (hitPlayer) players[targetIndex] = currentTarget;
          else nextClones[hitCloneIndex] = currentTarget;

          return false;
        }


        return true;
      });

      // Update hazard zones
      const explosions: HazardZone[] = [];

      hazardZones = hazardZones.map(zone => {
        const zoneCopy = { ...zone };

        if (zoneCopy.type === 'tesla-coil' && zoneCopy.health !== undefined) {
          const damage = coilDamageMap.get(zoneCopy.id) || 0;
          if (damage > 0) {
            zoneCopy.health -= damage;
          }
          if (zoneCopy.health <= 0) {
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            if (checkCollision(
              zoneCopy.x + zoneCopy.width / 2 - 100, zoneCopy.y + zoneCopy.height / 2 - 100, 200, 200,
              players[targetIndex].x, players[targetIndex].y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              players[targetIndex] = applyDamage(players[targetIndex], 30, true).player;
            }

            explosions.push(createHazardZone(
              'electric-explosion',
              zoneCopy.ownerId,
              zoneCopy.x + zoneCopy.width / 2 - 95,
              zoneCopy.y + zoneCopy.height / 2 - 95,
              0,
              300
            ));
            return null;
          }
        }

        if (now - zoneCopy.createdAt > zoneCopy.duration) {
          if (zoneCopy.type === 'tesla-coil') {
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            if (checkCollision(
              zoneCopy.x + zoneCopy.width / 2 - 100, zoneCopy.y + zoneCopy.height / 2 - 100, 200, 200,
              players[targetIndex].x, players[targetIndex].y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              players[targetIndex] = applyDamage(players[targetIndex], 30, true).player;
            }

            explosions.push(createHazardZone(
              'electric-explosion',
              zoneCopy.ownerId,
              zoneCopy.x + zoneCopy.width / 2 - 95,
              zoneCopy.y + zoneCopy.height / 2 - 95,
              0,
              300
            ));
          }
          return null;
        }

        if (zoneCopy.type === 'tesla-coil' && zoneCopy.health !== undefined && zoneCopy.maxHealth !== undefined) {
          const selfDamageTick = zoneCopy.lastSelfDamage || zoneCopy.createdAt;
          if (now - selfDamageTick >= 500) {
            zoneCopy.health -= zoneCopy.maxHealth * 0.02;
            zoneCopy.lastSelfDamage = now;
          }
        }

        if (zoneCopy.type === 'tesla-coil') {
          const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
          const target = players[targetIndex];
          const dist = Math.hypot(
            (zoneCopy.x + zoneCopy.width / 2) - (target.x + PLAYER_SIZE / 2),
            (zoneCopy.y + zoneCopy.height / 2) - (target.y + PLAYER_SIZE / 2)
          );

          if (dist < (zoneCopy.attackRange || 150)) {
            if (!(zoneCopy.lastAttack && now - zoneCopy.lastAttack < (zoneCopy.attackCooldown || 200))) {
              zoneCopy.lastAttack = now;
              zoneCopy.lastAttackTarget = { x: target.x, y: target.y };
              players[targetIndex] = applyDamage(target, zoneCopy.damage, true).player;
            }
          }
        }

        // Bear Trap Trigger
        if (zoneCopy.type === 'bear-trap') {
          const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
          const target = players[targetIndex];
          if (checkCollision(
            zoneCopy.x, zoneCopy.y, zoneCopy.width, zoneCopy.height,
            target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
          )) {
            players[targetIndex] = applyDamage(target, zoneCopy.damage, true).player;
            players[targetIndex].rootDuration = 2000;
            players[targetIndex].isSlowed = true;
            players[targetIndex].slowAmount = 0.5;
            players[targetIndex].slowDuration = 4000;
            return null; // Remove trap
          }
        }

        if (zoneCopy.type === 'blizzard') {
          if (now - zoneCopy.lastTick >= zoneCopy.tickRate) {
            zoneCopy.lastTick = now;
            // Blizzard affects the opponent
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            const target = players[targetIndex];

            if (checkCollision(
              zoneCopy.x, zoneCopy.y, zoneCopy.width, zoneCopy.height,
              target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              // Apply damage
              const damageRes = applyDamage(target, zoneCopy.damage, true);
              players[targetIndex] = damageRes.player;

              // Apply freeze stack
              if (!players[targetIndex].isFrozen) {
                if (Math.random() <= 0.25) {
                  players[targetIndex].freezeGauge = (players[targetIndex].freezeGauge || 0) + 1;
                }
                players[targetIndex].lastHitByIceMage = now;
              }
            }
          }
        } else if (zoneCopy.type === 'fire-ring') {
          // Fire ring follows the Mage
          const owner = players[zoneCopy.ownerId - 1];
          zoneCopy.x = owner.x + PLAYER_SIZE / 2 - zoneCopy.width / 2;
          zoneCopy.y = owner.y + PLAYER_SIZE / 2 - zoneCopy.height / 2;

          // Apply damage every tick
          if (now - zoneCopy.lastTick >= zoneCopy.tickRate) {
            zoneCopy.lastTick = now;
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            const target = players[targetIndex];

            // Check if target is within circular fire ring range
            const ringCenterX = zoneCopy.x + zoneCopy.width / 2;
            const ringCenterY = zoneCopy.y + zoneCopy.height / 2;
            const targetCenterX = target.x + PLAYER_SIZE / 2;
            const targetCenterY = target.y + PLAYER_SIZE / 2;
            const distance = Math.sqrt(
              Math.pow(ringCenterX - targetCenterX, 2) +
              Math.pow(ringCenterY - targetCenterY, 2)
            );

            if (distance < zoneCopy.width / 2) {
              players[targetIndex] = applyDamage(target, zoneCopy.damage, true).player;
            }
          }
        } else if (zoneCopy.type !== 'tesla-coil' && zoneCopy.type !== 'bear-trap' && now - zoneCopy.lastTick >= zoneCopy.tickRate) {

          zoneCopy.lastTick = now;
          for (let i = 0; i < 2; i++) {
            if (i !== zoneCopy.ownerId - 1) {
              if (checkCollision(
                zoneCopy.x, zoneCopy.y, zoneCopy.width, zoneCopy.height,
                players[i].x, players[i].y, PLAYER_SIZE, PLAYER_SIZE
              )) {
                players[i] = applyDamage(players[i], zoneCopy.damage, true).player;
              }
            }
          }
        }

        return zoneCopy;
      }).filter((zone): zone is HazardZone => zone !== null);

      hazardZones = [...hazardZones, ...explosions];

      // Reaper Ultimate trail tracking
      for (let i = 0; i < 2; i++) {
        if (players[i].isFlying && players[i].character?.id === 'reaper') {
          // Initialize trail if not exists
          if (!players[i].trailPositions) {
            players[i].trailPositions = [];
          }
          // Add current position to trail every 50ms
          const lastTrailTime = players[i].trailPositions[players[i].trailPositions.length - 1]?.timestamp || 0;
          if (now - lastTrailTime >= 50) {
            players[i].trailPositions.push({
              x: players[i].x + PLAYER_SIZE / 2,
              y: players[i].y + PLAYER_SIZE / 2,
              timestamp: now,
            });
            // Keep only last 20 trail positions (1 second at 50ms intervals)
            if (players[i].trailPositions.length > 20) {
              players[i].trailPositions.shift();
            }
          }
          // Remove old trail positions (older than 1 second)
          players[i].trailPositions = players[i].trailPositions.filter(
            pos => now - pos.timestamp < 1000
          );
        }
      }

      // Reaper Ultimate contact damage
      for (let i = 0; i < 2; i++) {
        if (players[i].isFlying && players[i].character?.id === 'reaper') {
          const targetIndex = i === 0 ? 1 : 0;
          const target = players[targetIndex];
          // Ultimate damage hitbox is significantly larger (for visual sphere)
          if (checkCollision(
            players[i].x - 30, players[i].y - 30, PLAYER_SIZE + 60, PLAYER_SIZE + 60,
            target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
          )) {
            if (!players[i].lastUltTick || now - (players[i].lastUltTick || 0) >= 100) {
              const damageMultiplier = prev.isOvertime ? 2.0 : 1.0;
              const baseDamage = players[i].character.attackDamage * (1 + players[i].damageBoost) * damageMultiplier;
              const damageRes = applyDamage(target, baseDamage * 0.25, true); // 25% of base damage per tick (Area)
              players[targetIndex] = damageRes.player;
              // Life steal 20 -> 50%
              players[i].health = Math.min(players[i].maxHealth, players[i].health + damageRes.dealt * 0.5);
              players[i].lastUltTick = now;
              // Slow effect
              players[targetIndex].isSlowed = true;
              players[targetIndex].slowAmount = 0.2;
              players[targetIndex].slowDuration = 300;
            }
          }
        }
      }

      // Check win conditions
      let roundWinner: 1 | 2 | 'draw' | null = null;
      if (players[0].health <= 0 && players[1].health <= 0) roundWinner = 'draw';
      else if (players[0].health <= 0) roundWinner = 2;
      else if (players[1].health <= 0) roundWinner = 1;
      else if (newTimeRemaining <= 0) {
        if (players[0].health === players[1].health) roundWinner = 'draw';
        else roundWinner = players[0].health > players[1].health ? 1 : 2;
      }

      return {
        ...prev,
        players,
        clones: nextClones,
        projectiles,
        hazardZones,
        attackHitboxes,
        roundTimeRemaining: newTimeRemaining,
        isRoundActive: !roundWinner,
        roundWinner,
      };
    });
  }, [roundTimeLimit, gameMode, updatePlayer]);

  useEffect(() => {
    if (gameState.roundWinner && !roundEndingRef.current) {
      roundEndingRef.current = true;
      const timeoutId = setTimeout(() => {
        onRoundEnd(gameState.roundWinner!);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [gameState.roundWinner, onRoundEnd]);

  useEffect(() => {
    const interval = setInterval(gameLoop, TICK_RATE);
    return () => clearInterval(interval);
  }, [gameLoop]);

  const resetRound = useCallback(() => {
    roundStartTimeRef.current = Date.now();
    shieldManaTickRef.current = [0, 0];
    roundEndingRef.current = false;
    setGameState(prev => ({
      players: [
        createInitialPlayer(1, player1Character),
        createInitialPlayer(2, player2Character),
      ],
      clones: [],
      projectiles: [],
      hazardZones: [],
      attackHitboxes: [],
      roundTimeRemaining: isOvertimeProp ? 30 : roundTimeLimit,
      isRoundActive: true,
      roundWinner: null,
      isPaused: false,
      platforms: PLATFORMS,
      isOvertime: isOvertimeProp,
    }));
  }, [player1Character, player2Character, roundTimeLimit, isOvertimeProp]);

  const togglePause = useCallback(() => {
    setGameState(prev => ({ ...prev, isPaused: !prev.isPaused }));
  }, []);

  return {
    gameState,
    setKeysRef,
    resetRound,
    togglePause,
  };
};
