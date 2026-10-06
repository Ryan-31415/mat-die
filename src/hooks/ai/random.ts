/** A caller-owned generator: replaying a React updater never consumes global randomness. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return {
    next: () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + 0.5) / 4294967296; },
    state: () => state,
  };
}
export function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) * Math.cos(2 * Math.PI * random());
}
