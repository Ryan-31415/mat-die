import { describe, expect, it } from 'vitest';
import { cpuScene } from '@/test/aiCpuScenes';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createProjectile } from '@/types/projectile';
import { selectGoal } from './navigation';
import { prepareAIFrame } from './world';
import { decideAI, type PositionDecision } from './controller';

function scene(cooldown = 800, focused = 0, mirrored = false) {
  const world = cpuScene(0, 'hunter', 'wasteland');
  const self = world.players[1];
  Object.assign(self, { x: mirrored ? 560 : 200, facingRight: !mirrored,
    attackCooldownRemaining: cooldown, hunterFocusedDuration: focused, mana: 0, skillCooldownRemaining: 2000 });
  world.players = [{ ...createInitialPlayer(1, CHARACTERS.hunter), x: self.x + (mirrored ? -180 : 180),
    y: 440, facingRight: mirrored, mana: 0, skillCooldownRemaining: 2000 }, self];
  return world;
}

describe('Hunter restored spacing and avoidance, without combat simulation', () => {
  it.each([false, true])('does not close a 180px gap for an unavailable volley (mirrored=%s)', mirrored => {
    const world = scene(800, 0, mirrored), before = structuredClone(world);
    let diagnostic: PositionDecision | undefined;
    const decision = decideAI(prepareAIFrame(world), world.players[1], undefined, undefined, undefined, d => { diagnostic = d; });
    expect(diagnostic?.goal.x).toBe(world.players[1].x);
    expect(decision.keys.arrowLeft).toBe(false); expect(decision.keys.arrowRight).toBe(false);
    expect(decision.keys.shift).toBe(false); expect(world).toEqual(before);
  });
  it('keeps legacy near-ready spacing and admits a focused volley at its goal distance', () => {
    for (const cooldown of [0, 16]) {
      const world = scene(cooldown);
      expect(selectGoal(world.players[1], world.players[0], prepareAIFrame(world)).preferred).toBe(180);
    }
    const world = scene(0, 5000);
    world.players[0].x = world.players[1].x + 240;
    const decision = decideAI(prepareAIFrame(world), world.players[1]);
    expect(decision.keys.shift).toBe(true);
    expect(selectGoal(world.players[1], world.players[0], prepareAIFrame(world)).preferred).toBe(240);
  });
  it('keeps larger focused, low-health and enemy-focus spacing', () => {
    const world = scene(800, 5000), self = world.players[1], enemy = world.players[0];
    expect(selectGoal(self, enemy, prepareAIFrame(world)).preferred).toBe(240);
    self.hunterFocusedDuration = 0; self.health = 20;
    expect(selectGoal(self, enemy, prepareAIFrame(world)).preferred).toBeGreaterThanOrEqual(330);
    self.health = self.maxHealth; enemy.hunterFocusedDuration = 3000;
    expect(selectGoal(self, enemy, prepareAIFrame(world)).preferred).toBe(375);
  });
  it('does not apply the reload floor when character knowledge is disabled', () => {
    const world = scene();
    expect(selectGoal(world.players[1], world.players[0], prepareAIFrame(world), undefined, 0).preferred).toBe(270);
  });
  it('still escapes a visible incoming pellet instead of holding the spacing floor', () => {
    const world = scene();
    world.projectiles = [createProjectile('bullet', 1, 270, 460, -1250, 0, 18, { now: world.now, random: () => .5 })];
    let diagnostic: PositionDecision | undefined;
    const decision = decideAI(prepareAIFrame(world), world.players[1], undefined, undefined, undefined, d => { diagnostic = d; });
    const stationary = diagnostic?.movementCandidates.find(c => !c.action.direction && !c.action.jump && !c.action.drop);
    expect(stationary?.risk).toBeGreaterThan(0);
    expect(decision.risk).toBeLessThan(stationary!.risk);
    expect(decision.keys.arrowUp).toBe(true);
  });
});
