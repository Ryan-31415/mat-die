import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { loadFrozenAI } from '@/test/aiBaseline';
import { hunterDScenes } from '@/test/hunterDScenes';
import { cpuScene } from '@/test/aiCpuScenes';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { prepareAIFrame } from './world';
import { decideAI, type PositionDecision } from './controller';

const aPath = 'docs/ai-runs/stage3-current-rules-combat-001/baseline.cjs';
const cPath = 'docs/ai-runs/stage3-hunter-diagnosis-001/candidate-c.cjs';
describe.skipIf(!existsSync(aPath) || !existsSync(cPath))('Hunter D fixed-observation separation from A', () => {
  it.each(hunterDScenes())('$id: retains A movement scores, goal and selected movement', ({ world }) => {
    const a = loadFrozenAI(aPath).api;
    let old: PositionDecision | undefined, next: PositionDecision | undefined;
    const prior = structuredClone(world);
    const before = a.decideAI(a.prepareAIFrame(world), world.players[1], undefined, undefined, undefined, d => { old = d; });
    const after = decideAI(prepareAIFrame(world), world.players[1], undefined, undefined, undefined, d => { next = d; });
    expect(next?.goal).toEqual(old?.goal);
    expect(next?.strategy).toEqual(old?.strategy);
    expect(next?.movementCandidates).toEqual(old?.movementCandidates);
    expect(next?.executed.action).toEqual(old?.executed.action);
    expect(after.risk).toEqual(before.risk);
    expect(after.memory.movement).toEqual(before.memory.movement);
    expect(next?.rangedWork?.scatterCalls ?? 0).toBeLessThanOrEqual(1);
    expect(world).toEqual(prior);
  });
  it.each([{ distance: 300, height: 0, oldAttack: true }, { distance: 240, height: -40, oldAttack: false }])(
    'keeps C shot admission at distance $distance, height $height, while moving like A', ({ distance, height, oldAttack }) => {
      const a = loadFrozenAI(aPath).api, c = loadFrozenAI(cPath).api;
      const world = cpuScene(0, 'hunter', 'wasteland');
      Object.assign(world.players[1], { mana: 0, skillCooldownRemaining: 2000, y: 440 + height,
        isGrounded: height === 0, isJumping: height !== 0 });
      world.players = [{ ...createInitialPlayer(1, CHARACTERS.hunter), x: 200 + distance, y: 440,
        facingRight: false, mana: 0, skillCooldownRemaining: 2000 }, world.players[1]];
      const old = a.decideAI(a.prepareAIFrame(world), world.players[1]);
      const shotPolicy = c.decideAI(c.prepareAIFrame(world), world.players[1]);
      const next = decideAI(prepareAIFrame(world), world.players[1]);
      expect(old.keys.shift).toBe(oldAttack);
      expect(next.keys.shift).toBe(true); expect(next.keys.shift).toBe(shotPolicy.keys.shift);
      expect([next.keys.arrowLeft, next.keys.arrowRight, next.keys.arrowUp, next.keys.arrowDown])
        .toEqual([old.keys.arrowLeft, old.keys.arrowRight, old.keys.arrowUp, old.keys.arrowDown]);
    });
});
