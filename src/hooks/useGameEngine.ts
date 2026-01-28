import { useState, useCallback, useRef, useEffect } from 'react';
import { Player, Character, ARENA, PLAYER_SIZE, createInitialPlayer } from '@/types/game';
import { Projectile, HazardZone, AttackHitbox, createProjectile, createHazardZone, createAttackHitbox } from '@/types/projectile';
import { Platform, PLATFORMS, GRAVITY, JUMP_FORCE, MAX_FALL_SPEED, COYOTE_TIME } from '@/types/platform';
import { KeyboardState } from './useKeyboard';

const TICK_RATE = 1000 / 60; // 60 FPS

interface GameEngineState {
  players: [Player, Player];
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
          // Player must be falling and was above the platform
          if (velocityY > 0 && player.y + PLAYER_SIZE <= platformTop + 5 && playerBottom >= platformTop) {
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

  const applyDamage = (player: Player, damage: number): Player => {
    const actualDamage = damage * (1 - player.damageReduction);

    // Check dodge for ninja
    if (player.dodgesRemaining > 0) {
      return {
        ...player,
        dodgesRemaining: player.dodgesRemaining - 1,
      };
    }

    const newHealth = Math.max(0, player.health - actualDamage);
    return {
      ...player,
      health: newHealth,
    };
  };

  // AI decision making for single-player mode
  const getAIKeys = (aiPlayer: Player, opponent: Player, projectiles: Projectile[], hazardZones: HazardZone[], isOvertime: boolean): KeyboardState => {
    const distX = opponent.x - aiPlayer.x;
    const distY = opponent.y - aiPlayer.y;
    const distance = Math.sqrt(distX * distX + distY * distY);

    const isVerticalAligned = Math.abs(distY) < 60;
    const isHorizontalAligned = Math.abs(distX) < aiPlayer.character!.attackRange;

    // AI decision variables
    const isPlayer2 = aiPlayer.id === 2; // Player 2 uses arrow keys
    const aggressiveness = 0.65; // How likely to attack (0-1)
    const skillChance = 0.3; // How likely to use skill
    const ultimateChance = 0.15; // How likely to use ultimate when available

    const keys: KeyboardState = {
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

    // 1. Dodging Logic (High Priority)
    // Check for threatening projectiles or hazards
    const isThreatened = projectiles.some(p =>
      p.ownerId !== aiPlayer.id &&
      Math.abs(p.x - aiPlayer.x) < 200 && // Close enough
      Math.abs(p.y - aiPlayer.y) < 100 && // Similar height
      ((p.velocityX > 0 && p.x < aiPlayer.x) || (p.velocityX < 0 && p.x > aiPlayer.x)) // Moving towards AI
    ) || hazardZones.some(h =>
      h.ownerId !== aiPlayer.id &&
      Math.abs(h.x + h.width / 2 - (aiPlayer.x + PLAYER_SIZE / 2)) < (h.width / 2 + PLAYER_SIZE / 2) && // Overlap X
      Math.abs(h.y + h.height / 2 - (aiPlayer.y + PLAYER_SIZE / 2)) < (h.height / 2 + PLAYER_SIZE / 2) // Overlap Y (standing in it)
    );

    if (isThreatened && aiPlayer.isGrounded) {
      // Jump to dodge
      if (isPlayer2) keys.arrowUp = true;
      else keys.w = true;
    }

    // 2. Movement Logic
    // basic movement with anti-camping
    if (distance > 130) {
      // Move towards opponent
      if (distX > 20) {
        if (isPlayer2) keys.arrowRight = true;
        else keys.d = true;
      } else if (distX < -20) {
        if (isPlayer2) keys.arrowLeft = true;
        else keys.a = true;
      }
    } else if (distance < 90) {
      // Move away from opponent (kiting)
      if (distX > 0) {
        if (isPlayer2) keys.arrowLeft = true;
        else keys.a = true;
      } else {
        if (isPlayer2) keys.arrowRight = true;
        else keys.d = true;
      }
    }

    // Vertical movement logic (Jump/Drop)
    if (aiPlayer.isGrounded) {
      // Jump if opponent is significantly above (unless already dodging)
      if (!keys.w && !keys.arrowUp && (distY < -80 || Math.random() < 0.005)) {
        if (isPlayer2) keys.arrowUp = true;
        else keys.w = true;
      }

      // Drop down platform if opponent is significantly below
      if (distY > 80) {
        if (isPlayer2) keys.arrowDown = true;
        else keys.s = true;
      }
    }

    // Attacking logic
    // Only attack if somewhat vertically aligned (especially for melee) or at range
    const canMelee = aiPlayer.character!.id === 'gladiator' || aiPlayer.character!.id === 'ninja';
    const attackRangeThreshold = aiPlayer.character!.attackRange + 50;

    if (distance < attackRangeThreshold && (isVerticalAligned || !canMelee) && Math.random() < aggressiveness) {
      if (isPlayer2) keys.enter = true;
      else keys.space = true;
    }

    // Skill usage
    if (aiPlayer.mana > aiPlayer.character!.skill.manaCost &&
      aiPlayer.skillCooldownRemaining === 0 &&
      distance < 300 &&
      Math.random() < skillChance) {
      if (isPlayer2) keys.shift = true;
      else keys.q = true;
    }

    // Ultimate usage when health is low or mana is high
    if (aiPlayer.mana >= aiPlayer.character!.ultimate.manaCost &&
      (aiPlayer.health < aiPlayer.maxHealth * 0.4 || Math.random() < ultimateChance)) {
      if (isPlayer2) keys.slash = true;
      else keys.e = true;
    }

    return keys;
  };

  const updatePlayer = (
    player: Player,
    keys: KeyboardState,
    deltaTime: number,
    otherPlayer: Player,
    shieldManaTick: number,
    platforms: Platform[]
  ): { player: Player; newProjectiles: Projectile[]; newHitboxes: AttackHitbox[]; newHazards: HazardZone[]; newShieldTick: number } => {
    const isP1 = player.id === 1;
    const character = player.character!;
    const manaMultiplier = gameState.isOvertime ? 2.0 : 1.0;
    const newProjectiles: Projectile[] = [];
    const newHitboxes: AttackHitbox[] = [];
    const newHazards: HazardZone[] = [];
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
    if (updatedPlayer.stunDuration > 0) {
      updatedPlayer.stunDuration -= deltaTime;
      if (updatedPlayer.stunDuration <= 0) {
        updatedPlayer.isStunned = false;
        updatedPlayer.stunDuration = 0;
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

    // Poison damage
    if (updatedPlayer.isPoisoned) {
      const poisonDamage = (updatedPlayer.maxHealth * 0.03) * (deltaTime / 1000);
      updatedPlayer.health = Math.max(0, updatedPlayer.health - poisonDamage);
    }

    // Mana regeneration
    const manaRegen = (character.manaRegen / 100) * (deltaTime / 1000) * updatedPlayer.maxMana;
    updatedPlayer.mana = Math.min(updatedPlayer.maxMana, updatedPlayer.mana + manaRegen);

    // Cooldown reduction
    if (updatedPlayer.skillCooldownRemaining > 0) {
      updatedPlayer.skillCooldownRemaining = Math.max(0, updatedPlayer.skillCooldownRemaining - deltaTime);
    }
    if (updatedPlayer.attackCooldownRemaining > 0) {
      updatedPlayer.attackCooldownRemaining = Math.max(0, updatedPlayer.attackCooldownRemaining - deltaTime);
    }

    // Apply gravity even when stunned
    const now = Date.now();

    // Apply gravity
    if (!updatedPlayer.isGrounded || updatedPlayer.velocityY < 0) {
      updatedPlayer.velocityY += GRAVITY * (deltaTime / 1000);
      updatedPlayer.velocityY = Math.min(MAX_FALL_SPEED, updatedPlayer.velocityY);
    }

    // Calculate new Y position for gravity
    let gravityNewY = updatedPlayer.y + updatedPlayer.velocityY * (deltaTime / 1000);

    // Platform collision detection for gravity
    const gravityPlatformResult = checkPlatformCollision(updatedPlayer, gravityNewY, updatedPlayer.velocityY, platforms);

    if (gravityPlatformResult.isGrounded) {
      gravityNewY = gravityPlatformResult.y;
      updatedPlayer.velocityY = 0;
      updatedPlayer.isGrounded = true;
      updatedPlayer.lastGroundedTime = now;
    } else {
      updatedPlayer.isGrounded = false;
    }

    // Vertical boundary checking
    gravityNewY = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - PLAYER_SIZE, gravityNewY));

    // If hit bottom boundary, ground the player
    if (gravityNewY >= ARENA.height - ARENA.padding - PLAYER_SIZE) {
      gravityNewY = ARENA.height - ARENA.padding - PLAYER_SIZE;
      updatedPlayer.velocityY = 0;
      updatedPlayer.isGrounded = true;
      updatedPlayer.lastGroundedTime = now;
    }

    updatedPlayer.y = gravityNewY;

    // Skip movement/actions if stunned (but gravity was already applied)
    if (updatedPlayer.isStunned) {
      return { player: updatedPlayer, newProjectiles, newHitboxes, newHazards, newShieldTick };
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
    if (updatedPlayer.isSlowed) speed *= (1 - updatedPlayer.slowAmount);
    speed *= (1 + updatedPlayer.speedBoost);

    // Horizontal Movement
    let dx = 0;
    if (moveLeft) dx -= 1;
    if (moveRight) dx += 1;

    // Update facing direction
    if (dx > 0) updatedPlayer.facingRight = true;
    else if (dx < 0) updatedPlayer.facingRight = false;

    // Apply horizontal movement
    const moveAmount = speed * (deltaTime / 16) * 1.2; // Reduced speed (70% of previous)
    let newX = updatedPlayer.x + dx * moveAmount;

    // Horizontal boundary checking
    newX = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, newX));
    updatedPlayer.x = newX;

    // Jumping logic (now is already defined above)
    const canJump = updatedPlayer.isGrounded || (now - updatedPlayer.lastGroundedTime < COYOTE_TIME);

    if (jumpKey && canJump && !updatedPlayer.isJumping) {
      updatedPlayer.velocityY = JUMP_FORCE;
      updatedPlayer.isJumping = true;
      updatedPlayer.isGrounded = false;
    }

    // Reset jump flag when key released
    if (!jumpKey) {
      updatedPlayer.isJumping = false;
    }

    // Calculate new Y position for jump
    let newY = updatedPlayer.y + updatedPlayer.velocityY * (deltaTime / 1000);

    // Platform collision detection for movement
    const platformResult = checkPlatformCollision(updatedPlayer, newY, updatedPlayer.velocityY, platforms);

    if (platformResult.isGrounded) {
      newY = platformResult.y;
      updatedPlayer.velocityY = 0;
      updatedPlayer.isGrounded = true;
      updatedPlayer.lastGroundedTime = now;

      // Drop through one-way platform
      if (moveDown && platformResult.platform?.type === 'one-way') {
        updatedPlayer.isGrounded = false;
        newY += 25; // Push through platform (more than 15px height)
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
      updatedPlayer.isGrounded = true;
      updatedPlayer.lastGroundedTime = now;
    }

    updatedPlayer.y = newY;

    // Basic Attack
    if (attackKey && updatedPlayer.attackCooldownRemaining <= 0) {
      updatedPlayer.attackCooldownRemaining = character.attackCooldown;
      updatedPlayer.isAttacking = true;

      const attackDirection = updatedPlayer.facingRight ? 1 : -1;
      // Start hitbox from the character's body edge (left if facing right, left-range if facing left)
      // This includes the character's own width in the hitbox to hit overlapping enemies
      const attackX = updatedPlayer.facingRight ? updatedPlayer.x : updatedPlayer.x - character.attackRange;
      const attackY = updatedPlayer.y + PLAYER_SIZE / 4;

      const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
      const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;

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
        case 'archer':
          newProjectiles.push(createProjectile(
            'arrow',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2,
            updatedPlayer.y + PLAYER_SIZE / 2,
            attackDirection * 950, // Increased speed
            -60,
            baseDamage
          ));
          break;
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
            attackDirection * 600, // Further increased range for better coverage
            -80,
            baseDamage
          ));
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

    // Skills (non-gladiator)
    if (skillKey && character.id !== 'gladiator' && updatedPlayer.skillCooldownRemaining <= 0) {
      const manaCost = character.skill.manaCost;
      if (updatedPlayer.mana >= manaCost) {
        updatedPlayer.mana -= manaCost;
        updatedPlayer.skillCooldownRemaining = character.skill.cooldown;
        updatedPlayer.isUsingSkill = true;

        const attackDirection = updatedPlayer.facingRight ? 1 : -1;
        const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost);

        switch (character.id) {
          case 'archer':
            newProjectiles.push(createProjectile(
              'poison-arrow',
              player.id,
              updatedPlayer.x + PLAYER_SIZE / 2,
              updatedPlayer.y + PLAYER_SIZE / 2,
              attackDirection * 950, // Increased speed
              -60,
              baseDamage * 1.1
            ));
            break;
          case 'mage':
            const largeFireball = createProjectile(
              'large-fireball',
              player.id,
              otherPlayer.x + PLAYER_SIZE / 2,
              0,
              0,
              480,
              baseDamage * 2
            );
            newProjectiles.push(largeFireball);
            break;
          case 'ninja':
            updatedPlayer.isDashing = true;
            const dashDistance = 300; // Increased range
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
          case 'scientist':
            newProjectiles.push(createProjectile(
              'electric-orb',
              player.id,
              updatedPlayer.x + PLAYER_SIZE / 2,
              updatedPlayer.y + PLAYER_SIZE / 2,
              attackDirection * 660,
              0,
              baseDamage * 2
            ));
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

    // Ultimate
    if (ultimateKey && updatedPlayer.mana >= 100) {
      updatedPlayer.mana = 0;
      updatedPlayer.isUsingUltimate = true;

      const attackDirection = updatedPlayer.facingRight ? 1 : -1;
      const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost);

      switch (character.id) {
        case 'gladiator':
          updatedPlayer.damageBoost = 0.35;
          updatedPlayer.speedBoost = 0.30;
          updatedPlayer.damageReduction = 0.25;
          updatedPlayer.buffDuration = 5000;
          break;
        case 'archer':
          // Shotgun arrows - 2 volleys of 5 arrows
          for (let volley = 0; volley < 2; volley++) {
            setTimeout(() => {
              setGameState(prev => {
                const arrows: Projectile[] = [];
                for (let i = 0; i < 5; i++) {
                  const spreadAngle = (i - 2) * 15;
                  const radians = spreadAngle * (Math.PI / 180);
                  arrows.push(createProjectile(
                    'arrow',
                    player.id,
                    prev.players[player.id - 1].x + PLAYER_SIZE / 2,
                    prev.players[player.id - 1].y + PLAYER_SIZE / 2,
                    attackDirection * 750 * Math.cos(radians), // Increased speed
                    -50 + Math.sin(radians) * 100,
                    baseDamage
                  ));
                }
                return {
                  ...prev,
                  projectiles: [...prev.projectiles, ...arrows],
                };
              });
            }, volley * 300);
          }
          break;
        case 'mage':
          // Meteor shower - 13 random fireballs
          for (let i = 0; i < 13; i++) {
            setTimeout(() => {
              setGameState(prev => {
                const randomX = ARENA.padding + Math.random() * (ARENA.width - 2 * ARENA.padding);
                return {
                  ...prev,
                  projectiles: [...prev.projectiles, createProjectile(
                    'meteor',
                    player.id,
                    randomX,
                    0,
                    0,
                    400,
                    baseDamage
                  )],
                };
              });
            }, i * 200);
          }
          break;
        case 'ninja':
          updatedPlayer.isInvisible = true;
          updatedPlayer.invisibleDuration = 4000;
          updatedPlayer.damageBoost = 0.50;
          updatedPlayer.speedBoost = 0.60;
          updatedPlayer.dodgesRemaining = 2;
          break;
        case 'scientist':
          newHazards.push(createHazardZone(
            'tesla-coil',
            player.id,
            updatedPlayer.x,
            updatedPlayer.y,
            baseDamage * 0.2,
            30000
          ));
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

    return { player: updatedPlayer, newProjectiles, newHitboxes, newHazards, newShieldTick };
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
      const p2Keys = gameMode === 'single' ? getAIKeys(prev.players[1], prev.players[0], prev.projectiles, prev.hazardZones, prev.isOvertime) : p1Keys;

      // Update players
      const p1Result = updatePlayer(
        prev.players[0],
        p1Keys,
        deltaTime,
        prev.players[1],
        shieldManaTickRef.current[0],
        prev.platforms
      );
      const p2Result = updatePlayer(
        prev.players[1],
        p2Keys,
        deltaTime,
        prev.players[0],
        shieldManaTickRef.current[1],
        prev.platforms
      );

      shieldManaTickRef.current = [p1Result.newShieldTick, p2Result.newShieldTick];

      let players: [Player, Player] = [p1Result.player, p2Result.player];
      let projectiles = [...prev.projectiles, ...p1Result.newProjectiles, ...p2Result.newProjectiles];
      let attackHitboxes = [...prev.attackHitboxes, ...p1Result.newHitboxes, ...p2Result.newHitboxes];

      // Handle Tesla Coil Replacement (Explode old ones)
      let hazardZones = [...prev.hazardZones];
      const newCoils = [...p1Result.newHazards, ...p2Result.newHazards].filter(h => h.type === 'tesla-coil');
      if (newCoils.length > 0) {
        hazardZones = hazardZones.map(z => {
          if (z.type === 'tesla-coil' && newCoils.some(nc => nc.ownerId === z.ownerId)) {
            return { ...z, duration: 0, createdAt: 0 }; // Expire immediately
          }
          return z;
        });
      }
      hazardZones = [...hazardZones, ...p1Result.newHazards, ...p2Result.newHazards];

      const coilDamageMap = new Map<string, number>();

      // Update projectiles
      projectiles = projectiles.map(proj => {
        let newProj = { ...proj };
        newProj.x += proj.velocityX * (deltaTime / 1000);
        newProj.y += proj.velocityY * (deltaTime / 1000);

        if (proj.hasGravity) {
          newProj.velocityY += proj.gravity * (deltaTime / 1000);
        }

        return newProj;
      });

      // Check projectile collisions
      projectiles = projectiles.filter(proj => {
        // Check lifetime
        if (now - proj.createdAt > proj.lifetime) return false;

        // Check bounds
        if (proj.x < 0 || proj.x > ARENA.width || proj.y > ARENA.height) {
          if (proj.isExplosive && proj.y > ARENA.height - ARENA.padding) {
            // Explode on ground
            if (proj.createsFirePool) {
              const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
              const isToxic = proj.type === 'flask';
              const damage = isToxic ? proj.damage * 0.15 : proj.damage * 0.01;
              const pool = createHazardZone(
                poolType,
                proj.ownerId,
                0, 0,
                damage,
                proj.firePoolDuration
              );
              pool.x = proj.x - pool.width / 2;
              pool.y = ARENA.height - ARENA.padding - pool.height / 2;
              hazardZones.push(pool);
            }
          }
          return false;
        }

        // Check Platform Collision (for Flasks/Explosives)
        if (proj.createsFirePool && proj.hasGravity) {
          const hitPlatform = prev.platforms.find(p => checkCollision(proj.x, proj.y, proj.width, proj.height, p.x, p.y, p.width, p.height));
          if (hitPlatform) {
            const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
            const isToxic = proj.type === 'flask';
            const damage = isToxic ? proj.damage * 0.15 : proj.damage * 0.01;
            const pool = createHazardZone(
              poolType,
              proj.ownerId,
              0, 0,
              damage,
              proj.firePoolDuration
            );
            pool.x = proj.x - pool.width / 2;
            pool.y = hitPlatform.y - pool.height / 2;
            hazardZones.push(pool);
            return false;
          }
        }

        // Check collision with Tesla Coils
        const hitCoil = hazardZones.find(z => z.type === 'tesla-coil' && z.ownerId !== proj.ownerId && checkCollision(proj.x, proj.y, proj.width, proj.height, z.x, z.y, z.width, z.height));
        if (hitCoil) {
          coilDamageMap.set(hitCoil.id, (coilDamageMap.get(hitCoil.id) || 0) + proj.damage);

          // Create fire pool if applicable
          if (proj.createsFirePool) {
            const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
            const isToxic = proj.type === 'flask';
            const damage = isToxic ? proj.damage * 0.15 : proj.damage * 0.01;
            const pool = createHazardZone(
              poolType,
              proj.ownerId,
              0, 0,
              damage,
              proj.firePoolDuration
            );
            pool.x = proj.x - pool.width / 2;
            pool.y = hitCoil.y + hitCoil.height - pool.height / 2;
            hazardZones.push(pool);
          }
          return false;
        }

        // Check player collision
        const targetPlayer = proj.ownerId === 1 ? 1 : 0;
        const target = players[targetPlayer];

        if (checkCollision(
          proj.x, proj.y, proj.width, proj.height,
          target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
        )) {
          // Check Shield Logic (Only if hits player)
          if (target.isShielding) {
            const fromFront = (proj.ownerId === 1 && !target.facingRight) ||
              (proj.ownerId === 2 && target.facingRight);
            if (fromFront) {
              if (proj.canBeDeflected) {
                proj.velocityX *= -1;
                proj.ownerId = target.id as 1 | 2;
                return true; // Reflect
              }
              return false; // Block
            }
          }

          // Apply damage
          players[targetPlayer] = applyDamage(target, proj.damage);

          // Apply status effects
          if (proj.isPoisonous) {
            players[targetPlayer].isPoisoned = true;
            players[targetPlayer].poisonDuration = proj.poisonDuration;
          }
          if (proj.slowAmount > 0) {
            players[targetPlayer].isSlowed = true;
            players[targetPlayer].slowAmount = proj.slowAmount;
            players[targetPlayer].slowDuration = proj.slowDuration;
          }
          if (proj.stunDuration > 0 && proj.type === 'electric-orb') {
            players[targetPlayer].isStunned = true;
            players[targetPlayer].stunDuration = proj.stunDuration;
          }
          if (proj.knockback > 0) {
            const knockbackDir = proj.velocityX > 0 ? 1 : -1;
            players[targetPlayer].x = Math.max(
              ARENA.padding,
              Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, target.x + knockbackDir * proj.knockback)
            );
          }

          // Create fire pool if applicable
          if (proj.createsFirePool) {
            const poolType = proj.type === 'flask' ? 'toxic-pool' : 'fire-pool';
            const isToxic = proj.type === 'flask';
            const damage = isToxic ? proj.damage * 0.15 : proj.damage * 0.02;
            const pool = createHazardZone(
              poolType,
              proj.ownerId,
              0, 0,
              damage,
              proj.firePoolDuration
            );
            pool.x = proj.x - pool.width / 2;
            pool.y = proj.y - pool.height / 2;
            hazardZones.push(pool);
          }

          return false;
        }

        // Check if ninja can deflect
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

      // Check melee attack hitboxes
      attackHitboxes = attackHitboxes.filter(hitbox => {
        if (now - hitbox.createdAt > hitbox.duration) return false;

        // Check collision with Tesla Coils
        const hitCoil = hazardZones.find(z => z.type === 'tesla-coil' && z.ownerId !== hitbox.ownerId && checkCollision(hitbox.x, hitbox.y, hitbox.width, hitbox.height, z.x, z.y, z.width, z.height));
        if (hitCoil) {
          coilDamageMap.set(hitCoil.id, (coilDamageMap.get(hitCoil.id) || 0) + hitbox.damage);
        }

        const targetIndex = hitbox.ownerId === 1 ? 1 : 0;
        const target = players[targetIndex];

        // Check shield
        if (target.isShielding) {
          const fromFront = (hitbox.ownerId === 1 && !target.facingRight) ||
            (hitbox.ownerId === 2 && target.facingRight);
          if (fromFront) return true; // Block but keep hitbox
        }

        if (checkCollision(
          hitbox.x, hitbox.y, hitbox.width, hitbox.height,
          target.x, target.y, PLAYER_SIZE, PLAYER_SIZE
        )) {
          players[targetIndex] = applyDamage(target, hitbox.damage);
          if (hitbox.knockback > 0) {
            const knockbackDir = hitbox.x < target.x ? 1 : -1;
            players[targetIndex].x = Math.max(
              ARENA.padding,
              Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, target.x + knockbackDir * hitbox.knockback)
            );
          }
          return false;
        }

        return true;
      });

      // Update hazard zones
      const explosions: HazardZone[] = [];

      hazardZones = hazardZones.map(zone => {
        const zoneCopy = { ...zone };

        // Apply coil damage
        if (zoneCopy.type === 'tesla-coil' && zoneCopy.health !== undefined) {
          const damage = coilDamageMap.get(zoneCopy.id) || 0;
          if (damage > 0) {
            zoneCopy.health -= damage;
          }
          if (zoneCopy.health <= 0) {
            // Trigger explosion (2x range)
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            if (checkCollision(
              zoneCopy.x - 100, zoneCopy.y - 100, 200, 200,
              players[targetIndex].x, players[targetIndex].y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              players[targetIndex] = applyDamage(players[targetIndex], 30);
            }

            // Add visual explosion
            explosions.push(createHazardZone(
              'electric-explosion',
              zoneCopy.ownerId,
              zoneCopy.x - 30, // Centered
              zoneCopy.y - 30,
              0,
              300
            ));
            return null;
          }
        }

        if (now - zoneCopy.createdAt > zoneCopy.duration) {
          // Tesla coil explosion (2x range)
          if (zoneCopy.type === 'tesla-coil') {
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            if (checkCollision(
              zoneCopy.x - 100, zoneCopy.y - 100, 200, 200,
              players[targetIndex].x, players[targetIndex].y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              players[targetIndex] = applyDamage(players[targetIndex], 30);
            }

            // Add visual explosion
            explosions.push(createHazardZone(
              'electric-explosion',
              zoneCopy.ownerId,
              zoneCopy.x - 30,
              zoneCopy.y - 30,
              0,
              300
            ));
          }
          return null;
        }

        // Tesla coil self-damage (0.5s tick, 2% max health)
        if (zoneCopy.type === 'tesla-coil' && zoneCopy.health !== undefined && zoneCopy.maxHealth !== undefined) {
          const selfDamageTick = zoneCopy.lastSelfDamage || zoneCopy.createdAt;
          if (now - selfDamageTick >= 500) {
            zoneCopy.health -= zoneCopy.maxHealth * 0.02;
            zoneCopy.lastSelfDamage = now;
          }
        }

        // Tesla coil attacks
        if (zoneCopy.type === 'tesla-coil') {
          const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
          const target = players[targetIndex];
          const dist = Math.hypot(
            (zoneCopy.x + zoneCopy.width / 2) - (target.x + PLAYER_SIZE / 2),
            (zoneCopy.y + zoneCopy.height / 2) - (target.y + PLAYER_SIZE / 2)
          );

          if (dist < (zoneCopy.attackRange || 150)) {
            if (zoneCopy.lastAttack && now - zoneCopy.lastAttack < (zoneCopy.attackCooldown || 200)) {
              // Cooldown
            } else {
              zoneCopy.lastAttack = now;
              zoneCopy.lastAttackTarget = { x: target.x, y: target.y };
              players[targetIndex] = applyDamage(target, zoneCopy.damage);
            }
          }
        }

        // Damage tick for pools
        if (zoneCopy.type !== 'tesla-coil' && now - zoneCopy.lastTick >= zoneCopy.tickRate) {
          zoneCopy.lastTick = now;

          for (let i = 0; i < 2; i++) {
            if (i !== zoneCopy.ownerId - 1) {
              if (checkCollision(
                zoneCopy.x, zoneCopy.y, zoneCopy.width, zoneCopy.height,
                players[i].x, players[i].y, PLAYER_SIZE, PLAYER_SIZE
              )) {
                players[i] = applyDamage(players[i], zoneCopy.damage);
              }
            }
          }
        }

        return zoneCopy;
      }).filter((zone): zone is import('@/types/projectile').HazardZone => zone !== null);

      hazardZones = [...hazardZones, ...explosions];



      // Check win conditions
      let roundWinner: 1 | 2 | 'draw' | null = null;
      if (players[0].health <= 0 && players[1].health <= 0) roundWinner = 'draw';
      else if (players[0].health <= 0) roundWinner = 2;
      else if (players[1].health <= 0) roundWinner = 1;
      else if (newTimeRemaining <= 0) {
        if (players[0].health === players[1].health) roundWinner = 'draw';
        else roundWinner = players[0].health > players[1].health ? 1 : 2;
      }

      if (roundWinner && prev.isRoundActive && !roundEndingRef.current) {
        roundEndingRef.current = true;
        setTimeout(() => onRoundEnd(roundWinner!), 500);
      }

      return {
        ...prev,
        players,
        projectiles,
        hazardZones,
        attackHitboxes,
        roundTimeRemaining: newTimeRemaining,
        isRoundActive: !roundWinner,
        roundWinner,
      };
    });
  }, [roundTimeLimit, onRoundEnd]);

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
