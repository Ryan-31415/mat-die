import type { AIEstimation } from '@/types/ai';

/** Quantization follows the bounded error; exact information never consumes randomness. */
export function estimateNumber(value: number, config: AIEstimation, random: () => number, scale = 1, signed = false): number {
  if (config.mode !== 'estimated') return value;
  const noisy = value * (1 + (config.errorPercent > 0 && value !== 0 ? (random() * 2 - 1) * config.errorPercent / 100 : 0));
  const step = config.rounding * scale;
  const result = step > 0 ? Math.round(noisy / step) * step : noisy;
  return signed ? result : Math.max(0, result);
}
