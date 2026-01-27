// Platform Types

export interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'solid' | 'one-way'; // one-way can be jumped through from below
}

// Default platform configuration
export const PLATFORMS: Platform[] = [
  // Ground platform (solid floor)
  {
    id: 'ground',
    x: 0,
    y: 480, // ARENA.height - ARENA.padding
    width: 800,
    height: 20,
    type: 'solid',
  },
  // Left elevated platform
  {
    id: 'platform-left',
    x: 80,
    y: 350,
    width: 180,
    height: 15,
    type: 'one-way',
  },
  // Right elevated platform
  {
    id: 'platform-right',
    x: 540,
    y: 350,
    width: 180,
    height: 15,
    type: 'one-way',
  },
  // Center high platform
  {
    id: 'platform-center',
    x: 300,
    y: 250,
    width: 200,
    height: 15,
    type: 'one-way',
  },
  // Small floating platforms
  {
    id: 'platform-small-left',
    x: 150,
    y: 180,
    width: 100,
    height: 12,
    type: 'one-way',
  },
  {
    id: 'platform-small-right',
    x: 550,
    y: 180,
    width: 100,
    height: 12,
    type: 'one-way',
  },
];

// Physics constants
export const GRAVITY = 1000; // pixels per second squared (increased for heavier feel)
export const JUMP_FORCE = -447; // initial jump velocity (adjusted to maintain same jump height)
export const MAX_FALL_SPEED = 600; // terminal velocity
export const COYOTE_TIME = 100; // ms of grace period for jumping after leaving platform
