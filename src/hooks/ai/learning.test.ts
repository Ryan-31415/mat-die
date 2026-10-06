import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { fallStep, playerMoveSpeed } from '@/types/combatPhysics';
import { JUMP_FORCE } from '@/types/platform';
import { createOpponentModel, observeOpponent, predictOpponent, resetObservation } from './learning';

const makePlayer = () => ({ ...createInitialPlayer(1, CHARACTERS.mage), x: 200, y: 440 });
const observer = { ...createInitialPlayer(2, CHARACTERS.gladiator), x: 650, y: 440 };

describe('in-session opponent learning', () => {
  it('reduces position error for ordinary movement whose engine velocityX is zero', () => {
    let model = createOpponentModel();
    const player = makePlayer();
    for (let i = 0; i <= 40; i++) { player.x = 200 + i * 3; model = observeOpponent(model, player, observer, 1000 + i * 20); }
    const learned = predictOpponent(model, player, 0.3, MAPS.wasteland.platforms, 1800);
    const cold = predictOpponent(createOpponentModel(), player, 0.3, MAPS.wasteland.platforms, 1800);
    const actualX = player.x + 150 * 0.3;
    expect(Math.abs(learned.x - actualX)).toBeLessThan(2);
    expect(Math.abs(learned.x - actualX)).toBeLessThan(Math.abs(cold.x - actualX));
    expect(player.velocityX).toBe(0);
  });
  it('adapts to a reversal instead of continuing to predict the old direction', () => {
    let model = createOpponentModel(); const player = makePlayer();
    for (let i = 0; i < 40; i++) { player.x += 3; model = observeOpponent(model, player, observer, 1000 + i * 20); }
    for (let i = 40; i < 50; i++) { player.x -= 3; model = observeOpponent(model, player, observer, 1000 + i * 20); }
    expect(predictOpponent(model, player, 0.2, MAPS.wasteland.platforms, 1980).x).toBeLessThan(player.x - 25);
  });
  it('learns a repeated turning interval and anticipates the next turn', () => {
    let model = createOpponentModel(); const player = makePlayer();
    for (let i = 0; i <= 194; i++) {
      const phase = i % 40;
      player.x = 300 + (phase <= 20 ? phase : 40 - phase) * 2;
      model = observeOpponent(model, player, observer, 1000 + i * 20);
    }
    const prediction = predictOpponent(model, player, 0.3, MAPS.wasteland.platforms, 4880);
    const actual = 300 + 9 * 2;
    const linear = player.x + model.velocityX * 0.3;
    expect(model.turnCount).toBeGreaterThan(3);
    expect(Math.abs(prediction.x - actual)).toBeLessThan(Math.abs(linear - actual));
  });
  it('ignores teleports, knockback, disabled movement and discontinuous clocks', () => {
    let model = observeOpponent(createOpponentModel(), makePlayer(), observer, 1000);
    const player = { ...makePlayer(), x: 650 };
    model = observeOpponent(model, player, observer, 1017);
    expect(model.velocityX).toBe(0);
    model = observeOpponent(model, { ...player, x: 640, isStunned: true }, observer, 1034);
    expect(model.samples).toHaveLength(0);
    model = observeOpponent(model, { ...player, x: 600 }, observer, 8000);
    expect(model.velocityX).toBe(0);
  });
  it('learns regular jumps and predicts the next launch better than a cold model', () => {
    let model = createOpponentModel(); const player = makePlayer();
    for (let i = 0; i <= 345; i++) {
      if (i % 60 === 0 && player.isGrounded) { player.velocityY = JUMP_FORCE; player.isGrounded = false; }
      if (!player.isGrounded) {
        const next = fallStep(player, player.velocityY, 0.02, MAPS.wasteland.platforms);
        player.y = next.y; player.velocityY = next.vy; player.isGrounded = next.vy === 0;
      }
      model = observeOpponent(model, player, observer, 1000 + i * 20);
    }
    expect(model.jumpCadenceCount).toBeGreaterThan(3);
    const learned = predictOpponent(model, player, 0.5, MAPS.wasteland.platforms, 7900);
    const cold = predictOpponent(createOpponentModel(), player, 0.5, MAPS.wasteland.platforms, 7900);
    let actualY = player.y, vy = 0;
    for (let i = 1; i <= 25; i++) {
      if (i === 15) vy = JUMP_FORCE;
      if (vy !== 0) { const next = fallStep({ x: player.x, y: actualY }, vy, 0.02, MAPS.wasteland.platforms); actualY = next.y; vy = next.vy; }
    }
    expect(Math.abs(learned.y - actualY)).toBeLessThan(15);
    expect(Math.abs(learned.y - actualY)).toBeLessThan(Math.abs(cold.y - actualY));
  });
  it('does not count the same frame again for another controller', () => {
    const player = makePlayer();
    const model = observeOpponent(createOpponentModel(), player, observer, 1000);
    expect(observeOpponent(model, player, observer, 1000)).toBe(model);
  });
  it('predicts a learned retreat after an attack more accurately than an untrained model', () => {
    let model = createOpponentModel(); const player = makePlayer();
    for (let i = 0; i < 180; i++) {
      const phase = i % 30;
      if (phase >= 10 && phase < 20) player.x -= 2;
      model = observeOpponent(model, player, { ...observer,
        attackCooldownRemaining: Math.max(0, 600 - phase * 20) }, 1000 + i * 20);
    }
    expect(model.reactionCount).toBeGreaterThan(3);
    expect(model.reactionAway / model.reactionCount).toBeGreaterThan(0.9);
    model = resetObservation(model);
    for (let i = 0; i <= 20; i++) model = observeOpponent(model, player, observer, 6000 + i * 20);
    const actualX = player.x - playerMoveSpeed(player, 6400) * 0.2;
    const learned = predictOpponent(model, player, 0.4, MAPS.wasteland.platforms, 6400, true);
    const cold = predictOpponent(createOpponentModel(), player, 0.4, MAPS.wasteland.platforms, 6400, true);
    expect(Math.abs(learned.x - actualX)).toBeLessThan(Math.abs(cold.x - actualX));
  });
  it('bounds history, preserves input state and separates round continuity from tendencies', () => {
    let model = createOpponentModel(); const player = makePlayer();
    const initial = JSON.stringify(model);
    const original = model;
    for (let i = 0; i < 2000; i++) { player.x = 300 + Math.sin(i / 25) * 40; model = observeOpponent(model, player, observer, 1000 + i * 17); }
    expect(JSON.stringify(original)).toBe(initial);
    expect(model.samples.length).toBeLessThanOrEqual(160);
    expect(model.samples.every(s => model.last!.time - s.time <= 8000)).toBe(true);
    const reset = resetObservation(model);
    expect(reset.last).toBeUndefined(); expect(reset.samples).toHaveLength(0);
    expect(reset.transitions).toEqual(model.transitions); expect(reset.turnCount).toBe(model.turnCount);
  });
  it('records attack cadence and jumps in reaction to incoming attacks', () => {
    let model = createOpponentModel(); const player = makePlayer();
    for (let i = 0; i < 240; i++) {
      const phase = i % 40;
      player.attackCooldownRemaining = phase === 0 ? 800 : Math.max(0, 800 - phase * 20);
      player.isGrounded = phase < 5 || phase > 20;
      player.velocityY = player.isGrounded ? 0 : -500;
      model = observeOpponent(model, player, { ...observer, attackCooldownRemaining: player.attackCooldownRemaining }, 1000 + i * 20);
    }
    expect(model.attackInterval).toBeCloseTo(800, 0);
    expect(model.reactionCount).toBeGreaterThan(3);
    expect(model.reactionJump / model.reactionCount).toBeGreaterThan(0.9);
    model = resetObservation(model);
    player.isGrounded = true; player.velocityY = 0;
    for (let i = 0; i <= 20; i++) model = observeOpponent(model, player, observer, 6000 + i * 20);
    const learned = predictOpponent(model, player, 0.35, MAPS.wasteland.platforms, 6400, true);
    const cold = predictOpponent(createOpponentModel(), player, 0.35, MAPS.wasteland.platforms, 6400, true);
    let actualY = player.y, vy = JUMP_FORCE;
    for (let i = 0; i < 10; i++) { const next = fallStep({ x: player.x, y: actualY }, vy, 1 / 60, MAPS.wasteland.platforms); actualY = next.y; vy = next.vy; }
    expect(Math.abs(learned.y - actualY)).toBeLessThan(Math.abs(cold.y - actualY));
  });
});

describe('configurable learning retention', () => {
  it('prunes memory independently of sampling and respects the 600 sample ceiling', () => {
    const p = { ...createInitialPlayer(1, CHARACTERS.archer), x: 200, y: 440 };
    const observer = createInitialPlayer(2, CHARACTERS.mage);
    const options = { memoryMs: 30000, sampleIntervalMs: 50, halfLifeMs: 10000 };
    let model = createOpponentModel();
    for (let now = 0; now <= 30100; now += 50) model = observeOpponent(model, p, observer, now, options);
    expect(model.samples).toHaveLength(600);
    model = observeOpponent(model, p, observer, 30150, { ...options, memoryMs: 1000, sampleIntervalMs: 1000 });
    expect(model.samples.every(s => 30150 - s.time <= 1000)).toBe(true);
  });
  it('changes statistical decay and collection frequency without changing the default caller', () => {
    const p = { ...createInitialPlayer(1, CHARACTERS.archer), x: 200, y: 440 };
    const observer = createInitialPlayer(2, CHARACTERS.mage);
    const model = observeOpponent(createOpponentModel(), p, observer, 0);
    model.attackCount = 8;
    const quick = observeOpponent(model, p, observer, 100, { memoryMs: 8000, sampleIntervalMs: 1000, halfLifeMs: 1000 });
    const slow = observeOpponent(model, p, observer, 100, { memoryMs: 8000, sampleIntervalMs: 50, halfLifeMs: 30000 });
    expect(quick.attackCount).toBeCloseTo(8 * 0.5 ** 0.1);
    expect(slow.attackCount).toBeGreaterThan(quick.attackCount);
    const quick2 = observeOpponent(quick, p, observer, 200, { memoryMs: 8000, sampleIntervalMs: 1000, halfLifeMs: 1000 });
    const slow2 = observeOpponent(slow, p, observer, 200, { memoryMs: 8000, sampleIntervalMs: 50, halfLifeMs: 30000 });
    expect(quick2.samples).toHaveLength(1); expect(slow2.samples).toHaveLength(2);
  });
});
