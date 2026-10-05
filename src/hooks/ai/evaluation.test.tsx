import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { setImmediate as yieldToRunner } from 'node:timers/promises';
import { CHARACTERS, type CharacterType } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { createAIMemory } from './state';
import { overlapsPlayer, type AIFrame, type AIWorld } from './world';
import type { getAIKeys } from '../gameAI';

const switcher = vi.hoisted(() => ({ baseline: false, legacy: undefined as typeof getAIKeys | undefined }));
vi.mock('../gameAI', async importOriginal => {
  const actual = await importOriginal<typeof import('../gameAI')>();
  return { ...actual,
    prepareAIFrame: (world: AIWorld) => switcher.baseline ? { world } : actual.prepareAIFrame(world),
    decideAI: (...args: Parameters<typeof actual.decideAI>) => {
      if (!switcher.baseline) return actual.decideAI(...args);
      const [frame, player] = args;
      const w = (frame as AIFrame).world;
      return { keys: switcher.legacy!(player, w.players[player.id === 1 ? 1 : 0], [...w.projectiles], [...w.hazardZones], [...w.platforms], w.isOvertime, w.now, w.mapId, [...w.lightningStrikes]), memory: createAIMemory(player, w.now), risk: 0 };
    },
  };
});

interface Result {
  version: string; character: CharacterType; map: MapId; pattern: string; seed: number;
  winner: 1 | 2 | 'draw' | null; seconds: number; dealt: number; received: number;
  attempts: number; hits: number; environmentDamage: number; longestStallSeconds: number;
  meanTickMs: number; p95TickMs: number;
}

// Deliberately opt-in: this compares hundreds of full games, not the normal fast suite.
describe.skipIf(process.env.RUN_AI_EVALUATION !== '1')('seeded before/after combat evaluation', () => {
  it('compares the original controller with the current controller in the same engine', async () => {
    const baselinePath = process.env.AI_BASELINE_PATH ?? 'scripts/fixtures/gameAI-baseline.ts';
    const baselineSha256 = createHash('sha256').update(readFileSync(baselinePath)).digest('hex');
    const bundle = execFileSync(process.execPath, ['scripts/compile-ai-baseline.mjs', baselinePath], { encoding: 'utf8' });
    const module = { exports: {} as { getAIKeys: typeof getAIKeys } };
    new Function('module', 'exports', 'require', bundle)(module, module.exports, createRequire(import.meta.url));
    switcher.legacy = module.exports.getAIKeys;
    vi.useFakeTimers();
    const results: Result[] = [];
    const seeds = [731, 1907];
    const characters = (process.env.AI_EVAL_CHARACTERS?.split(',') ?? Object.keys(CHARACTERS)) as CharacterType[];
    const maps = (process.env.AI_EVAL_MAPS?.split(',') ?? Object.keys(MAPS)) as MapId[];
    const random = vi.spyOn(Math, 'random');
    const logger = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      for (const version of ['baseline', 'current']) for (const character of characters) for (const map of maps) for (const pattern of ['strafe', 'jump', 'rush']) for (const seed of seeds) {
        switcher.baseline = version === 'baseline';
        let rng = seed;
        random.mockImplementation(() => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; });
        const start = 1791158400000;
        vi.setSystemTime(start);
        const enemy = pattern === 'rush' ? 'gladiator' : pattern === 'jump' ? 'ninja' : 'archer';
        const game = renderHook(() => useGameEngine(CHARACTERS[enemy], CHARACTERS[character], 30, vi.fn(), 'single', false, 1, map, undefined, true));
        const keys = { current: emptyAIKeys() };
        act(() => game.result.current.setKeysRef(keys));
        let lastProgress = start, longestStall = 0;
        let anchor = { x: game.result.current.gameState.players[1].x, y: game.result.current.gameState.players[1].y };
        const samples: number[] = [];
        for (let tick = 0; tick < 1900 && game.result.current.gameState.isRoundActive; tick++) {
          const state = game.result.current.gameState, [human, ai] = state.players;
          const elapsed = Date.now() - start;
          const toward = ai.x > human.x ? 1 : -1;
          let direction = pattern === 'rush' ? toward : Math.floor(elapsed / 1300) % 2 ? -1 : 1;
          if (human.x < 45) direction = 1;
          if (human.x > 715) direction = -1;
          keys.current.a = direction < 0; keys.current.d = direction > 0;
          keys.current.w = pattern === 'jump' ? elapsed % 750 < 80 : map === 'volcano' && human.isGrounded && elapsed % 900 < 80;
          keys.current.f = true;
          keys.current.g = pattern === 'strafe' || (pattern === 'rush' && Math.abs(ai.x - human.x) < 140 && elapsed % 1300 < 450);
          keys.current.h = true;
          const before = performance.now();
          act(() => { vi.advanceTimersByTime(17); });
          if (tick > 30) samples.push(performance.now() - before);
          const moved = game.result.current.gameState.players[1];
          const disabled = moved.isStunned || moved.isFrozen || moved.rootDuration > 0;
          const waitingToRecover = game.result.current.gameState.aiState.controllers.player2?.strategy === 'recover' &&
            game.result.current.gameState.soulZones.some(zone => Date.now() - zone.createdAt < zone.duration && overlapsPlayer(moved, zone));
          const purposefullyStill = waitingToRecover || (Math.abs(human.y - moved.y) < 40 && Math.abs(human.x - moved.x) < CHARACTERS[character].attackRange);
          if (disabled || purposefullyStill || Math.hypot(moved.x - anchor.x, moved.y - anchor.y) > 40) {
            anchor = { x: moved.x, y: moved.y }; lastProgress = Date.now();
          }
          longestStall = Math.max(longestStall, Date.now() - lastProgress);
        }
        const final = game.result.current.gameState, metrics = final.diagnostics!;
        samples.sort((a, b) => a - b);
        results.push({ version, character, map, pattern, seed, winner: final.roundWinner,
          seconds: (Date.now() - start) / 1000, dealt: metrics.directDamage[1], received: metrics.directDamage[0],
          attempts: metrics.attempts[1], hits: metrics.hits[1], environmentDamage: metrics.environmentDamage[1],
          longestStallSeconds: longestStall / 1000, meanTickMs: samples.reduce((a, b) => a + b, 0) / samples.length,
          p95TickMs: samples[Math.floor(samples.length * 0.95)] ?? 0 });
        game.unmount(); vi.clearAllTimers();
        // Let Vitest deliver worker updates during the long comparison run.
        await yieldToRunner();
        if (results.length % 30 === 0) process.stdout.write(`Evaluated ${results.length} games\n`);
      }
    } finally { logger.mockRestore(); random.mockRestore(); vi.useRealTimers(); switcher.baseline = false; }
    const summaries = ['baseline', 'current'].map(version => {
      const runs = results.filter(r => r.version === version);
      const sum = (key: 'dealt' | 'received' | 'attempts' | 'hits' | 'environmentDamage') => runs.reduce((total, row) => total + row[key], 0);
      return { version, games: runs.length, wins: runs.filter(r => r.winner === 2).length,
        winRate: runs.filter(r => r.winner === 2).length / runs.length, hitRate: sum('hits') / sum('attempts'),
        directDamageDealt: sum('dealt'), directDamageReceived: sum('received'), environmentDamage: sum('environmentDamage'),
        stallsOverThreeSeconds: runs.filter(r => r.longestStallSeconds > 3).length,
        meanTickMs: runs.reduce((total, row) => total + row.meanTickMs, 0) / runs.length,
        worstScenarioP95TickMs: Math.max(...runs.map(r => r.p95TickMs)) };
    });
    mkdirSync('docs', { recursive: true });
    writeFileSync('docs/ai-combat-evaluation.json', JSON.stringify({
      measuredAt: new Date().toISOString(), baselineSha256, seeds, maxRoundSeconds: 30,
      methodology: 'Same current engine and character balance; only controller changes. Hit rate is unique damaging projectile/melee hitboxes divided by emitted projectile/melee hitboxes. Direct damage excludes damage-over-time and zones. Environment damage counts sandstorm, lightning and lava direct hits. Stall measurement excludes immobilization, intentional attack-range waiting and recovery in an active soul zone. Tick timings include React hook updates; no browser rendering.',
      summaries, results,
    }, null, 2) + '\n');
    process.stdout.write(JSON.stringify(summaries, null, 2) + '\n');
    expect(results.length).toBe(characters.length * maps.length * 3 * seeds.length * 2);
    expect(results.every(r => Number.isFinite(r.meanTickMs) && r.winner !== null)).toBe(true);
  }, 900000);
});
