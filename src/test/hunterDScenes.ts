import { cpuScene } from './aiCpuScenes';
import { CHARACTERS, createInitialPlayer, PLAYER_SIZE } from '@/types/game';
import { createProjectile } from '@/types/projectile';
import type { AIWorld } from '@/hooks/ai/world';

/** Fixed public observations only; no game engine or simulated matches. */
export function hunterDScenes(): { id: string; world: AIWorld }[] {
  const scene = (distance = 180, cooldown = 0, focus = 0) => {
    const world = cpuScene(0, 'hunter', 'wasteland');
    Object.assign(world.players[1], { mana: 0, skillCooldownRemaining: 2000,
      attackCooldownRemaining: cooldown, hunterFocusedDuration: focus });
    world.players = [{ ...createInitialPlayer(1, CHARACTERS.hunter), x: 200 + distance, y: 440,
      facingRight: false, mana: 0, skillCooldownRemaining: 2000 }, world.players[1]];
    return world;
  };
  const scenes: { id: string; world: AIWorld }[] = [];
  for (const distance of [140, 180, 240]) for (const cooldown of [0, 800, 16]) for (const focus of [0, 5000])
    scenes.push({ id: `distance-${distance}/cooldown-${cooldown}/focus-${focus}`, world: scene(distance, cooldown, focus) });
  const chase = scene(180, 800); chase.players[0].velocityX = -220;
  scenes.push({ id: 'observed-chase', world: chase });
  const projectile = scene(180, 800);
  projectile.projectiles = [createProjectile('bullet', 1, 270, 460, -1250, 0, 18, { now: projectile.now, random: () => .5 })];
  scenes.push({ id: 'visible-pellet-dodge', world: projectile });
  const jungle = scene(180); jungle.mapId = 'jungle';
  jungle.vineShields = [{ id: 'diagnostic-vine', x: 280, y: 390, width: 20, height: 90, hp: 1, createdAt: jungle.now, duration: 10000 }];
  scenes.push({ id: 'jungle-vine', world: jungle });
  const volcano = cpuScene(0, 'hunter', 'volcano');
  const platform = volcano.platforms.find(p => p.id !== 'ground' && p.width >= 180)!;
  Object.assign(volcano.players[1], { x: platform.x + 10, y: platform.y - PLAYER_SIZE - 50,
    velocityY: 180, isGrounded: false, isJumping: true, mana: 0, attackCooldownRemaining: 800 });
  volcano.players = [{ ...createInitialPlayer(1, CHARACTERS.hunter), x: platform.x + platform.width - PLAYER_SIZE,
    y: platform.y - PLAYER_SIZE, facingRight: false, mana: 0 }, volcano.players[1]];
  scenes.push({ id: 'volcano-falling-to-platform', world: volcano });
  const low = scene(180, 800); low.players[1].health = 20;
  scenes.push({ id: 'low-health', world: low });
  const wall = scene(180, 800); wall.players[1].x = 15; wall.players[0].x = 195;
  scenes.push({ id: 'wall-pressure', world: wall });
  return scenes;
}
