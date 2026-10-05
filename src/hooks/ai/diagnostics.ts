/** Opt-in local evaluation counters; absent during ordinary gameplay. */
export interface CombatDiagnostics {
  attempts: [number, number];
  hits: [number, number];
  directDamage: [number, number];
  environmentDamage: [number, number];
  seenIds: string[];
  hitIds: string[];
  ticks: number;
}
export const createCombatDiagnostics = (): CombatDiagnostics => ({
  attempts: [0, 0], hits: [0, 0], directDamage: [0, 0], environmentDamage: [0, 0], seenIds: [], hitIds: [], ticks: 0,
});
export function nextCombatDiagnostics(previous?: CombatDiagnostics): CombatDiagnostics | undefined {
  return previous && { ...previous, attempts: [...previous.attempts], hits: [...previous.hits],
    directDamage: [...previous.directDamage], environmentDamage: [...previous.environmentDamage], hitIds: [...previous.hitIds], ticks: previous.ticks + 1 };
}
export function recordHit(metrics: CombatDiagnostics | undefined, id: string, ownerId: 1 | 2, damage: number) {
  if (!metrics || damage <= 0) return;
  metrics.directDamage[ownerId - 1] += damage;
  const key = `${ownerId}:${id}`;
  if (!metrics.hitIds.includes(key)) { metrics.hits[ownerId - 1]++; metrics.hitIds.push(key); }
}
