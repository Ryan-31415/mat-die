import { useState, useCallback, useRef, useEffect } from 'react';
import { captureBasicAttack, createCombatVisualState, visualActorId, type CombatVisualState } from '@/types/combatVisual';
import { advanceCombatVisual } from '@/components/game/weapons/weaponPose';
import { Player, Character, ARENA, PLAYER_SIZE, createInitialPlayer } from '@/types/game';
import { Projectile, HazardZone, AttackHitbox, ExplosionEffect, basicProjectileLaunches, hunterNetLaunch, scientistOrbLaunch, checkProjectileCollision, getProjectileCollisionTime, createExplosionEffect, projectileImpactZone, projectilePierces } from '@/types/projectile';
import { Platform, PLATFORMS } from '@/types/platform';
import { MapId, MAPS } from '@/types/map';
import { KeyboardState } from './useKeyboard';
import { decideAI, emptyAIKeys, prepareAIFrame } from './gameAI';
import { observeOpponent } from './ai/learning';
import { createCombatDiagnostics, nextCombatDiagnostics, recordHit, recordHealthChange, recordAction, diagnosticPlayerKey,
  recordEntityAction, entityDamageSource, recordBlocked,
  recordMeleeCreation, recordMeleeContact, recordMeleeDeflection, finishMeleeTrials,
  type CombatDiagnostics, type CombatAction, type DamageSource } from './ai/diagnostics';
import { activeVine, type AIWorld } from './ai/world';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './ai/difficulty';
import type { AISettings } from '@/types/ai';
import { createTickRandom, createEngineEntities, createEngineEvaluationState, type EngineEvaluationState, type EngineRuntimeOptions } from '@/types/engineRuntime';
import { createAIRoundState, resetAILearningObservations, type AILearningSession, type AIRoundState } from './ai/state';
import { advanceProjectile, basicMeleeGeometry, BAT_RETURN_FRACTION, LIGHTNING_RADIUS, LIGHTNING_WARNING_MS, NINJA_DASH_DISTANCE, stepPlayerForces, stepPlayerMovement, stepPlayerSlowAndRoot, stepPlayerCrowdControl, stepPlayerMobilityBuffs, stepCoilMotion, coilExplosionGeometry, fireRingOverlapsPlayer, playerOverlapsRect, reaperContactGeometry, findProjectileCoilContact, findMeleeCoilContact, sandstormImpulse, shieldFacesX, VINE_FADE_MS, HOMING_ROCKET_SPEED, NAPALM_DURATION_MS, NAPALM_POOL_DURATION_MS, isRocket } from '@/types/combatPhysics';

const TICK_RATE = 1000 / 60; // 60 FPS
const ARCHER_BURST_COUNT = 8;
const ARCHER_BURST_INTERVAL = 80;
const ARCHER_BURST_SPREAD = 10 * Math.PI / 180;

interface GameEngineState {
  combatVisual: CombatVisualState;
  evaluationState?: EngineEvaluationState;
  aiState: AIRoundState;
  diagnostics?: CombatDiagnostics;
  players: [Player, Player];
  clones: Player[];
  projectiles: Projectile[];
  explosionEffects: ExplosionEffect[];
  hazardZones: HazardZone[];
  attackHitboxes: AttackHitbox[];
  roundTimeRemaining: number;
  isRoundActive: boolean;
  roundWinner: 1 | 2 | 'draw' | null;
  isPaused: boolean;
  platforms: Platform[];
  isOvertime: boolean;
  // Map environment state
  sandstormActive: boolean;
  sandstormDirection: 'left' | 'right';
  sandstormTimer: number;
  nextSandstormTime: number;
  lightningStrikes: Array<{
    id: string;
    x: number;
    targetPlayerId: 1 | 2;
    warningStart: number;
    struck: boolean;
  }>;
  nextLightningTime: number;
  soulZones: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    createdAt: number;
    duration: number;
  }>;
  nextSoulZoneTime: number;
  vineShields: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    createdAt: number;
    duration: number;
    hp: number;
    destroyedAt?: number;
  }>;
  nextVineTime: number;
  lastLavaDamage: [number, number];
  fallingLeaves: Array<{ id: string; x: number; y: number; vx: number; vy: number; rotation: number }>;
}

export const useGameEngine = (
  player1Character: Character,
  player2Character: Character,
  roundTimeLimit: number,
  onRoundEnd: (winner: 1 | 2 | 'draw') => void,
  gameMode: 'single' | 'multi' = 'multi',
  isOvertimeProp: boolean = false,
  roundNumber: number = 1,
  mapId: MapId = 'default',
  learningSessionRef?: React.MutableRefObject<AILearningSession>,
  collectDiagnostics = false,
  aiSettings?: AISettings,
  runtime?: EngineRuntimeOptions
) => {
  const map = MAPS[mapId];
  const now0 = Date.now();
  const [initialDifficultySession] = useState(() => gameMode === 'single' && aiSettings ? learningSessionRef?.current.difficulty ?? createDifficultySession() : undefined);

  const createInitialEngineState = useCallback((previousEvaluationState?: EngineEvaluationState, visualRoundId = 1): GameEngineState => {
    const random = createTickRandom(runtime?.random, 'initial', Date.now());
    const players: [Player, Player] = [
      createInitialPlayer(1, player1Character),
      createInitialPlayer(2, player2Character),
    ];

    // On volcano map, spawn players on platforms instead of the ground (which is lava)
    if (mapId === 'volcano') {
      const leftPlatform = map.platforms.find(p => p.id === 'platform-left');
      const rightPlatform = map.platforms.find(p => p.id === 'platform-right');

      if (leftPlatform) {
        players[0].x = leftPlatform.x + (leftPlatform.width / 2) - (PLAYER_SIZE / 2);
        players[0].y = leftPlatform.y - PLAYER_SIZE;
      }

      if (rightPlatform) {
        players[1].x = rightPlatform.x + (rightPlatform.width / 2) - (PLAYER_SIZE / 2);
        players[1].y = rightPlatform.y - PLAYER_SIZE;
      }
    }

    return {
      combatVisual: createCombatVisualState(visualRoundId),
      ...(runtime?.controllers || runtime?.cloneControllers ? { evaluationState: createEngineEvaluationState(runtime, previousEvaluationState) } : {}),
      aiState: {
        ...createAIRoundState(learningSessionRef?.current),
        ...(initialDifficultySession ? { difficulty: createDifficultyRuntime(initialDifficultySession) } : {}),
      },
      diagnostics: collectDiagnostics ? createCombatDiagnostics() : undefined,
      players,
      clones: [],
      projectiles: [],
      explosionEffects: [],
      hazardZones: [],
      attackHitboxes: [],
      roundTimeRemaining: isOvertimeProp ? 30 : (roundTimeLimit === 0 ? 999 : roundTimeLimit),
      isRoundActive: true,
      roundWinner: null,
      isPaused: false,
      platforms: map.platforms,
      isOvertime: isOvertimeProp,
      // Map environment state
      sandstormActive: false,
      sandstormDirection: 'right',
      sandstormTimer: 0,
      nextSandstormTime: Date.now() + 8000 + random('environment') * 7000,
      lightningStrikes: [],
      nextLightningTime: Date.now() + 6000 + random('environment') * 6000,
      soulZones: [],
      nextSoulZoneTime: Date.now() + 10000 + random('environment') * 8000,
      vineShields: [],
      nextVineTime: Date.now() + 7000 + random('environment') * 8000,
      lastLavaDamage: [0, 0],
      fallingLeaves: [],
    };
  }, [player1Character, player2Character, roundTimeLimit, isOvertimeProp, mapId, map, learningSessionRef, collectDiagnostics, initialDifficultySession, runtime]);

  const [gameState, setGameState] = useState<GameEngineState>(createInitialEngineState);

  useEffect(() => {
    if (learningSessionRef) learningSessionRef.current = gameState.aiState.learning;
  }, [gameState.aiState.learning, learningSessionRef]);

  const gameStateRef = useRef(gameState);
  const keysRefHolder = useRef<React.MutableRefObject<KeyboardState> | null>(null);
  const lastTickRef = useRef(Date.now());
  const roundStartTimeRef = useRef(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const shieldManaTickRef = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (gameState.isPaused) {
      pausedAtRef.current ??= Date.now();
    } else if (pausedAtRef.current !== null) {
      roundStartTimeRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [gameState.isPaused]);

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

  const applyDamageRaw = (player: Player, damage: number, isHazard: boolean = false): { player: Player; dealt: number } => {
    // If truly invulnerable (Reaper ult), block everything
    if (player.isInvulnerable) return { player, dealt: 0 };

    // If Ninja is evading, block non-hazard hits
    if (player.isEvading && !isHazard) return { player, dealt: 0 };

    let damageMultiplier = 1.0;
    let isBreakingFreeze = false;

    if (player.isFrozen) {
      damageMultiplier = 1.25;
      isBreakingFreeze = true;
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

    const updatedPlayer = { ...player, health: newHealth };

    if (isBreakingFreeze && !isHazard) {
      updatedPlayer.isFrozen = false;
      updatedPlayer.frozenDuration = 0;
      updatedPlayer.freezeGauge = 0;
    }

    return {
      player: updatedPlayer,
      dealt: actualDamage
    };
  };

  const updatePlayer = (
    player: Player,
    keys: KeyboardState,
    deltaTime: number,
    otherPlayer: Player,
    shieldManaTick: number,
    hazardZones: HazardZone[],
    platforms: Platform[],
    diagnostics?: CombatDiagnostics,
    randomScope?: string,
    visual?: CombatVisualState
  ): { player: Player; newProjectiles: Projectile[]; newHitboxes: AttackHitbox[]; newHazards: HazardZone[]; newClones: Player[]; newShieldTick: number } => {
    const now = Date.now();
    const random = createTickRandom(runtime?.random, randomScope ?? player.aiControllerId ?? 'player:' + player.id, now);
    let activeAction: CombatAction = 'attack';
    const playerKey = diagnosticPlayerKey(player);
    const recordPlayerAction = (action: CombatAction, mana = 0) => {
      recordAction(diagnostics, player.id, action, mana, player.isClone);
      if (diagnostics) diagnostics.activeActionIds[playerKey + ':' + action] = playerKey + ':' + now + ':' + action;
    };
    const { createProjectile, createHazardZone, createAttackHitbox } = createEngineEntities(
      runtime?.random ? { now, random: () => random('id') } : undefined,
      diagnostics ? (entity, kind) => {
        recordEntityAction(diagnostics, entity, activeAction,
          diagnostics.activeActionIds[playerKey + ':' + activeAction] ?? playerKey + ':' + now + ':' + activeAction, player.isClone);
        if (kind === 'melee' && activeAction === 'attack' && !player.isClone) recordMeleeCreation(diagnostics, entity);
      } : undefined);
    const applyDamage = (target: Player, damage: number, isHazard = false, source: DamageSource = { kind: 'self', ownerId: player.id, action: 'skill' }) => {
      const result = applyDamageRaw(target, damage, isHazard);
      recordHealthChange(diagnostics, target, target.health, result.player.health, source);
      return result;
    };
    const setHealth = (target: Player, health: number, source: DamageSource) => {
      recordHealthChange(diagnostics, target, target.health, health, source);
      target.health = health;
    };
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
    const attackKey = isP1 ? keys.f : keys.shift;
    const skillKey = isP1 ? keys.g : keys.enter;
    const ultimateKey = isP1 ? keys.h : keys.backslash;

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
    stepPlayerSlowAndRoot(updatedPlayer, deltaTime);
    if (updatedPlayer.regenDuration > 0) {
      updatedPlayer.regenDuration -= deltaTime;
      const regenAmount = updatedPlayer.healthRegen * (deltaTime / 1000);
      setHealth(updatedPlayer, Math.min(updatedPlayer.maxHealth, updatedPlayer.health + regenAmount), { kind: 'direct', ownerId: player.id, action: 'ultimate' });
      if (updatedPlayer.regenDuration <= 0) {
        updatedPlayer.regenDuration = 0;
        updatedPlayer.healthRegen = 0;
      }
    }
    stepPlayerCrowdControl(updatedPlayer, otherPlayer, hazardZones, now, deltaTime);
    stepPlayerMobilityBuffs(updatedPlayer, deltaTime);
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
    const updatePacketBlockStatus = () => {
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

      // Clear the entire charge before regeneration, movement or skill release.
      if (character.id === 'scientist' && updatedPlayer.isSilenced) {
        updatedPlayer.isChargingSkill = false;
        updatedPlayer.skillChargeStartTime = undefined;
      }
    };
    updatePacketBlockStatus();

    updatedPlayer.napalmDuration = Math.max(0, (updatedPlayer.napalmDuration ?? 0) - deltaTime);

    // Burn damage (from Mage or Rocketeer ultimate)
    if (updatedPlayer.isBurning && updatedPlayer.burnDuration > 0) {
      const origin = diagnostics?.dotSources['burn:' + playerKey];
      const burnSource: DamageSource = origin && origin.ownerId === updatedPlayer.burnOwner ? origin
        : { kind: 'burn', ownerId: updatedPlayer.burnOwner, action: updatedPlayer.burnIsNapalm ? 'ultimate' : undefined };
      updatedPlayer.burnDuration -= deltaTime;
      // Apply burn damage every 250ms
      if (updatedPlayer.burnIsNapalm) {
        const through = now + Math.min(0, updatedPlayer.burnDuration);
        while (through - updatedPlayer.lastBurnTick >= 250) {
          setHealth(updatedPlayer, Math.max(0, updatedPlayer.health - updatedPlayer.burnDamagePerTick), burnSource);
          updatedPlayer.lastBurnTick += 250;
        }
      } else if (now - updatedPlayer.lastBurnTick >= 250) {
        setHealth(updatedPlayer, Math.max(0, updatedPlayer.health - updatedPlayer.burnDamagePerTick), burnSource);
        updatedPlayer.lastBurnTick = now;
      }
      if (updatedPlayer.burnDuration <= 0) {
        updatedPlayer.isBurning = false;
        updatedPlayer.burnDuration = 0;
        updatedPlayer.burnDamagePerTick = 0;
        updatedPlayer.burnIsNapalm = false;
        updatedPlayer.burnOwner = null;
      }
    }

    // Poison damage
    if (updatedPlayer.isPoisoned) {
      const poisonDamage = (updatedPlayer.maxHealth * 0.0125) * (deltaTime / 1000);
      setHealth(updatedPlayer, Math.max(0, updatedPlayer.health - poisonDamage), diagnostics?.dotSources['poison:' + playerKey]
        ?? { kind: 'poison', ownerId: diagnostics?.poisonOwners[playerKey] ?? null, action: 'skill' });
    }

    // Mana regeneration
    // Scientist only regenerates mana when NOT charging
    const isCharging = character.id === 'scientist' && updatedPlayer.isChargingSkill;
    const isShielding = character.id === 'gladiator' && updatedPlayer.isShielding;
    const manaRegen = isCharging || isShielding ? 0 : (character.manaRegen / 100) * (deltaTime / 1000) * updatedPlayer.maxMana * manaMultiplier * (updatedPlayer.mageUltimateDuration > 0 ? 1.67 : 1.0);
    updatedPlayer.mana = Math.min(updatedPlayer.maxMana, updatedPlayer.mana + manaRegen);

    // Cooldown reduction
    if (updatedPlayer.skillCooldownRemaining > 0) {
      updatedPlayer.skillCooldownRemaining = Math.max(0, updatedPlayer.skillCooldownRemaining - deltaTime);
    }
    if (updatedPlayer.attackCooldownRemaining > 0) {
      updatedPlayer.attackCooldownRemaining = Math.max(0, updatedPlayer.attackCooldownRemaining - deltaTime);
    }

    stepPlayerForces(updatedPlayer, deltaTime);

    // Skip movement/actions if stunned or frozen (but gravity was already applied)
    if (updatedPlayer.isStunned || updatedPlayer.isFrozen) {
      updatedPlayer.archerBurstRemaining = 0;
      updatedPlayer.archerBurstCooldown = 0;
      stepPlayerMovement(updatedPlayer, { left: effectiveMoveLeft, right: effectiveMoveRight, jump: effectiveJump, down: effectiveMoveDown }, platforms, false, now, deltaTime);
      updatePacketBlockStatus();
      return { player: updatedPlayer, newProjectiles, newHitboxes, newHazards, newClones, newShieldTick };
    }

    // Shield handling for gladiator
    if (character.id === 'gladiator' && skillKey) {
      if (updatedPlayer.mana >= 2) {
        if (!updatedPlayer.isShielding) recordPlayerAction('defense');
        updatedPlayer.isShielding = true;
        newShieldTick += deltaTime;
        if (newShieldTick >= 100) {
          if (diagnostics) diagnostics.actions[player.id - 1].defense.mana += Math.min(2, updatedPlayer.mana);
          updatedPlayer.mana = Math.max(0, updatedPlayer.mana - 2);
          newShieldTick = 0;
        }
      } else {
        updatedPlayer.isShielding = false;
      }
    } else if (character.id === 'gladiator') {
      updatedPlayer.isShielding = false;
    }

    const inBlizzard = hazardZones.some(z =>
      z.type === 'blizzard' &&
      z.ownerId !== updatedPlayer.id &&
      checkCollision(updatedPlayer.x, updatedPlayer.y, PLAYER_SIZE, PLAYER_SIZE, z.x, z.y, z.width, z.height)
    );
    stepPlayerMovement(updatedPlayer, { left: effectiveMoveLeft, right: effectiveMoveRight, jump: effectiveJump, down: effectiveMoveDown }, platforms, inBlizzard, now, deltaTime);
    // Movement can enter a zone on the same tick that the skill key is released.
    updatePacketBlockStatus();

    // Silence interrupts the remaining rapid-fire shots.
    if (character.id === 'archer' && updatedPlayer.isSilenced) {
      updatedPlayer.archerBurstRemaining = 0;
      updatedPlayer.archerBurstCooldown = 0;
    }
    if ((updatedPlayer.archerBurstRemaining ?? 0) > 0) {
      updatedPlayer.archerBurstCooldown = (updatedPlayer.archerBurstCooldown ?? 0) - deltaTime;
    }

    // Snapshot napalm before either attack when inputs arrive together.
    if (character.id === 'rocketeer' && ultimateKey && updatedPlayer.mana >= 100 && !updatedPlayer.isSilenced && updatedPlayer.napalmDuration <= 0) {
      recordPlayerAction('ultimate', 100);
      updatedPlayer.mana -= 100;
      updatedPlayer.napalmDuration = NAPALM_DURATION_MS;
    }
    const launchRocket = (type: 'rocket' | 'homing-rocket', speed: number, damage: number) => {
      const rocket = createProjectile(type, player.id, updatedPlayer.x + PLAYER_SIZE / 2,
        updatedPlayer.y + PLAYER_SIZE / 2, (updatedPlayer.facingRight ? 1 : -1) * speed, 0, damage);
      if (updatedPlayer.napalmDuration > 0) {
        rocket.isNapalm = true;
        rocket.createsFirePool = true;
        rocket.firePoolDuration = NAPALM_POOL_DURATION_MS;
        rocket.firePoolDamage = damage * 0.075;
        rocket.burnDamage = damage * 0.075;
      }
      newProjectiles.push(rocket);
    };

    // Give a ready archer ultimate priority over a simultaneous basic attack.
    const startingArcherBurst = character.id === 'archer' && ultimateKey && updatedPlayer.mana >= 100 && !updatedPlayer.isSilenced;
    // Basic Attack
    if (attackKey && updatedPlayer.attackCooldownRemaining <= 0 && !(updatedPlayer.archerBurstRemaining > 0) && !startingArcherBurst) {
      recordPlayerAction('attack');
      updatedPlayer.attackCooldownRemaining = character.attackCooldown;
      updatedPlayer.isAttacking = true;

      const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
      let damageBoost = updatedPlayer.damageBoost;
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

      const melee = basicMeleeGeometry(updatedPlayer);
      if (visual) captureBasicAttack(visual, updatedPlayer, now, melee, randomScope ?? visualActorId(player));
      if (melee) newHitboxes.push(createAttackHitbox(player.id, melee.x, melee.y, melee.width, melee.height,
        baseDamage, melee.duration, melee.canDeflectProjectiles, melee.sourceX));
      else {
        for (const launch of basicProjectileLaunches(updatedPlayer, baseDamage)) {
          if (launch.type === 'rocket' || launch.type === 'homing-rocket') {
            launchRocket(launch.type, Math.abs(launch.velocityX), launch.damage);
          } else {
            const projectile = createProjectile(launch.type, player.id, updatedPlayer.x + PLAYER_SIZE / 2,
              updatedPlayer.y + PLAYER_SIZE / 2, launch.velocityX, launch.velocityY, launch.damage);
            if (character.id === 'hacker') projectile.isSwapMissile = inOwnPacketBlock;
            newProjectiles.push(projectile);
          }
        }
        if (character.id === 'archer' && updatedPlayer.poisonArrowsRemaining > 0) updatedPlayer.poisonArrowsRemaining--;
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

    activeAction = 'skill';
    // Skills (non-gladiator and non-scientist)
    // Also block skill if Silenced
    if (skillKey && !character.id.match(/^(gladiator|scientist)$/) && updatedPlayer.skillCooldownRemaining <= 0 && !updatedPlayer.isSilenced) {
      const manaCost = character.skill.manaCost;
      if (updatedPlayer.mana >= manaCost) {
        recordPlayerAction('skill', manaCost);
        updatedPlayer.mana -= manaCost;
        updatedPlayer.skillCooldownRemaining = character.skill.cooldown;
        updatedPlayer.isUsingSkill = true;

        const attackDirection = updatedPlayer.facingRight ? 1 : -1;
        const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
        const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;

        switch (character.id) {
          case 'rocketeer':
            launchRocket('homing-rocket', HOMING_ROCKET_SPEED,
              character.attackDamage * (1 + updatedPlayer.damageBoost - (updatedPlayer.isHacked ? 0.2 : 0)) * damageMultiplier);
            break;
          case 'archer':
            updatedPlayer.poisonArrowsRemaining = 3;
            break;
          case 'mage':
            {
            const largeFireball = createProjectile(
              'large-fireball',
              player.id,
              otherPlayer.x + PLAYER_SIZE / 2,
              0,
              0,
              750,
              baseDamage * 1.75
            );
            newProjectiles.push(largeFireball);
            break;
          }
          case 'ninja':
            {
            updatedPlayer.isDashing = true;
            const dashDistance = NINJA_DASH_DISTANCE;
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
          }
          case 'hunter': {
            const net = hunterNetLaunch(updatedPlayer, baseDamage);
            newProjectiles.push(createProjectile(net.type, player.id, net.x, net.y, net.velocityX, net.velocityY, net.damage));
            break;
          }
          case 'reaper':
            // Spawn bat slightly in front of the player to avoid initial overlap
            {
            const batSpawnX = updatedPlayer.x + PLAYER_SIZE / 2 + (attackDirection * (PLAYER_SIZE / 2 + 20));
            const bat = createProjectile(
              'bat',
              player.id,
              batSpawnX,
              updatedPlayer.y + PLAYER_SIZE / 2, // Center vertically
              attackDirection * 550,
              0,
              baseDamage * 0.75,
            );
            // Clamp bat top-left inside arena so it doesn't immediately trigger bounds
            bat.x = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - bat.width, bat.x));
            bat.y = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - bat.height, bat.y));
            // Dev log: bat spawn (with clamped coords)
            if (process.env.NODE_ENV !== 'production') {

              console.log('BAT SPAWN', { id: bat.id, owner: bat.ownerId, x: bat.x, y: bat.y, vx: bat.velocityX, vy: bat.velocityY });
            }
            newProjectiles.push(bat);
            break;
          }
          case 'ice-mage':
            // Avalanche: 4 large snowballs
            for (let i = 0; i < 4; i++) {
              setTimeout(() => {
                setGameState(prev => {
                  const delayedNow = Date.now();
                  const delayedRandom = createTickRandom(runtime?.random, `avalanche:${player.id}:${now}:${i}`, delayedNow);
                  const { createProjectile } = createEngineEntities(
                    runtime?.random ? { now: delayedNow, random: () => delayedRandom('id') } : undefined);
                  const projGap = 33;
                  const currentPlayer = prev.players[player.id - 1];
                  if (!currentPlayer) return prev;
                  const newProj = createProjectile(
                    'large-snowball',
                    player.id,
                    currentPlayer.x + PLAYER_SIZE / 2,
                    currentPlayer.y + PLAYER_SIZE / 2 + (i - 1) * projGap - projGap * 0.5, // Offset each snowball vertically
                    (currentPlayer.facingRight ? 1 : -1) * 920,
                    0,
                    baseDamage * 0.15 // can does multy-hit. so damage is low.
                  );
                  const delayedDiagnostics = nextCombatDiagnostics(prev.diagnostics, false);
                  recordEntityAction(delayedDiagnostics, newProj, 'skill', playerKey + ':' + now + ':skill', player.isClone);
                  return {
                    ...prev,
                    diagnostics: delayedDiagnostics,
                    projectiles: [...prev.projectiles, newProj],
                  };
                });
              }, 0);
            }
            break;
          case 'hacker':
            {
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
            zone.y = ARENA.height - ARENA.padding - zone.height;
            // "In front" implies same Y level.
            zone.y = updatedPlayer.y + PLAYER_SIZE / 2 - zone.height / 2;

            newHazards.push(zone);
            break;
          }
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
      if (skillKey && !updatedPlayer.isSilenced && !updatedPlayer.isChargingSkill && updatedPlayer.skillCooldownRemaining <= 0 && updatedPlayer.mana >= manaCost) {
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
          const fullChargeTime = 1500;
          const overchargeTime = fullChargeTime + 2000; // 2 seconds after full charge

          // Overcharge Self-Destruct
          if (chargeDuration > overchargeTime) {
            updatedPlayer.isChargingSkill = false;
            updatedPlayer.skillChargeStartTime = undefined;
            updatedPlayer.skillCooldownRemaining = character.skill.cooldown;

            // Self Damage: 3.5x Attack Damage
            const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
            const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;
            const selfDamage = baseDamage * 3.5;

            // Apply Self Damage
            const selfDamageResult = applyDamage(updatedPlayer, selfDamage);
            updatedPlayer = selfDamageResult.player;
            // If survived, apply status effects
            if (updatedPlayer.health > 0) {
              updatedPlayer.isStunned = true;
              updatedPlayer.stunDuration = 1750;

              updatedPlayer.isSlowed = true;
              updatedPlayer.slowAmount = 0.4;
              updatedPlayer.slowDuration = 6000;

              // Knockback backwards
              const facingDir = updatedPlayer.facingRight ? 1 : -1;
              updatedPlayer.knockbackVelocityX = -facingDir * 300;
              updatedPlayer.knockbackVelocityY = -200; // Slight pop up
              updatedPlayer.isGrounded = false;
            }

            // Area Damage to enemies
            // 2.5x Damage, Slow 30% 5s, Knockback 220
            const explosionDamage = baseDamage * 2.5;
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

            if (checkCollision(explosion.x, explosion.y, explosion.width, explosion.height, otherPlayer.x, otherPlayer.y, PLAYER_SIZE, PLAYER_SIZE)) {
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

        updatedPlayer.isChargingSkill = false;
        updatedPlayer.skillChargeStartTime = undefined;

        // Consume Mana
        recordPlayerAction('skill', manaCost);
        updatedPlayer.mana -= manaCost;
        updatedPlayer.skillCooldownRemaining = character.skill.cooldown;

        // Calculate Stats
        const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
        const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;
        const shot = scientistOrbLaunch(updatedPlayer, chargeDuration, baseDamage);

        const projectile = createProjectile(
          shot.type,
          player.id,
          shot.x,
          shot.y,
          shot.velocityX,
          shot.velocityY,
          shot.damage
        );

        projectile.knockback = shot.knockback;
        projectile.slowAmount = shot.slowAmount;
        projectile.slowDuration = shot.slowDuration;
        projectile.stunDuration = shot.stunDuration;
        projectile.chargeLevel = shot.chargeLevel;
        projectile.width = shot.width;
        projectile.height = shot.height;
        // Adjust center after resize
        projectile.x = updatedPlayer.x + PLAYER_SIZE / 2 - projectile.width / 2;
        projectile.y = updatedPlayer.y + PLAYER_SIZE / 2 - projectile.height / 2;

        newProjectiles.push(projectile);
      }
    }

    activeAction = 'ultimate';
    // Ultimate
    // Block if Silenced
    if (character.id !== 'rocketeer' && ultimateKey && updatedPlayer.mana >= 100 && !updatedPlayer.isSilenced && !(updatedPlayer.archerBurstRemaining > 0)) {
      recordPlayerAction('ultimate', updatedPlayer.mana);
      updatedPlayer.mana = 0;
      updatedPlayer.isUsingUltimate = true;

      const attackDirection = updatedPlayer.facingRight ? 1 : -1;
      const damageMultiplier = gameState.isOvertime ? 2.0 : 1.0;
      const baseDamage = character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier;

      switch (character.id) {
        case 'gladiator':
          // enrage - boosts damage, speed, and damage reduction
          updatedPlayer.damageBoost = 0.33;
          updatedPlayer.speedBoost = 0.25;
          updatedPlayer.damageReduction = 0.20;
          updatedPlayer.buffDuration = 5000;
          updatedPlayer.regenDuration = 5000;
          updatedPlayer.healthRegen = updatedPlayer.maxHealth * 0.03; // 3% max health per second
          break;
        case 'archer':
          updatedPlayer.archerBurstRemaining = ARCHER_BURST_COUNT;
          updatedPlayer.archerBurstCooldown = 0;
          break;
        case 'mage':
          // Fire Avatar - 5 second buff with fire ring
          updatedPlayer.mageUltimateDuration = 5000;
          updatedPlayer.damageBoost = 0.30; // 30% damage increase
          // Create fire ring hazard zone centered on mage
          newHazards.push(createHazardZone(
            'fire-ring',
            player.id,
            updatedPlayer.x + PLAYER_SIZE / 2 - 90, // Center on player
            updatedPlayer.y + PLAYER_SIZE / 2 - 90,
            character.attackDamage * (1 + updatedPlayer.damageBoost) * damageMultiplier * 0.05, // 5% of buffed attack damage per tick (50% per a second)
            5000 // 5 seconds duration
          ));
          break;

        case 'ninja':
          updatedPlayer.isInvisible = true;
          updatedPlayer.invisibleDuration = 5000;
          updatedPlayer.damageBoost = 0.30;
          updatedPlayer.speedBoost = 0.50;
          updatedPlayer.dodgesRemaining = 2;
          break;
        case 'scientist':
          newHazards.push(createHazardZone(
            'tesla-coil',
            player.id,
            updatedPlayer.x,
            updatedPlayer.y,
            baseDamage * 0.1,
            30000
          ));
          break;
        case 'hunter':
          // Focused Fire: 5s buff
          updatedPlayer.hunterFocusedDuration = 5000;
          updatedPlayer.damageBoost = 0.0; // +0% damage
          break;
        case 'reaper':
          updatedPlayer.isInvulnerable = true;
          updatedPlayer.isFlying = true;
          updatedPlayer.invulnerableDuration = 2500;
          updatedPlayer.speedBoost = 0.70;
          updatedPlayer.trailPositions = [];
          break;
        case 'ice-mage':
          // Throw blizzard stone
          {
          const blizzardStone = createProjectile(
            'blizzard-stone',
            player.id,
            updatedPlayer.x,
            updatedPlayer.y,
            attackDirection * 600, // Throw forward
            -100, // High arc
            baseDamage * 0.02
          );
          newProjectiles.push(blizzardStone);
          break;
        }
        case 'hacker':
          // Hacking

          // Simplest way: Create a "hack-projectile" that instant hits.
          {
          const hackProj = createProjectile(
            'hacking',
            player.id,
            otherPlayer.x + PLAYER_SIZE / 2, // Instant hit location
            otherPlayer.y + PLAYER_SIZE / 2,
            0, 0, 0
          );
          hackProj.width = 1;
          hackProj.height = 1;
          hackProj.lifetime = 50;
          hackProj.isHackUltimate = true; // Flag for collision handler
          newProjectiles.push(hackProj);
          break;
        }
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

    if (character.id === 'archer') {
      while ((updatedPlayer.archerBurstRemaining ?? 0) > 0 && (updatedPlayer.archerBurstCooldown ?? 0) <= 0) {
        // Follow the archer's current facing while keeping each shot within a total ten-degree cone.
        const direction = updatedPlayer.facingRight ? 1 : -1;
        const angle = Math.atan2(-80, 1000) + (random('combat') - 0.5) * ARCHER_BURST_SPREAD;
        const speed = Math.hypot(1000, 80);
        const damageMultiplier = gameState.isOvertime ? 2 : 1;
        const damageBoost = updatedPlayer.damageBoost - (updatedPlayer.isHacked ? 0.20 : 0);
        newProjectiles.push(createProjectile(
          'arrow', player.id,
          updatedPlayer.x + PLAYER_SIZE / 2,
          updatedPlayer.y + PLAYER_SIZE / 2,
          direction * Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          character.attackDamage * (1 + damageBoost) * damageMultiplier
        ));
        updatedPlayer.archerBurstRemaining = (updatedPlayer.archerBurstRemaining ?? 0) - 1;
        updatedPlayer.archerBurstCooldown = (updatedPlayer.archerBurstCooldown ?? 0) + ARCHER_BURST_INTERVAL;
      }
      if (!updatedPlayer.archerBurstRemaining) updatedPlayer.archerBurstCooldown = 0;
    }

    return { player: updatedPlayer, newProjectiles, newHitboxes, newHazards, newClones, newShieldTick };
  };

  const gameLoop = () => {
    const now = Date.now();
    const deltaTime = now - lastTickRef.current;
    lastTickRef.current = now;

    if (!keysRefHolder.current) {
      return;
    }
    const keys = keysRefHolder.current.current;

    setGameState(prev => {
      if (!prev.isRoundActive || prev.isPaused) return prev;
      const combatVisual = advanceCombatVisual(prev.combatVisual, deltaTime);
      const diagnostics = nextCombatDiagnostics(prev.diagnostics);
      const random = createTickRandom(runtime?.random, 'engine', now);
      let diagnosticParent: DamageSource | undefined;
      const { createProjectile, createHazardZone } = createEngineEntities(
        runtime?.random ? { now, random: () => random('id') } : undefined,
        diagnostics ? entity => {
          if (diagnosticParent?.action) recordEntityAction(diagnostics, entity, diagnosticParent.action,
            diagnosticParent.actionId ?? entity.id, diagnosticParent.isClone);
        } : undefined);
      const controllerWorld: AIWorld = {
        players: prev.players, projectiles: prev.projectiles, hazardZones: prev.hazardZones,
        attackHitboxes: prev.attackHitboxes, platforms: prev.platforms, mapId, now, deltaTime,
        isOvertime: prev.isOvertime, roundTimeRemaining: prev.roundTimeRemaining,
        sandstormActive: prev.sandstormActive, sandstormDirection: prev.sandstormDirection,
        sandstormTimer: prev.sandstormTimer, lightningStrikes: prev.lightningStrikes,
        soulZones: prev.soulZones, vineShields: prev.vineShields,
      };
      // Evaluation transitions belong to React state, just like the ordinary P2 runtime.
      // Replaying an updater must start from the same observation queues and learning state.
      const evaluationState = prev.evaluationState ? {
        controllers: { ...prev.evaluationState.controllers }, cloneModels: { ...prev.evaluationState.cloneModels },
      } : undefined;
      const evaluateController = (side: 1 | 2) => {
        const controller = runtime?.controllers?.[side];
        if (!controller) return undefined;
        if (typeof controller === 'function') return controller(controllerWorld);
        const previous = prev.evaluationState?.controllers[side];
        if (!previous || !evaluationState) throw new Error('Evaluation controller state is missing');
        const result = controller.step(controllerWorld, previous);
        evaluationState.controllers[side] = result.state;
        return result.keys;
      };
      const overrideP1 = evaluateController(1);
      const overrideP2 = evaluateController(2);
      for (const side of [1, 2] as const) {
        const controller = runtime?.cloneControllers?.[side];
        if (!controller || !prev.clones.some(clone => clone.id === side && clone.health > 0 && now - clone.createdAt <= 6000)) continue;
        const previous = prev.evaluationState?.cloneModels[side];
        if (!previous || !evaluationState) throw new Error('Evaluation clone learning state is missing');
        evaluationState.cloneModels[side] = controller.observe(controllerWorld, previous);
      }
      const applyDamage = (target: Player, damage: number, isHazard = false, source?: DamageSource) => {
        const result = applyDamageRaw(target, damage, isHazard);
        recordHealthChange(diagnostics, target, target.health, result.player.health,
          source ?? { kind: isHazard ? 'zone' : 'direct', ownerId: target.id === 1 ? 2 : 1 });
        return result;
      };

      const setHealth = (target: Player, health: number, source: DamageSource) => {
        recordHealthChange(diagnostics, target, target.health, health, source);
        target.health = health;
      };

      // Update time
      const elapsedSeconds = (now - roundStartTimeRef.current) / 1000;
      let newTimeRemaining: number;
      if (roundTimeLimit === 0) {
        newTimeRemaining = 999; // Arbitrary large number for UI, or we can handle it in UI
      } else {
        newTimeRemaining = Math.max(0, roundTimeLimit - elapsedSeconds);
      }

      // Get player 1 keys from keyboard input
      const p1Keys = overrideP1 ?? keysRefHolder.current?.current ?? {
        a: false,
        d: false,
        w: false,
        s: false,
        space: false,
        f: false,
        g: false,
        h: false,
        arrowLeft: false,
        arrowRight: false,
        arrowUp: false,
        arrowDown: false,
        enter: false,
        shift: false,
        backslash: false,
      };


      // Get player 2 keys from AI or keyboard
      const needsUnrestrictedAI = (!overrideP2 && gameMode === 'single' && !aiSettings) ||
        prev.clones.some(clone => !runtime?.cloneControllers?.[clone.id]);
      const aiFrame = needsUnrestrictedAI ? prepareAIFrame({ ...prev, mapId, now, deltaTime }) : null;
      const learning: AILearningSession = needsUnrestrictedAI ? { ...prev.aiState.learning, opponents: {
        1: observeOpponent(prev.aiState.learning.opponents[1], prev.players[0], prev.players[1], now),
        2: observeOpponent(prev.aiState.learning.opponents[2], prev.players[1], prev.players[0], now),
      } } : { ...prev.aiState.learning };
      const controllers: AIRoundState['controllers'] = {};
      const difficulty = !overrideP2 && gameMode === 'single' && aiSettings && prev.aiState.difficulty
        ? stepDifficulty({ ...prev, mapId, now, deltaTime }, aiSettings, prev.aiState.difficulty) : undefined;
      if (difficulty) learning.difficulty = difficulty.session;
      const p2Decision = difficulty ? { keys: difficulty.keys, memory: difficulty.memory }
        : !overrideP2 && gameMode === 'single' && aiFrame ? decideAI(aiFrame, prev.players[1], learning.opponents[1], prev.aiState.controllers.player2) : null;
      if (p2Decision?.memory) controllers.player2 = p2Decision.memory;
      const p2Keys = overrideP2 ?? p2Decision?.keys ?? p1Keys;

      // Update players
      const p1Result = updatePlayer(
        prev.players[0],
        p1Keys,
        deltaTime,
        prev.players[1],
        shieldManaTickRef.current[0],
        prev.hazardZones,
        prev.platforms,
        diagnostics,
        undefined,
        combatVisual
      );
      const p2Result = updatePlayer(
        prev.players[1],
        p2Keys,
        deltaTime,
        prev.players[0],
        shieldManaTickRef.current[1],
        prev.hazardZones,
        prev.platforms,
        diagnostics,
        undefined,
        combatVisual
      );

      shieldManaTickRef.current = [p1Result.newShieldTick, p2Result.newShieldTick];

      const players: [Player, Player] = [p1Result.player, p2Result.player];

      // Update clones
      const nextClones: Player[] = [];
      const cloneProjectiles: Projectile[] = [];
      const cloneHitboxes: AttackHitbox[] = [];
      const cloneHazards: HazardZone[] = [];

      prev.clones.forEach((clone, index) => {
        if (clone.health <= 0) return;
        // Remove clones after 6 seconds
        if (now - clone.createdAt > 6000) return;

        const target = prev.players[clone.id === 1 ? 1 : 0];

        // Clone AI
        const controllerId = clone.aiControllerId ?? 'clone:' + clone.id + ':' + clone.createdAt + ':' + index;
        const cloneOverride = runtime?.cloneControllers?.[clone.id];
        const decision = cloneOverride && evaluationState?.cloneModels[clone.id]
          ? cloneOverride.decide(controllerWorld, clone, evaluationState.cloneModels[clone.id], prev.aiState.controllers[controllerId])
          : aiFrame ? decideAI(aiFrame, clone, learning.opponents[target.id], prev.aiState.controllers[controllerId]) : null;
        if (decision) controllers[controllerId] = decision.memory;
        let aiKeys = decision?.keys ?? emptyAIKeys();
        // Disable skills/ultimate for clones
        aiKeys = { ...aiKeys, g: false, h: false, enter: false, backslash: false };

        const cloneRes = updatePlayer(
          clone,
          aiKeys,
          deltaTime,
          target,
          0,
          prev.hazardZones,
          prev.platforms,
          diagnostics,
          controllerId,
          combatVisual
        );

        nextClones.push({ ...cloneRes.player, aiControllerId: controllerId });
        cloneProjectiles.push(...cloneRes.newProjectiles);
        cloneHitboxes.push(...cloneRes.newHitboxes);
        cloneHazards.push(...cloneRes.newHazards);
      });

      // Add new clones spawned by players
      nextClones.push(...p1Result.newClones, ...p2Result.newClones);

      let projectiles = [...prev.projectiles, ...p1Result.newProjectiles, ...p2Result.newProjectiles, ...cloneProjectiles];
      const projectileStartPositions = new Map(
        projectiles.map(projectile => [projectile.id, { x: projectile.x, y: projectile.y }])
      );
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

      if (diagnostics) {
        const activeIds: string[] = [];
        for (const item of [...projectiles, ...attackHitboxes]) {
          const key = item.ownerId + ':' + item.id;
          activeIds.push(key);
          if (!diagnostics.seenIds.includes(key)) diagnostics.attempts[item.ownerId - 1]++;
        }
        diagnostics.seenIds = activeIds;
        diagnostics.hitIds = diagnostics.hitIds.filter(id => activeIds.includes(id));
      }
      const brokenVines = new Set<string>();
      const coilDamageMap = new Map<string, number>();

      // Update projectiles
      projectiles = projectiles.map(proj => advanceProjectile(proj, players[proj.ownerId - 1], now, deltaTime / 1000, players[proj.ownerId === 1 ? 1 : 0]));

      const newlySpawnedProjectiles: Projectile[] = [];
      const explosionEffects = prev.explosionEffects.filter(effect => now - effect.createdAt < effect.duration);
      const emitExplosion = (
        proj: Projectile,
        target?: { x: number; y: number; width: number; height: number }
      ) => {
        if (!proj.isExplosive) return;
        const start = projectileStartPositions.get(proj.id) ?? proj;
        const hitTime = target ? getProjectileCollisionTime(proj, start, target) ?? 1 : 1;
        const centerX = start.x + (proj.x - start.x) * hitTime + proj.width / 2;
        const centerY = start.y + (proj.y - start.y) * hitTime + proj.height / 2;
        // Clamp to the struck surface, including hits that cross it within a tick.
        const bounds = target ?? { x: 0, y: 0, width: ARENA.width, height: ARENA.height - ARENA.padding };
        const effect = createExplosionEffect(
          proj,
          Math.max(bounds.x, Math.min(centerX, bounds.x + bounds.width)),
          Math.max(bounds.y, Math.min(centerY, bounds.y + bounds.height)),
          now
        );
        explosionEffects.push(effect);
      };
      const createImpactZone = (proj: Projectile, centerX: number, centerY: number,
        surface?: { x: number; y: number; width: number; height: number }) => {
        const impact = projectileImpactZone(proj);
        if (!impact) return undefined;
        const zone = createHazardZone(impact.type, proj.ownerId, 0, 0, impact.damage, impact.duration);
        if (impact.isNapalm) {
          zone.width = Math.max(proj.explosionRadius, proj.width / 2, proj.height / 2) * 2;
          zone.height = zone.width;
          zone.isNapalm = true;
        }
        zone.x = centerX - zone.width / 2;
        zone.y = surface ? surface.y - zone.height / 2 : centerY - zone.height / 2;
        if (surface && impact.type === 'toxic-pool') {
          zone.x = Math.max(surface.x, Math.min(zone.x, surface.x + surface.width - zone.width));
        }
        hazardZones.push(zone);
        if (impact.type === 'blizzard') {
          for (const player of players) {
            if (player.id !== proj.ownerId && checkCollision(zone.x, zone.y, zone.width, zone.height,
              player.x, player.y, PLAYER_SIZE, PLAYER_SIZE)) {
              player.isFrozen = true;
              player.frozenDuration = 750;
            }
          }
          nextClones.forEach((clone, index) => {
            if (clone.id !== proj.ownerId && checkCollision(zone.x, zone.y, zone.width, zone.height,
              clone.x, clone.y, PLAYER_SIZE, PLAYER_SIZE)) {
              nextClones[index].isFrozen = true;
              nextClones[index].frozenDuration = 750;
            }
          });
        }
        return zone;
      };

      // Check projectile collisions
      projectiles = projectiles.filter(proj => {
        diagnosticParent = entityDamageSource(diagnostics, proj, 'direct');
        // Check lifetime
        if (now - proj.createdAt > proj.lifetime) return false;
        const previousPosition = projectileStartPositions.get(proj.id) ?? { x: proj.x, y: proj.y };

        // Check projectile-platform collision
        for (const platform of prev.platforms) {
          if (checkProjectileCollision(proj, previousPosition, platform)) {
            if (proj.type === 'flask') {
              emitExplosion(proj, platform);
              const contact = getProjectileCollisionTime(proj, previousPosition, platform) ?? 1;
              createImpactZone(proj,
                previousPosition.x + (proj.x - previousPosition.x) * contact + proj.width / 2,
                previousPosition.y + (proj.y - previousPosition.y) * contact + proj.height / 2,
                platform);
              return false; // Remove the flask
            }

            // For now, only projectiles with gravity are blocked by platforms (except meteors)
            if (proj.hasGravity && proj.type !== 'meteor') {
              emitExplosion(proj, platform);
              const contact = getProjectileCollisionTime(proj, previousPosition, platform) ?? 1;
              createImpactZone(proj,
                previousPosition.x + (proj.x - previousPosition.x) * contact + proj.width / 2,
                previousPosition.y + (proj.y - previousPosition.y) * contact + proj.height / 2,
                platform);
              return false;
            }
          }
        }

        // Blizzard Stone ground collision
        if (proj.type === 'blizzard-stone' && proj.y + proj.height >= ARENA.height - ARENA.padding) {
          emitExplosion(proj, { x: 0, y: ARENA.height - ARENA.padding, width: ARENA.width, height: ARENA.padding });
          createImpactZone(proj, proj.x + proj.width / 2,
            ARENA.height - ARENA.padding - proj.height / 2,
            { x: 0, y: ARENA.height - ARENA.padding, width: ARENA.width, height: ARENA.padding });
          return false;
        }

        // Defer removing out-of-bounds projectiles until edge-crossing player hits are checked.
        const isOutOfBounds =
          proj.x + proj.width < 0 ||
          proj.x > ARENA.width ||
          proj.y + proj.height < 0 ||
          proj.y > ARENA.height;
        if (isOutOfBounds) {
          const targetPlayer = players[proj.ownerId === 1 ? 1 : 0];
          const hitsPlayer = !targetPlayer.isEvading &&
            !targetPlayer.isInvulnerable &&
            checkProjectileCollision(proj, previousPosition, {
              x: targetPlayer.x,
              y: targetPlayer.y,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
            });
          const hitsClone = nextClones.some(clone =>
            clone.id !== proj.ownerId &&
            !clone.isEvading &&
            !clone.isInvulnerable &&
            checkProjectileCollision(proj, previousPosition, {
              x: clone.x,
              y: clone.y,
              width: PLAYER_SIZE,
              height: PLAYER_SIZE,
            })
          );

          if (!hitsPlayer && !hitsClone) {
            emitExplosion(proj);
            const impactX = proj.x + proj.width / 2;
            const impactY = proj.y + proj.height / 2;
            createImpactZone(proj, impactX, impactY);
            return false;
          }
        }

        const victim = players[proj.ownerId === 1 ? 1 : 0];
        const canHitVictim = !victim.isEvading && !victim.isInvulnerable &&
          !(projectilePierces(proj, 'player') && now - (proj.lastHitTime[victim.id] || 0) < (proj.type === 'large-snowball' ? 50 : 100)) &&
          (proj.type !== 'bat' || !(proj.returnPhase === 'returning' ? proj.hasHitReturn : proj.hasHitForward));
        let bodyTime = canHitVictim
          ? getProjectileCollisionTime(proj, previousPosition, { ...victim, width: PLAYER_SIZE, height: PLAYER_SIZE }) ?? Infinity
          : Infinity;
        for (const clone of nextClones) {
          if (clone.id !== proj.ownerId && !clone.isEvading && !clone.isInvulnerable &&
            !(projectilePierces(proj, 'player') && now - (proj.lastHitTime[clone.id] || 0) < (proj.type === 'large-snowball' ? 50 : 100)) &&
            (proj.type !== 'bat' || !proj.hasHitForward)) {
            bodyTime = Math.min(bodyTime, getProjectileCollisionTime(proj, previousPosition,
              { ...clone, width: PLAYER_SIZE, height: PLAYER_SIZE }) ?? Infinity);
          }
        }
        let firstSword: AttackHitbox | undefined;
        let swordTime = Infinity;
        if (proj.canBeDeflected) {
          for (const hitbox of attackHitboxes) {
            if (hitbox.ownerId === proj.ownerId || !hitbox.canDeflectProjectiles || now - hitbox.createdAt > hitbox.duration) continue;
            const time = getProjectileCollisionTime(proj, previousPosition, hitbox);
            if (time !== null && time < swordTime) { swordTime = time; firstSword = hitbox; }
          }
        }

        let vine: GameEngineState['vineShields'][number] | undefined;
        let vineTime = Infinity;
        if (mapId === 'jungle') {
          for (const candidate of prev.vineShields) {
            if (!activeVine(candidate, now) || brokenVines.has(candidate.id)) continue;
            const time = getProjectileCollisionTime(proj, previousPosition, candidate);
            if (time !== null && time < vineTime) { vineTime = time; vine = candidate; }
          }
        }
        const hitCoil = findProjectileCoilContact(proj, hazardZones, previousPosition);
        const coilTime = hitCoil ? getProjectileCollisionTime(proj, previousPosition, hitCoil) ?? Infinity : Infinity;
        const worldContacts = [
          ...(vine ? [{ kind: 'vine' as const, time: vineTime }] : []),
          ...(hitCoil ? [{ kind: 'coil' as const, time: coilTime }] : []),
        ].sort((a, b) => a.time - b.time);
        const bodyBlockTime = projectilePierces(proj, 'player') ? Infinity : bodyTime;
        for (const contact of worldContacts) {
          if (contact.time >= Math.min(bodyBlockTime, swordTime)) break;
          if (contact.kind === 'vine' && vine) {
            brokenVines.add(vine.id);
            const x = previousPosition.x + (proj.x - previousPosition.x) * vineTime + proj.width / 2;
            const y = previousPosition.y + (proj.y - previousPosition.y) * vineTime + proj.height / 2;
            emitExplosion(proj, vine);
            createImpactZone(proj, x, y);
            if (!projectilePierces(proj, 'vine')) return false;
          } else if (contact.kind === 'coil' && hitCoil) {
            const x = previousPosition.x + (proj.x - previousPosition.x) * coilTime + proj.width / 2;
            const y = previousPosition.y + (proj.y - previousPosition.y) * coilTime + proj.height / 2;
            emitExplosion(proj, hitCoil);
            createImpactZone(proj, x, y);
            coilDamageMap.set(hitCoil.id, (coilDamageMap.get(hitCoil.id) || 0) + proj.damage);
            if (projectilePierces(proj, 'coil')) {
              proj.hitCoilIds = [...(proj.hitCoilIds || []), hitCoil.id];
            } else {
              return false;
            }
          }
        }

        // Resolve a sword reached before the body; fast projectiles cannot tunnel past it.
        if (firstSword && swordTime < bodyTime) {
          recordBlocked(diagnostics, { id: firstSword.ownerId, isClone: diagnostics?.entityClones[firstSword.id] }, proj.damage, 'attack');
          proj.x = previousPosition.x + (proj.x - previousPosition.x) * swordTime;
          proj.y = previousPosition.y + (proj.y - previousPosition.y) * swordTime;
          proj.velocityX *= -1;
          proj.ownerId = firstSword.ownerId;
          recordMeleeDeflection(diagnostics, firstSword.id);
          const source = entityDamageSource(diagnostics, firstSword, 'direct');
          if (source.action) recordEntityAction(diagnostics, proj, source.action, source.actionId ?? firstSword.id, source.isClone);
          return true;
        }

        // Check player collision
        const timeSinceCreated = now - proj.createdAt;
        const isReturningToOwner = proj.isReturning && (proj.type === 'bat' ? proj.returnPhase === 'returning' : timeSinceCreated > proj.lifetime * BAT_RETURN_FRACTION);

        const opponentId = proj.ownerId === 1 ? 2 : 1;
        const targetPlayerIndex = opponentId - 1;
        const playerTarget = players[targetPlayerIndex];

        // For bat projectiles: allow damage on both forward and return path, but only once per direction
        if (proj.type === 'bat') {
          const phaseAlreadyHit = isReturningToOwner ? proj.hasHitReturn : proj.hasHitForward;
          const contacts = !phaseAlreadyHit && !playerTarget.isEvading && !playerTarget.isInvulnerable
            ? [{ target: playerTarget as Player, playerIndex: targetPlayerIndex as number, cloneIndex: -1,
              time: getProjectileCollisionTime(proj, previousPosition,
                { x: playerTarget.x, y: playerTarget.y, width: PLAYER_SIZE, height: PLAYER_SIZE }) ?? Infinity }]
            : [];
          if (!isReturningToOwner && !phaseAlreadyHit) nextClones.forEach((clone, cloneIndex) => {
            if (clone.id === proj.ownerId || clone.isEvading || clone.isInvulnerable) return;
            const time = getProjectileCollisionTime(proj, previousPosition,
              { x: clone.x, y: clone.y, width: PLAYER_SIZE, height: PLAYER_SIZE });
            if (time !== null) contacts.push({ target: clone, playerIndex: -1, cloneIndex, time });
          });
          contacts.sort((a, b) => a.time - b.time);
          const contact = contacts[0];
          if (contact) {
            const target = contact.target;
            if (target.isShielding && shieldFacesX(target, previousPosition.x + proj.width / 2)) {
              recordBlocked(diagnostics, target, proj.damage);
              return false;
            }
            const damageRes = applyDamage(target, proj.damage, false, entityDamageSource(diagnostics, proj, 'direct'));
            recordHit(diagnostics, proj.id, proj.ownerId, damageRes.dealt);
            if (contact.playerIndex >= 0) players[contact.playerIndex] = damageRes.player;
            else nextClones[contact.cloneIndex] = damageRes.player;
            if (isReturningToOwner) proj.hasHitReturn = true;
            else proj.hasHitForward = true;

            const ownerIndex = proj.ownerId - 1;
            if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
              const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.33 : 0.15;
              setHealth(players[ownerIndex], Math.min(players[ownerIndex].maxHealth,
                players[ownerIndex].health + damageRes.dealt * regenMultiplier), entityDamageSource(diagnostics, proj, 'direct'));
              proj.damageAccumulated = (proj.damageAccumulated || 0) + damageRes.dealt;
            }
            return true;
          }
        } else {
          // Non-bat projectiles: original logic
          if (!isReturningToOwner) {
            const playerTime = !playerTarget.isEvading && !playerTarget.isInvulnerable
              ? getProjectileCollisionTime(proj, previousPosition,
                { x: playerTarget.x, y: playerTarget.y, width: PLAYER_SIZE, height: PLAYER_SIZE }) ?? Infinity
              : Infinity;
            let hitCloneIndex = -1;
            let cloneTime = Infinity;
            nextClones.forEach((clone, index) => {
              if (clone.id === proj.ownerId || clone.isEvading || clone.isInvulnerable) return;
              const time = getProjectileCollisionTime(proj, previousPosition,
                { x: clone.x, y: clone.y, width: PLAYER_SIZE, height: PLAYER_SIZE });
              if (time !== null && time < cloneTime) { cloneTime = time; hitCloneIndex = index; }
            });
            const hitPlayer = playerTime <= cloneTime && playerTime < Infinity;
            if (hitPlayer) {
              hitCloneIndex = -1;
            }

            if (hitPlayer || hitCloneIndex !== -1) {
              const target = hitPlayer ? playerTarget : nextClones[hitCloneIndex];
              let currentTarget = { ...target };

              if (currentTarget.isShielding) {
                const fromFront = shieldFacesX(currentTarget, previousPosition.x + proj.width / 2);
                if (fromFront) {
                  recordBlocked(diagnostics, currentTarget, proj.damage);
                  if (proj.canBeDeflected) {
                    proj.velocityX *= -1;
                    proj.ownerId = currentTarget.id as 1 | 2;
                    recordEntityAction(diagnostics, proj, 'defense',
                      diagnostics?.activeActionIds[diagnosticPlayerKey(currentTarget) + ':defense'] ?? 'defense:' + now + ':' + currentTarget.id,
                      currentTarget.isClone);
                    return true;
                  }
                  emitExplosion(proj, { x: target.x, y: target.y, width: PLAYER_SIZE, height: PLAYER_SIZE });
                  return false;
                }
              }

              const targetRect = { x: target.x, y: target.y, width: PLAYER_SIZE, height: PLAYER_SIZE };
              emitExplosion(proj, targetRect);
              const impactTime = getProjectileCollisionTime(proj, previousPosition, targetRect) ?? 1;
              const impactX = previousPosition.x + (proj.x - previousPosition.x) * impactTime + proj.width / 2;
              const impactY = previousPosition.y + (proj.y - previousPosition.y) * impactTime + proj.height / 2;
              createImpactZone(proj, impactX, impactY);
              if (proj.type === 'blizzard-stone' && hazardZones.at(-1)?.type === 'blizzard' &&
                checkCollision(hazardZones.at(-1)!.x, hazardZones.at(-1)!.y, hazardZones.at(-1)!.width, hazardZones.at(-1)!.height,
                currentTarget.x, currentTarget.y, PLAYER_SIZE, PLAYER_SIZE)) {
                currentTarget.isFrozen = true;
                currentTarget.frozenDuration = 750;
              }

              // Archer Passive: Long range shot (> 325ms) deals 15% bonus damage
              if (players[proj.ownerId - 1].character?.id === 'archer' && now - proj.createdAt > 360) {
                // Check if it's an arrow
                if (proj.type === 'arrow' || proj.type === 'poison-arrow') {
                  const bonusDamage = proj.damage * 0.15;
                  const bonusRes = applyDamage(currentTarget, bonusDamage, false, entityDamageSource(diagnostics, proj, 'direct'));
                  currentTarget = bonusRes.player;
                }
              }

              // Apply Mark Damage Boost
              let finalDamage = proj.damage;
              if (players[proj.ownerId - 1].character?.id === 'hunter' && currentTarget.health <= currentTarget.maxHealth * 0.5) {
                finalDamage *= 1.15;
              }
              if (currentTarget.isMarked && currentTarget.markOwnerId === proj.ownerId) {
                finalDamage *= 1.25;
              }

              const damageRes = applyDamage(currentTarget, finalDamage, false, entityDamageSource(diagnostics, proj, 'direct'));
              recordHit(diagnostics, proj.id, proj.ownerId, damageRes.dealt);
              currentTarget = damageRes.player;

              // Record hit time
              const ownerIndex = proj.ownerId - 1;
              proj.lastHitTime[currentTarget.id] = now;

              // Ice Mage Passive
              if (players[proj.ownerId - 1].character?.id === 'ice-mage' && !currentTarget.isFrozen) {
                if (proj.type === 'snowball') {
                  currentTarget.freezeGauge = (currentTarget.freezeGauge || 0) + 1;
                  currentTarget.lastHitByIceMage = now;
                } else if (proj.type === 'large-snowball') {
                  if (random('combat') < 0.33) {
                    currentTarget.freezeGauge = (currentTarget.freezeGauge || 0) + 1;
                  }
                  currentTarget.lastHitByIceMage = now;
                }
              }

              // Reaper Passive: Life steal 15%
              if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
                const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.33 : 0.15;
                setHealth(players[ownerIndex], Math.min(
                  players[ownerIndex].maxHealth,
                  players[ownerIndex].health + damageRes.dealt * regenMultiplier
                ), entityDamageSource(diagnostics, proj, 'direct'));
                // Accumulate damage for extra healing on return
                proj.damageAccumulated = (proj.damageAccumulated || 0) + damageRes.dealt;
              }

              // Net Logic: Pull + Mark
              if (proj.type === 'net') {
                currentTarget.isMarked = true;
                currentTarget.markDuration = 5000;
                currentTarget.markOwnerId = proj.ownerId;

                // Pull target towards owner
                const owner = players[proj.ownerId - 1];

                // Calculate pull direction
                const pullDirX = owner.x - currentTarget.x;
                // Add weak vertical pull (mostly horizontal)
                const pullDirY = (owner.y - currentTarget.y) * 0.5;

                const dist = Math.sqrt(pullDirX * pullDirX + pullDirY * pullDirY);

                if (dist > 20) { // Don't pull if already very close
                  const pullForce = 1200;

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
                // Apply 20% slow for 1s
                const existingSlow = currentTarget.isSlowed ? currentTarget.slowAmount : 0;
                if (existingSlow < 0.20) {
                  currentTarget.isSlowed = true;
                  currentTarget.slowAmount = 0.20;
                  currentTarget.slowDuration = 1000;
                } else if (currentTarget.isSlowed && currentTarget.slowAmount === 0.20) {
                  // Refresh duration if same strength
                  currentTarget.slowDuration = 1000;
                }
                // If already slowed more (e.g. 50%), don't reduce it.
              }

              // Mage Skill: Large-fireball improvements
              if (proj.type === 'large-fireball' && players[ownerIndex].character?.id === 'mage') {
                // 0% bonus damage if target is airborne
                if (!currentTarget.isGrounded) {
                  const bonusDamage = proj.damage * 0.0; // Remaining former logic. but not used.
                  const bonusRes = applyDamage(currentTarget, bonusDamage, false, entityDamageSource(diagnostics, proj, 'direct'));
                  currentTarget = bonusRes.player;
                }
                // Spawn 5 meteors at hit location with random offsets
                for (let i = 0; i < 5; i++) {
                  const xOffset = 0 + (i - 2) * 40;
                  const meteorProj = createProjectile(
                    'meteor',
                    proj.ownerId,
                    proj.x + proj.width / 2 + xOffset,
                    0, // Start from top
                    0,
                    750,
                    proj.damage * 0.3 // Adjusted damage for 5 meteors
                  );
                  newlySpawnedProjectiles.push(meteorProj);
                }
              }

              if (proj.isNapalm && damageRes.dealt > 0) {
                currentTarget.isBurning = true;
                currentTarget.burnDuration = 3000;
                currentTarget.burnDamagePerTick = proj.burnDamage ?? proj.damage * 0.075;
                currentTarget.burnIsNapalm = true;
                currentTarget.burnOwner = proj.ownerId;
                if (diagnostics) diagnostics.dotSources['burn:' + diagnosticPlayerKey(currentTarget)] = entityDamageSource(diagnostics, proj, 'burn');
                currentTarget.lastBurnTick = now;
              }

              // Mage Ultimate: Apply burn effect on any attack
              if (players[ownerIndex].character?.id === 'mage' && players[ownerIndex].mageUltimateDuration > 0 && damageRes.dealt > 0) {
                currentTarget.isBurning = true;
                currentTarget.burnDuration = 3000; // 3 seconds
                currentTarget.burnIsNapalm = false;
                currentTarget.burnDamagePerTick = players[ownerIndex].character.attackDamage * 0.10; // 10% of mage attack per tick (40% per second)
                currentTarget.burnOwner = proj.ownerId;
                if (diagnostics) diagnostics.dotSources['burn:' + diagnosticPlayerKey(currentTarget)] = entityDamageSource(diagnostics, proj, 'burn');
                currentTarget.lastBurnTick = now;
              }

              if (proj.isPoisonous) {
                if (diagnostics) {
                  diagnostics.poisonOwners[diagnosticPlayerKey(currentTarget)] = proj.ownerId;
                  diagnostics.dotSources['poison:' + diagnosticPlayerKey(currentTarget)] = entityDamageSource(diagnostics, proj, 'poison');
                }
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

              // Hacker Position Swap
              if (proj.isSwapMissile) {
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
              if (proj.isHackUltimate) {
                currentTarget.isHacked = true;
                currentTarget.hackedDuration = 4000;
              }

              // Final target update
              if (hitPlayer) players[targetPlayerIndex] = currentTarget;
              else nextClones[hitCloneIndex] = currentTarget;

              if (proj.isHackUltimate) return false;

              // Returning projectiles don't disappear immediately on hit if they haven't returned yet
              if (proj.isReturning) {
                if (timeSinceCreated < proj.lifetime * 0.35) {
                  return true;
                }
              }

              if (projectilePierces(proj, 'player')) {
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
          if (proj.type === 'bat' ? proj.returnPhase === 'returning' : timeSinceCreated > proj.lifetime * BAT_RETURN_FRACTION) {
            if (checkCollision(
              proj.x, proj.y, proj.width, proj.height,
              owner.x, owner.y, PLAYER_SIZE, PLAYER_SIZE
            )) {
              // For bat: heal base 60% of damage + bonus from hits
              if (proj.type === 'bat') {
                const baseHeal = 0;
                const bonusHeal = (proj.damageAccumulated || 0) * 0.60;
                const totalHeal = baseHeal + bonusHeal;
                if (totalHeal > 0) {
                  setHealth(players[proj.ownerId - 1], Math.min(
                    players[proj.ownerId - 1].maxHealth,
                    players[proj.ownerId - 1].health + totalHeal
                  ), entityDamageSource(diagnostics, proj, 'direct'));
                }
              } else {
                // Other returning projectiles: heal only from accumulated damage
                const healAmount = (proj.damageAccumulated || 0) * 0.60;
                if (healAmount > 0) {
                  setHealth(players[proj.ownerId - 1], Math.min(
                    players[proj.ownerId - 1].maxHealth,
                    players[proj.ownerId - 1].health + healAmount
                  ), entityDamageSource(diagnostics, proj, 'direct'));
                }
              }
              return false; // Remove projectile immediately
            }
          }
        }

        return true;
      });

      projectiles = [...projectiles, ...newlySpawnedProjectiles];

      // Check melee attack hitboxes
      attackHitboxes = attackHitboxes.filter(hitbox => {
        if (now - hitbox.createdAt > hitbox.duration) return false;

        const hitCoil = findMeleeCoilContact(hitbox, hazardZones);
        if (hitCoil) {
          coilDamageMap.set(hitCoil.id, (coilDamageMap.get(hitCoil.id) || 0) + hitbox.damage);
        }

        const targetIndex = hitbox.ownerId === 1 ? 1 : 0;
        const playerTarget = players[targetIndex];
        if (diagnostics?.pendingMelee[hitbox.id]) recordMeleeContact(diagnostics, hitbox.id,
          checkCollision(hitbox.x, hitbox.y, hitbox.width, hitbox.height, playerTarget.x, playerTarget.y, PLAYER_SIZE, PLAYER_SIZE) ||
          nextClones.some(clone => clone.id !== hitbox.ownerId && checkCollision(hitbox.x, hitbox.y, hitbox.width, hitbox.height,
            clone.x, clone.y, PLAYER_SIZE, PLAYER_SIZE)));

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
            const fromFront = shieldFacesX(currentTarget, hitbox.sourceX ?? players[hitbox.ownerId - 1].x + PLAYER_SIZE / 2);
            if (fromFront) {
              recordBlocked(diagnostics, currentTarget, hitbox.damage, 'defense', hitbox.id);
              return true;
            }
          }

          // Apply Mark Damage Boost
          let finalDamage = hitbox.damage;
          if (players[hitbox.ownerId - 1].character?.id === 'hunter' && currentTarget.health <= currentTarget.maxHealth * 0.5) {
            finalDamage *= 1.15;
          }
          if (currentTarget.isMarked && currentTarget.markOwnerId === hitbox.ownerId) {
            finalDamage *= 1.25;
          }

          const damageRes = applyDamage(currentTarget, finalDamage, false, entityDamageSource(diagnostics, hitbox, 'direct'));
          recordHit(diagnostics, hitbox.id, hitbox.ownerId, damageRes.dealt);
          currentTarget = damageRes.player;

          // Reaper Passive: Life steal 15%
          const ownerIndex = hitbox.ownerId - 1;
          if (players[ownerIndex].character?.id === 'reaper' && damageRes.dealt > 0) {
            const regenMultiplier = players[ownerIndex].isUsingUltimate ? 0.33 : 0.15;
            setHealth(players[ownerIndex], Math.min(
              players[ownerIndex].maxHealth,
              players[ownerIndex].health + damageRes.dealt * regenMultiplier
            ), entityDamageSource(diagnostics, hitbox, 'direct'));
          }

          // Mage Ultimate: Apply burn effect on melee attacks
          if (players[ownerIndex].character?.id === 'mage' && players[ownerIndex].mageUltimateDuration > 0 && damageRes.dealt > 0) {
            currentTarget.isBurning = true;
            currentTarget.burnDuration = 3000; // 3.0 seconds
            currentTarget.burnIsNapalm = false;
            currentTarget.burnDamagePerTick = players[ownerIndex].character.attackDamage * 0.075;
            currentTarget.burnOwner = hitbox.ownerId;
            if (diagnostics) diagnostics.dotSources['burn:' + diagnosticPlayerKey(currentTarget)] = entityDamageSource(diagnostics, hitbox, 'burn');
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

      if (diagnostics) finishMeleeTrials(diagnostics, attackHitboxes.map(hitbox => hitbox.id));

      // Update hazard zones
      const explosions: HazardZone[] = [];

      hazardZones = hazardZones.map(zone => {
        diagnosticParent = entityDamageSource(diagnostics, zone, 'zone');
        const zoneCopy = { ...zone };

        if (zoneCopy.type === 'tesla-coil' && zoneCopy.health !== undefined) {
          const damage = coilDamageMap.get(zoneCopy.id) || 0;
          if (damage > 0) {
            zoneCopy.health -= damage;
          }
          if (zoneCopy.health <= 0) {
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            const explosion = coilExplosionGeometry(zoneCopy, 'destroyed');
            if (playerOverlapsRect(players[targetIndex], explosion)) {
              const target = players[targetIndex];
              players[targetIndex] = applyDamage(target, zoneCopy.damage * explosion.damageMultiplier, true, { kind: 'zone', ownerId: zoneCopy.ownerId, entityId: zoneCopy.id, action: 'ultimate' }).player;
              const coilCenterX = zoneCopy.x + zoneCopy.width / 2;
              const playerCenterX = target.x + PLAYER_SIZE / 2;
              players[targetIndex].knockbackVelocityX = (playerCenterX >= coilCenterX ? 1 : -1) * explosion.knockbackX;
              players[targetIndex].knockbackVelocityY = explosion.knockbackY;
              players[targetIndex].isGrounded = false;
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

        if (zoneCopy.isNapalm) {
          const through = Math.min(now, zoneCopy.createdAt + zoneCopy.duration);
          while (through - zoneCopy.lastTick >= zoneCopy.tickRate) {
            zoneCopy.lastTick += zoneCopy.tickRate;
            for (let i = 0; i < 2; i++) {
              if (i !== zoneCopy.ownerId - 1 && checkCollision(zoneCopy.x, zoneCopy.y, zoneCopy.width, zoneCopy.height,
                players[i].x, players[i].y, PLAYER_SIZE, PLAYER_SIZE)) players[i] = applyDamage(players[i], zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone')).player;
            }
            nextClones.forEach((clone, index) => {
              if (clone.id !== zoneCopy.ownerId && checkCollision(zoneCopy.x, zoneCopy.y, zoneCopy.width, zoneCopy.height,
                clone.x, clone.y, PLAYER_SIZE, PLAYER_SIZE)) nextClones[index] = applyDamage(clone, zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone')).player;
            });
          }
          return now - zoneCopy.createdAt > zoneCopy.duration ? null : zoneCopy;
        }
        if (now - zoneCopy.createdAt > zoneCopy.duration) {
          if (zoneCopy.type === 'tesla-coil') {
            const targetIndex = zoneCopy.ownerId === 1 ? 1 : 0;
            const explosion = coilExplosionGeometry(zoneCopy, 'expired');
            if (playerOverlapsRect(players[targetIndex], explosion)) {
              const target = players[targetIndex];
              players[targetIndex] = applyDamage(target, zoneCopy.damage * explosion.damageMultiplier, true, { kind: 'zone', ownerId: zoneCopy.ownerId, entityId: zoneCopy.id, action: 'ultimate' }).player;
              const coilCenterX = zoneCopy.x + zoneCopy.width / 2;
              const playerCenterX = target.x + PLAYER_SIZE / 2;
              players[targetIndex].knockbackVelocityX = (playerCenterX >= coilCenterX ? 1 : -1) * explosion.knockbackX;
              players[targetIndex].knockbackVelocityY = explosion.knockbackY;
              players[targetIndex].isGrounded = false;
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
          if (now - selfDamageTick >= 250) {
            zoneCopy.health -= zoneCopy.maxHealth * 0.01;
            zoneCopy.lastSelfDamage = now;
          }
        }

        if (zoneCopy.type === 'tesla-coil') {
          stepCoilMotion(zoneCopy, prev.platforms, deltaTime);

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
              players[targetIndex] = applyDamage(target, zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone')).player;
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
            players[targetIndex] = applyDamage(target, zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone')).player;
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
              const damageRes = applyDamage(target, zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone'));
              players[targetIndex] = damageRes.player;

              // Apply freeze stack
              if (!players[targetIndex].isFrozen) {
                if (random('combat') <= 0.1) {
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

            if (fireRingOverlapsPlayer(zoneCopy, target)) {
              players[targetIndex] = applyDamage(target, zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone')).player;
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
                players[i] = applyDamage(players[i], zoneCopy.damage, true, entityDamageSource(diagnostics, zoneCopy, 'zone')).player;
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
          // Leave enough space between echoes so the afterimage reads as a streak.
          const lastTrailTime = players[i].trailPositions[players[i].trailPositions.length - 1]?.timestamp || 0;
          if (now - lastTrailTime >= 80) {
            players[i].trailPositions.push({
              x: players[i].x + PLAYER_SIZE / 2,
              y: players[i].y + PLAYER_SIZE / 2,
              timestamp: now,
            });
            // Keep only the echoes that can still be seen during their 600ms fade.
            if (players[i].trailPositions.length > 8) {
              players[i].trailPositions.shift();
            }
          }
          // Remove old trail positions after their fade completes.
          players[i].trailPositions = players[i].trailPositions.filter(
            pos => now - pos.timestamp < 600
          );
        }
      }

      // Reaper Ultimate contact damage
      for (let i = 0; i < 2; i++) {
        if (players[i].isFlying && players[i].character?.id === 'reaper') {
          const targetIndex = i === 0 ? 1 : 0;
          const target = players[targetIndex];
          // Ultimate damage hitbox is significantly larger (for visual sphere)
          if (playerOverlapsRect(target, reaperContactGeometry(players[i]))) {
            if (!players[i].lastUltTick || now - (players[i].lastUltTick || 0) >= 100) {
              const damageMultiplier = prev.isOvertime ? 2.0 : 1.0;
              const baseDamage = players[i].character.attackDamage * (1 + players[i].damageBoost) * damageMultiplier;
              const ultimateSource: DamageSource = { kind: 'direct', ownerId: players[i].id, action: 'ultimate',
                actionId: diagnostics?.activeActionIds['player:' + players[i].id + ':ultimate'] };
              const damageRes = applyDamage(target, baseDamage * 0.10, true, ultimateSource); // 10% of base damage per tick (Area)
              players[targetIndex] = damageRes.player;
              // Life steal 15 -> 33%
              setHealth(players[i], Math.min(players[i].maxHealth, players[i].health + damageRes.dealt * 0.33), ultimateSource);
              players[i].lastUltTick = now;
              // Slow effect
              players[targetIndex].isSlowed = true;
              players[targetIndex].slowAmount = 0.15;
              players[targetIndex].slowDuration = 500;
            }
          }
        }
      }

      // ============ MAP ENVIRONMENTAL EFFECTS ============
      let { sandstormActive, sandstormDirection, sandstormTimer, nextSandstormTime,
        lightningStrikes, nextLightningTime, soulZones, nextSoulZoneTime,
        vineShields, nextVineTime, lastLavaDamage, fallingLeaves } = prev;

      // --- WASTELAND: Sandstorm ---
      if (mapId === 'wasteland') {
        if (sandstormActive) {
          sandstormTimer -= deltaTime;
          if (sandstormTimer <= 0) {
            sandstormActive = false;
            nextSandstormTime = now + 10000 + random('environment') * 10000;
          } else {
            // Apply 1 damage per 1.5 seconds to both players (reduced frequency)
            for (let i = 0; i < 2; i++) {
              if (now % 1500 < deltaTime) {
                const environmentHit = applyDamage(players[i], 1, true, { kind: 'environment', ownerId: null });
                if (diagnostics) diagnostics.environmentDamage[i] += environmentHit.dealt;
                players[i] = environmentHit.player;
              }
              // Push players in sandstorm direction - stronger and gusty
              players[i].knockbackVelocityX += sandstormImpulse(now, deltaTime / 1000, sandstormDirection);

              // Add minor vertical jitter if grounded to simulate sand hitting
              if (players[i].isGrounded && random('environment') < 0.1) {
                players[i].y -= 1;
              }
            }
          }
        } else if (now >= nextSandstormTime) {
          sandstormActive = true;
          sandstormDirection = random('environment') > 0.5 ? 'right' : 'left';
          sandstormTimer = 5000;
        }
      }

      // --- GRAVEYARD: Lightning ---
      if (mapId === 'graveyard') {
        // Spawn lightning
        if (now >= nextLightningTime) {
          // Higher position = higher chance of being target
          const p1Height = ARENA.height - players[0].y;
          const p2Height = ARENA.height - players[1].y;
          const totalWeight = p1Height * p1Height + p2Height * p2Height;
          const targetPlayer: 1 | 2 = random('environment') < (p1Height * p1Height / totalWeight) ? 1 : 2;
          const target = players[targetPlayer - 1];

          lightningStrikes = [...lightningStrikes, {
            id: `lightning-${now}-${random('id')}`,
            x: target.x + PLAYER_SIZE / 2,
            targetPlayerId: targetPlayer,
            warningStart: now,
            struck: false,
          }];
          nextLightningTime = now + 5000 + random('environment') * 8000;
        }

        // Process lightning strikes
        lightningStrikes = lightningStrikes.map(strike => {
          const elapsed = now - strike.warningStart;
          if (elapsed >= LIGHTNING_WARNING_MS && !strike.struck) {
            // Strike!
            const strikeX = strike.x;
            for (let i = 0; i < 2; i++) {
              const px = players[i].x + PLAYER_SIZE / 2;
              if (Math.abs(px - strikeX) < LIGHTNING_RADIUS) {
                const environmentHit = applyDamage(players[i], 20, true, { kind: 'environment', ownerId: null });
                if (diagnostics) diagnostics.environmentDamage[i] += environmentHit.dealt;
                players[i] = environmentHit.player;
                players[i].isStunned = true;
                players[i].stunDuration = 500;
                players[i].isSlowed = true;
                players[i].slowAmount = 0.2;
                players[i].slowDuration = 3000;
              }
            }
            return { ...strike, struck: true };
          }
          return strike;
        }).filter(s => now - s.warningStart < 2000);

        // Soul zone spawning
        if (now >= nextSoulZoneTime) {
          soulZones = [...soulZones, {
            id: `soul-${now}`,
            x: 100 + random('environment') * (ARENA.width - 250),
            y: 200 + random('environment') * 200,
            width: 200,
            height: 200,
            createdAt: now,
            duration: 6000,
          }];
          nextSoulZoneTime = now + 12000 + random('environment') * 10000;
        }

        // Process soul zones
        soulZones = soulZones.filter(zone => {
          if (now - zone.createdAt > zone.duration) return false;
          for (let i = 0; i < 2; i++) {
            if (checkCollision(zone.x, zone.y, zone.width, zone.height,
              players[i].x, players[i].y, PLAYER_SIZE, PLAYER_SIZE)) {
              // 1% max hp per second
              if (now % 1000 < deltaTime) {
                setHealth(players[i], Math.min(players[i].maxHealth,
                  players[i].health + players[i].maxHealth * 0.01), { kind: 'environment', ownerId: null });
              }
              // Mana regen boost handled implicitly via speed multiplier effect
              // We'll boost mana directly
              const bonusMana = players[i].character!.manaRegen * 0.5 * (deltaTime / 1000);
              players[i].mana = Math.min(players[i].maxMana, players[i].mana + bonusMana);
            }
          }
          return true;
        });
      }

      // --- JUNGLE: Vine shields ---
      if (mapId === 'jungle') {
        if (now >= nextVineTime) {
          const vineX = 50 + random('environment') * (ARENA.width - 100);
          vineShields = [...vineShields, {
            id: `vine-${now}`,
            x: vineX,
            y: 0,
            width: 48,
            height: 240 + random('environment') * 100,
            createdAt: now,
            duration: 12000,
            hp: 1,
          }];
          nextVineTime = now + 8000 + random('environment') * 10000;
        }

        // Check vine-projectile collision
        vineShields = vineShields.filter(vine => {
          if (vine.destroyedAt !== undefined) return now - vine.destroyedAt < VINE_FADE_MS;
          if (now - vine.createdAt > vine.duration) {
            vine.destroyedAt = now;
            return true;
          }
          if (vine.hp <= 0) return false;
          const hit = brokenVines.has(vine.id) ? -1 : projectiles.findIndex(p =>
            checkCollision(vine.x, vine.y, vine.width, vine.height, p.x, p.y, p.width, p.height)
          );
          const hitByMelee = attackHitboxes.some(hitbox =>
            checkCollision(vine.x, vine.y, vine.width, vine.height,
              hitbox.x, hitbox.y, hitbox.width, hitbox.height)
          );
          if (brokenVines.has(vine.id) || hit >= 0 || hitByMelee) {
            if (hit >= 0) {
              emitExplosion(projectiles[hit], vine);
              projectiles.splice(hit, 1);
            }
            vine.hp--;
            vine.destroyedAt = now;
            // Trigger falling leaves
            for (let l = 0; l < 4; l++) {
              fallingLeaves = [...fallingLeaves, {
                id: `leaf-${now}-${l}`,
                x: vine.x + random('cosmetic') * vine.width,
                y: vine.y,
                vx: (random('cosmetic') - 0.5) * 60,
                vy: 30 + random('cosmetic') * 40,
                rotation: random('cosmetic') * 360,
              }];
            }
            return true;
          }
          return true;
        });

        // Update falling leaves
        fallingLeaves = fallingLeaves.map(leaf => ({
          ...leaf,
          x: leaf.x + leaf.vx * (deltaTime / 1000),
          y: leaf.y + leaf.vy * (deltaTime / 1000),
          rotation: leaf.rotation + 90 * (deltaTime / 1000),
        })).filter(leaf => leaf.y < ARENA.height);
      }

      // --- VOLCANO: Lava floor damage ---
      if (mapId === 'volcano') {
        const newLastLavaDamage: [number, number] = [...lastLavaDamage];
        for (let i = 0; i < 2; i++) {
          const playerBottom = players[i].y + PLAYER_SIZE;
          if (playerBottom >= ARENA.height - ARENA.padding) {
            if (now - newLastLavaDamage[i] >= 500) { // Prevent rapid re-triggering
              let lavaDamage = 15;
              if (players[i].isBurning) lavaDamage *= 1.2;
              const environmentHit = applyDamage(players[i], lavaDamage, true, { kind: 'environment', ownerId: null });
              if (diagnostics) diagnostics.environmentDamage[i] += environmentHit.dealt;
              players[i] = environmentHit.player;
              // Bounce up
              players[i].velocityY = -900;
              players[i].y = ARENA.height - ARENA.padding - PLAYER_SIZE - 5;
              // Apply burn
              players[i].isBurning = true;
              players[i].burnDuration = 3000;
              players[i].burnIsNapalm = false;
              players[i].burnDamagePerTick = 2;
              players[i].burnOwner = null;
              players[i].lastBurnTick = now;
              players[i].isFrozen = false;
              newLastLavaDamage[i] = now;
            }
          }
        }
        lastLavaDamage = newLastLavaDamage;
      }

      // Check win conditions
      let roundWinner: 1 | 2 | 'draw' | null = null;
      if (players[0].health <= 0 && players[1].health <= 0) roundWinner = 'draw';
      else if (players[0].health <= 0) roundWinner = 2;
      else if (players[1].health <= 0) roundWinner = 1;
      else if (roundTimeLimit > 0 && newTimeRemaining <= 0) {
        if (players[0].health === players[1].health) roundWinner = 'draw';
        else roundWinner = players[0].health > players[1].health ? 1 : 2;
      }

      const liveActors = new Set([...players, ...nextClones].map((p, index) => visualActorId(p, index)));
      for (const actor of Object.keys(combatVisual.sequences)) {
        if (!liveActors.has(actor)) {
          delete combatVisual.sequences[actor];
          delete combatVisual.attacks[actor];
        }
      }
      for (const p of [...players, ...nextClones]) {
        if ((p.character?.id === 'reaper' && p.isFlying) || roundWinner) delete combatVisual.attacks[visualActorId(p)];
      }

      return {
        ...prev,
        combatVisual,
        ...(evaluationState ? { evaluationState } : {}),
        players,
        aiState: { learning, controllers, ...(difficulty ? { difficulty } : {}) },
        diagnostics,
        clones: nextClones,
        projectiles,
        explosionEffects,
        hazardZones,
        attackHitboxes,
        roundTimeRemaining: newTimeRemaining,
        isRoundActive: !roundWinner,
        roundWinner,
        sandstormActive, sandstormDirection, sandstormTimer, nextSandstormTime,
        lightningStrikes, nextLightningTime,
        soulZones, nextSoulZoneTime,
        vineShields, nextVineTime,
        lastLavaDamage,
        fallingLeaves,
      };
    });
  };

  useEffect(() => {
    if (gameState.roundWinner && !roundEndingRef.current) {
      roundEndingRef.current = true;
      const timeoutId = setTimeout(() => {
        onRoundEnd(gameState.roundWinner!);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [gameState.roundWinner, onRoundEnd]);

  const gameLoopRef = useRef(gameLoop);
  useEffect(() => { gameLoopRef.current = gameLoop; });
  useEffect(() => {
    const interval = setInterval(() => gameLoopRef.current(), TICK_RATE);
    return () => clearInterval(interval);
  }, []);

  const resetRound = useCallback(() => {
    roundStartTimeRef.current = Date.now();
    pausedAtRef.current = null;
    shieldManaTickRef.current = [0, 0];
    roundEndingRef.current = false;
    setGameState(prev => ({ ...createInitialEngineState(prev.evaluationState, prev.combatVisual.roundId + 1), aiState: {
      ...createAIRoundState(prev.aiState.learning),
      ...(prev.aiState.difficulty ? { difficulty: createDifficultyRuntime(prev.aiState.difficulty.session) } : {}),
    } }));
  }, [createInitialEngineState]);

  const togglePause = useCallback(() => {
    setGameState(prev => {
      const pausedMs = prev.isPaused && pausedAtRef.current !== null ? Date.now() - pausedAtRef.current : 0;
      return { ...prev, isPaused: !prev.isPaused,
        projectiles: pausedMs ? prev.projectiles.map(p => isRocket(p) ? { ...p, createdAt: p.createdAt + pausedMs } : p) : prev.projectiles,
        hazardZones: pausedMs ? prev.hazardZones.map(z => z.isNapalm ? { ...z, createdAt: z.createdAt + pausedMs, lastTick: z.lastTick + pausedMs } : z) : prev.hazardZones,
        players: pausedMs ? prev.players.map(p => p.isBurning ? { ...p, lastBurnTick: p.lastBurnTick + pausedMs } : p) as [Player, Player] : prev.players,
        clones: pausedMs ? prev.clones.map(p => p.isBurning ? { ...p, lastBurnTick: p.lastBurnTick + pausedMs } : p) : prev.clones,
        aiState: { ...prev.aiState, learning: resetAILearningObservations(prev.aiState.learning) },
      };
    });
  }, []);

  return {
    gameState,
    setKeysRef,
    resetRound,
    togglePause,
  };
};
