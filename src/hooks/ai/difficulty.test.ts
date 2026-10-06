import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { AI_PRESETS, NEUTRAL_AI_TRAITS, createAISettings, type AISettings } from '@/types/ai';
import { MAPS, type MapId } from '@/types/map';
import type { HazardZone, Projectile } from '@/types/projectile';
import { decideAI } from './controller';
import { createDifficultyRuntime, createDifficultySession, resolveTraits, stepDifficulty } from './difficulty';
import { createOpponentModel } from './learning';
import { createPerceptionMemory, perceiveWorld } from './perception';
import { prepareAIFrame, type AIWorld } from './world';
import { seededRandom } from './random';

function world(character: CharacterType = 'mage', map: MapId = 'wasteland'): AIWorld {
  return {
    players: [{ ...createInitialPlayer(1, CHARACTERS.gladiator), x: 200, y: 440, mana: 60 }, { ...createInitialPlayer(2, CHARACTERS[character]), x: 500, y: 440, mana: 60 }],
    now: 10000, deltaTime: 16, platforms: MAPS[map].platforms, mapId: map, isOvertime: false, roundTimeRemaining: 60,
    projectiles: [], hazardZones: [], attackHitboxes: [], sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [],
  };
}
function neutral(settings: AISettings): AISettings {
  for (const name of Object.keys(settings.traits) as (keyof typeof settings.traits)[]) settings.traits[name] = { automatic: false, value: 1 };
  return settings;
}
function trap(props: Partial<HazardZone> = {}): HazardZone {
  return { id: 'trap', type: 'bear-trap', ownerId: 1, x: 300, y: 420, width: 45, height: 20, damage: 30, tickRate: 100, lastTick: 9500, createdAt: 9500, duration: 10000, ...props };
}
function projectile(props: Partial<Projectile> = {}): Projectile {
  return { id: 'shot', type: 'fireball', ownerId: 1, x: 350, y: 440, width: 24, height: 24, velocityX: 780, velocityY: 0,
    gravity: 0, hasGravity: false, damage: 30, createdAt: 9500, lifetime: 3000, isExplosive: true, explosionRadius: 50,
    isPoisonous: false, poisonDuration: 0, slowAmount: 0, slowDuration: 0, stunDuration: 0, knockback: 0,
    createsFirePool: false, firePoolDuration: 0, canBeDeflected: true, isReturning: false, damageAccumulated: 0, lastHitTime: {}, ...props };
}

describe('perception information boundaries', () => {
  it('hidden fields cannot change restricted observations or decisions', () => {
    const first = world();
    first.projectiles = [projectile()]; first.hazardZones = [trap()];
    const changed: AIWorld = { ...first, sandstormDirection: 'left', sandstormTimer: 99999,
      players: [{ ...first.players[0], attackCooldownRemaining: 800, velocityX: 900, knockbackVelocityY: 500, damageBoost: 99, lastUltTick: 9000, isEvading: true }, { ...first.players[1], damageReduction: 0.99, velocityY: 500, attackCooldownRemaining: 300 }],
      projectiles: [projectile({ damage: 9999, velocityX: 50, lifetime: 1, lastHitTime: { 2: 9000 }, hasHitForward: true })],
      hazardZones: [trap({ duration: 50000, damage: 9999, lastTick: 9999 })],
    };
    for (const parameters of [AI_PRESETS.easy, AI_PRESETS.medium, AI_PRESETS.hard]) {
      const a = perceiveWorld(first, parameters, createPerceptionMemory());
      const b = perceiveWorld(changed, parameters, createPerceptionMemory());
      expect(b).toEqual(a);
      const settings = neutral(createAISettings('hard'));
      const initial = createDifficultyRuntime(createDifficultySession(731));
      expect(stepDifficulty(first, settings, initial)).toEqual(stepDifficulty(changed, settings, initial));
    }
  });
  it('reads HUD integer/time/bar precision and derives velocity from previous positions', () => {
    const w = world();
    w.players = [{ ...w.players[0], health: 99.9, mana: 45.8, skillCooldownRemaining: 124.5, isHacked: true, hackedDuration: 1234, velocityX: 999 }, w.players[1]];
    const a = perceiveWorld(w, AI_PRESETS.hard, createPerceptionMemory());
    expect(a.world.players[0]).toMatchObject({ health: 99, mana: 45, hackedDuration: 1200, velocityX: 0 });
    const next: AIWorld = { ...w, now: 10050, players: [{ ...w.players[0], x: 210 }, w.players[1]] };
    expect(perceiveWorld(next, AI_PRESETS.hard, a.memory).world.players[0].velocityX).toBe(200);
  });
  it('remembers only observed traps, including unseen removal or relocation', () => {
    const w = { ...world(), hazardZones: [trap()] };
    const observed = perceiveWorld(w, AI_PRESETS.hard, createPerceptionMemory());
    const hidden = { ...w, now: 12000, hazardZones: [trap({ x: 700 })] };
    expect(perceiveWorld(hidden, AI_PRESETS.hard, createPerceptionMemory()).world.hazardZones).toEqual([]);
    const remembered = perceiveWorld(hidden, AI_PRESETS.hard, observed.memory);
    expect(remembered.world.hazardZones[0].x).toBe(300);
    expect(perceiveWorld({ ...hidden, hazardZones: [] }, AI_PRESETS.hard, observed.memory)).toEqual(remembered);
    expect(perceiveWorld(hidden, AI_PRESETS.perfect, createPerceptionMemory()).world.hazardZones[0].x).toBe(700);
  });
  it('honors information switches even with exact internal data', () => {
    const w = world(); w.projectiles = [projectile()]; w.hazardZones = [trap()];
    w.players = [{ ...w.players[0], health: 1, mana: 1, isHacked: true, skillCooldownRemaining: 1000 }, w.players[1]];
    const parameters = { ...AI_PRESETS.perfect, information: { resources: false, cooldowns: false, statuses: false, projectiles: false, hazards: false, environment: false } };
    const observation = perceiveWorld(w, parameters, createPerceptionMemory()).world;
    expect(observation.players[0]).toMatchObject({ health: CHARACTERS.gladiator.maxHealth, mana: 100, isHacked: false, skillCooldownRemaining: 0 });
    expect([observation.projectiles, observation.hazardZones, observation.attackHitboxes, observation.lightningStrikes, observation.vineShields]).toEqual([[], [], [], [], []]);
  });
  it('forgets temporary memories after three seconds from the last sighting without learning hidden changes', () => {
    const parameters = { ...AI_PRESETS.hard, hidden: 'temporary' as const };
    const w = { ...world(), hazardZones: [trap()] };
    const first = perceiveWorld(w, parameters, createPerceptionMemory());
    const refreshed = perceiveWorld({ ...w, now: 10500 }, parameters, first.memory);
    const hidden = { ...w, now: 13499, hazardZones: [trap({ x: 700 })] };
    const remembered = perceiveWorld(hidden, parameters, refreshed.memory);
    expect(remembered.world.hazardZones[0].x).toBe(300);
    expect(perceiveWorld({ ...hidden, hazardZones: [] }, parameters, refreshed.memory)).toEqual(remembered);
    const forgotten = perceiveWorld({ ...hidden, now: 13500 }, parameters, remembered.memory);
    expect(forgotten.world.hazardZones).toEqual([]); expect(forgotten.memory.traps).toEqual([]);
    expect(perceiveWorld({ ...hidden, now: 13500 }, AI_PRESETS.hard, refreshed.memory).world.hazardZones).toHaveLength(1);
    const visibleAgain = { ...hidden, now: 13516, hazardZones: [trap({ x: 700, createdAt: 13516 })] };
    expect(perceiveWorld(visibleAgain, parameters, forgotten.memory).world.hazardZones[0].x).toBe(700);
  });
  it('uses the active observation clock for temporary memory while wall time is paused', () => {
    const parameters = { ...AI_PRESETS.hard, hidden: 'temporary' as const };
    const observed = perceiveWorld({ ...world(), hazardZones: [trap()] }, parameters, createPerceptionMemory(), 100);
    const hidden = { ...world(), now: 18000, hazardZones: [] };
    expect(perceiveWorld(hidden, parameters, observed.memory, 200).world.hazardZones).toHaveLength(1);
    expect(perceiveWorld(hidden, parameters, observed.memory, 3100).world.hazardZones).toEqual([]);
  });
  it('takes independent snapshots rather than retaining mutable player/projectile objects', () => {
    const w = world(); w.projectiles = [projectile()];
    const snapshot = perceiveWorld(w, AI_PRESETS.perfect, createPerceptionMemory()).world;
    w.players[0].health = 0; w.projectiles[0].lastHitTime[2] = 123;
    expect(snapshot.players[0].health).toBe(150); expect(snapshot.projectiles[0].lastHitTime).toEqual({});
  });
});

describe('difficulty scheduling and compatibility', () => {
  it('compensates inversion on the first matured observation and keeps normal input until then', () => {
    const settings = neutral(createAISettings('perfect'));
    let state = stepDifficulty(world(), settings, createDifficultyRuntime(createDifficultySession(731)));
    const normalKeys = { ...state.keys };
    Object.assign(settings.parameters, { reactionMin: 100, reactionMax: 100 });
    const hacked = world();
    hacked.players = [hacked.players[0], { ...hacked.players[1], isHacked: true, hackedDuration: 4000 }];
    for (let tick = 1; tick <= 7; tick++) {
      state = stepDifficulty({ ...hacked, now: 10000 + tick * 16 }, settings, state);
      expect(state.keys).toEqual(normalKeys);
    }
    state = stepDifficulty({ ...hacked, now: 10128 }, settings, state);
    expect(normalKeys.arrowLeft || normalKeys.arrowRight).toBe(true);
    expect(state.keys.arrowLeft).toBe(normalKeys.arrowRight);
    expect(state.keys.arrowRight).toBe(normalKeys.arrowLeft);
    expect(state.keys.arrowUp).toBe(normalKeys.arrowDown);
    expect(state.keys.arrowDown).toBe(normalKeys.arrowUp);
  });
  it('makes more inversion errors at lower adaptation levels without changing unrestricted AI', () => {
    const w = world(); w.players = [w.players[0], { ...w.players[1], isHacked: true, hackedDuration: 4000 }];
    const frame = prepareAIFrame(w);
    const legacy = decideAI(frame, w.players[1]);
    expect(legacy.keys.arrowLeft || legacy.keys.arrowRight).toBe(true);
    const counts: number[] = [];
    for (const controlAdaptation of [0, 25, 60, 100]) {
      const rng = seededRandom(731);
      let correct = 0;
      for (let trial = 0; trial < 300; trial++) {
        const decision = decideAI(frame, w.players[1], createOpponentModel(), undefined, {
          parameters: { ...AI_PRESETS.perfect, controlAdaptation }, traits: NEUTRAL_AI_TRAITS, random: rng.next,
        });
        if (decision.keys.arrowLeft === legacy.keys.arrowLeft && decision.keys.arrowRight === legacy.keys.arrowRight) correct++;
        expect(decision.keys.shift).toBe(legacy.keys.shift);
        expect(decision.keys.enter).toBe(legacy.keys.enter);
        expect(decision.keys.backslash).toBe(legacy.keys.backslash);
      }
      counts.push(correct);
    }
    expect(counts[0]).toBe(0); expect(counts[1]).toBeGreaterThan(50);
    expect(counts[1]).toBeLessThan(100); expect(counts[2]).toBeGreaterThan(150);
    expect(counts[2]).toBeLessThan(210); expect(counts[3]).toBe(300);
  });
  it('separates observation intervals from reaction delay and waits for the first observation', () => {
    const settings = neutral(createAISettings('medium'));
    Object.assign(settings.parameters, { observationInterval: 50, reactionMin: 100, reactionMax: 100, precisionMin: 100, precisionMax: 100, noise: 0 });
    let state = createDifficultyRuntime(createDifficultySession(731));
    const w = world();
    for (let tick = 0; tick < 7; tick++) {
      state = stepDifficulty({ ...w, now: 10000 + tick * 16 }, settings, state);
      expect(state.decisionsMade).toBe(0);
      expect(Object.values(state.keys).some(Boolean)).toBe(false);
    }
    state = stepDifficulty({ ...w, now: 10112 }, settings, state);
    expect(state.observationsTaken).toBe(2); expect(state.decisionsMade).toBe(1);
    expect(state.activeTime).toBe(128);
  });
  it('is replayable without mutating prior memory or consuming global randomness', () => {
    const previous = createDifficultyRuntime(createDifficultySession(91));
    const before = JSON.stringify(previous);
    const settings = neutral(createAISettings('easy')); settings.parameters.reactionMin = 0; settings.parameters.reactionMax = 0;
    const first = stepDifficulty(world(), settings, previous);
    expect(stepDifficulty(world(), settings, previous)).toEqual(first);
    expect(JSON.stringify(previous)).toBe(before);
  });
  it('zero precision omits changed inputs and retries on later observations', () => {
    const settings = neutral(createAISettings('perfect'));
    settings.parameters.precisionMin = 0; settings.parameters.precisionMax = 0;
    let state = createDifficultyRuntime(createDifficultySession(91));
    for (let tick = 0; tick < 10; tick++) state = stepDifficulty({ ...world(), now: 10000 + tick * 16 }, settings, state);
    expect(state.decisionsMade).toBe(10); expect(Object.values(state.keys).some(Boolean)).toBe(false);
    settings.parameters.precisionMin = 100; settings.parameters.precisionMax = 100;
    state = stepDifficulty({ ...world(), now: 10160 }, settings, state);
    expect(Object.values(state.keys).some(Boolean)).toBe(true);
  });
  it('delayed inputs stay within the precision timing bound and never oppose themselves', () => {
    const settings = neutral(createAISettings('perfect'));
    settings.parameters.precisionMin = 50; settings.parameters.precisionMax = 50;
    let state = createDifficultyRuntime(createDifficultySession(10));
    for (let tick = 0; tick < 60; tick++) {
      state = stepDifficulty({ ...world(), now: 10000 + tick * 16 }, settings, state);
      expect(state.keys.arrowLeft && state.keys.arrowRight).toBe(false);
      for (const pending of state.inputs) expect(pending.readyAt - state.activeTime).toBeLessThanOrEqual(50);
    }
  });
  it('generates bounded traits per session, preserves manual values and resets round queues', () => {
    const session = createDifficultySession(731);
    const settings = createAISettings(); settings.traits.aggression = { automatic: false, value: 1.9 };
    expect(resolveTraits(settings, session).aggression).toBe(1.9);
    expect(resolveTraits(settings, session).skill).toBe(session.automaticTraits.skill);
    expect(createDifficultySession(731)).toEqual(session);
    for (let seed = 0; seed < 100; seed++) for (const value of Object.values(createDifficultySession(seed).automaticTraits)) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(2); }
    const running = stepDifficulty(world(), settings, createDifficultyRuntime(session));
    const reset = createDifficultyRuntime(running.session);
    expect(reset.observations).toEqual([]); expect(reset.inputs).toEqual([]); expect(reset.session.automaticTraits).toEqual(session.automaticTraits);
  });
  it.each(Object.keys(CHARACTERS) as CharacterType[])('perfect neutral %s keeps existing decisions on every map', character => {
    for (const map of Object.keys(MAPS) as MapId[]) {
      const w = world(character, map);
      w.projectiles = [projectile()]; w.hazardZones = [trap()];
      w.vineShields = [{ id: 'dead', x: 300, y: 0, width: 30, height: 400, createdAt: 9000, duration: 12000, hp: 0, destroyedAt: 9500 }];
      const legacy = decideAI(prepareAIFrame(w), w.players[1], createOpponentModel());
      const settings = neutral(createAISettings('perfect'));
      const runtime = stepDifficulty(w, settings, createDifficultyRuntime(createDifficultySession(731)));
      expect(runtime.keys).toEqual(legacy.keys);
      expect(runtime.memory).toEqual(legacy.memory);
      expect(resolveTraits(settings, runtime.session)).toEqual(NEUTRAL_AI_TRAITS);
    }
  });
});
