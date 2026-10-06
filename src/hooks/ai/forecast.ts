import type { AIForecast, AIForecasts } from '@/types/ai';

export interface ForecastError { x: number; y: number; time: number }
export const LEGACY_FORECASTS: AIForecasts = {
  opponent: { horizonMs: 800, positionError: 0, timingErrorMs: 0 },
  projectiles: { horizonMs: 800, positionError: 0, timingErrorMs: 0 },
  environment: { horizonMs: 800, positionError: 0, timingErrorMs: 0 },
};
export function sampleForecastError(config: AIForecast, random: () => number): ForecastError {
  const draw = (max: number) => max > 0 && config.horizonMs > 0 ? (random() * 2 - 1) * max : 0;
  return { x: draw(config.positionError), y: draw(config.positionError), time: draw(config.timingErrorMs) / 1000 };
}
export const forecastRatio = (config: AIForecast, seconds: number) => config.horizonMs > 0 ? Math.min(1, Math.max(0, seconds * 1000 / config.horizonMs)) : 0;
export function forecastTime(config: AIForecast, error: ForecastError, seconds: number): number {
  return Math.max(0, Math.min(config.horizonMs / 1000, seconds + error.time * forecastRatio(config, seconds)));
}
export function forecastPoint<T extends { x: number; y: number }>(point: T, config: AIForecast, error: ForecastError, seconds: number): T {
  const ratio = forecastRatio(config, seconds);
  return { ...point, x: point.x + error.x * ratio, y: point.y + error.y * ratio };
}
