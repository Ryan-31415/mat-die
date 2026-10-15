import type { CharacterType } from '@/types/game';

interface Point { x: number; y: number }
export interface WeaponDefinition {
  viewBox: string;
  width: number;
  height: number;
  grip: Point;
  tip: Point;
  muzzle?: Point;
  hand: Point;
  idleAngle: number;
  strikeAngle: number;
  sweepMs: number;
  activeMs: number;
  durationMs: number;
  color: string;
}

// Pixel coordinates at actual game scale; no CSS scaling or body-size changes.
export const WEAPONS: Record<CharacterType, WeaponDefinition> = {
  gladiator: { viewBox: '0 0 78 18', width: 78, height: 18, grip: { x: 10, y: 9 }, tip: { x: 76, y: 9 }, hand: { x: 31, y: 25 }, idleAngle: -65, strikeAngle: 18, sweepMs: 60, activeMs: 285, durationMs: 380, color: '#fcd34d' },
  ninja: { viewBox: '0 0 78 14', width: 78, height: 14, grip: { x: 10, y: 9 }, tip: { x: 76, y: 3 }, hand: { x: 31, y: 27 }, idleAngle: -32, strikeAngle: 18, sweepMs: 35, activeMs: 205, durationMs: 270, color: '#e2e8f0' },
  reaper: { viewBox: '0 0 85 62', width: 68, height: 49.6, grip: { x: 9.6, y: 33.6 }, tip: { x: 65.6, y: 41.6 }, hand: { x: 29, y: 32 }, idleAngle: -32, strikeAngle: 12, sweepMs: 80, activeMs: 320, durationMs: 420, color: '#a5b4fc' },
  archer: { viewBox: '0 0 44 48', width: 44, height: 48, grip: { x: 31, y: 24 }, tip: { x: 26, y: 3 }, muzzle: { x: 24, y: 24 }, hand: { x: 40, y: 25 }, idleAngle: 0, strikeAngle: 0, sweepMs: 35, activeMs: 60, durationMs: 180, color: '#fcd34d' },
  mage: { viewBox: '0 0 42 48', width: 42, height: 48, grip: { x: 14, y: 32 }, tip: { x: 25, y: 10 }, muzzle: { x: 25, y: 10 }, hand: { x: 36, y: 36 }, idleAngle: 0, strikeAngle: -6, sweepMs: 30, activeMs: 70, durationMs: 180, color: '#fb923c' },
  scientist: { viewBox: '0 0 24 30', width: 24, height: 30, grip: { x: 12, y: 10 }, tip: { x: 12, y: 2 }, muzzle: { x: 12, y: 20 }, hand: { x: 40, y: 29 }, idleAngle: 12, strikeAngle: -65, sweepMs: 45, activeMs: 60, durationMs: 200, color: '#86efac' },
  hunter: { viewBox: '0 0 49 22', width: 49, height: 22, grip: { x: 23, y: 15 }, tip: { x: 47, y: 7 }, muzzle: { x: 47, y: 7 }, hand: { x: 32, y: 29 }, idleAngle: 0, strikeAngle: -5, sweepMs: 30, activeMs: 50, durationMs: 170, color: '#fde68a' },
  'ice-mage': { viewBox: '0 0 42 48', width: 42, height: 48, grip: { x: 14, y: 32 }, tip: { x: 25, y: 10 }, muzzle: { x: 25, y: 10 }, hand: { x: 36, y: 36 }, idleAngle: 0, strikeAngle: -6, sweepMs: 30, activeMs: 70, durationMs: 180, color: '#a5f3fc' },
  hacker: { viewBox: '0 0 30 20', width: 30, height: 20, grip: { x: 10, y: 14 }, tip: { x: 28, y: 6 }, muzzle: { x: 28, y: 6 }, hand: { x: 36, y: 29 }, idleAngle: 0, strikeAngle: 0, sweepMs: 25, activeMs: 60, durationMs: 150, color: '#4ade80' },
  rocketeer: { viewBox: '0 0 58 26', width: 58, height: 26, grip: { x: 31, y: 21 }, tip: { x: 54, y: 11 }, muzzle: { x: 54, y: 11 }, hand: { x: 36, y: 35 }, idleAngle: 0, strikeAngle: -4, sweepMs: 40, activeMs: 65, durationMs: 210, color: '#fb923c' },
};
