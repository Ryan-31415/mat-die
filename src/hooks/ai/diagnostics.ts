import type { Player } from '@/types/game';

export type CombatAction = 'attack' | 'skill' | 'ultimate' | 'defense';
export type DamageKind = 'direct' | 'zone' | 'burn' | 'poison' | 'environment' | 'self';
export interface DamageSource { kind: DamageKind; ownerId: 1 | 2 | null; entityId?: string; action?: CombatAction; actionId?: string; isClone?: boolean }
export interface ActionMetrics {
  uses: number; mana: number; damage: number; healing: number; blocked: number;
  emitted: number; hits: number; selfDamage: number; cloneDamage: number;
}
export interface MeleeGeometryMetrics {
  emitted: number; completed: number; contacts: number; misses: number;
  deflections: number; deflectionOnly: number;
}
const emptyAction = (): ActionMetrics => ({ uses: 0, mana: 0, damage: 0, healing: 0, blocked: 0,
  emitted: 0, hits: 0, selfDamage: 0, cloneDamage: 0 });
const emptyActions = (): Record<CombatAction, ActionMetrics> => ({
  attack: emptyAction(), skill: emptyAction(), ultimate: emptyAction(), defense: emptyAction(),
});
const copyActions = (actions: Record<CombatAction, ActionMetrics>): Record<CombatAction, ActionMetrics> => ({
  attack: { ...actions.attack }, skill: { ...actions.skill }, ultimate: { ...actions.ultimate }, defense: { ...actions.defense },
});
/** Opt-in local evaluation counters; absent during ordinary gameplay. */
export interface CombatDiagnostics {
  attempts: [number, number];
  hits: [number, number];
  directDamage: [number, number];
  environmentDamage: [number, number];
  seenIds: string[];
  hitIds: string[];
  ticks: number;
  effectiveDamage: [number, number];
  receivedDamage: [number, number];
  healing: [number, number];
  cloneDamage: [number, number];
  damageByKind: Record<DamageKind, [number, number]>;
  actions: [Record<CombatAction, ActionMetrics>, Record<CombatAction, ActionMetrics>];
  cloneActions: [Record<CombatAction, ActionMetrics>, Record<CombatAction, ActionMetrics>];
  entityActions: Record<string, CombatAction>;
  entityActionIds: Record<string, string>;
  entityClones: Record<string, boolean>;
  activeActionIds: Record<string, string>;
  actionHitIds: string[];
  blockedIds: string[];
  dotSources: Record<string, DamageSource>;
  poisonOwners: Record<string, 1 | 2>;
  meleeGeometry: [MeleeGeometryMetrics, MeleeGeometryMetrics];
  pendingMelee: Record<string, { ownerId: 1 | 2; contacted: boolean; deflected: boolean }>;
}
export const createCombatDiagnostics = (): CombatDiagnostics => ({
  attempts: [0, 0], hits: [0, 0], directDamage: [0, 0], environmentDamage: [0, 0], seenIds: [], hitIds: [], ticks: 0,
  effectiveDamage: [0, 0], receivedDamage: [0, 0], healing: [0, 0], cloneDamage: [0, 0],
  damageByKind: { direct: [0, 0], zone: [0, 0], burn: [0, 0], poison: [0, 0], environment: [0, 0], self: [0, 0] },
  actions: [emptyActions(), emptyActions()], cloneActions: [emptyActions(), emptyActions()],
  entityActions: {}, entityActionIds: {}, entityClones: {}, activeActionIds: {}, actionHitIds: [], blockedIds: [], dotSources: {}, poisonOwners: {},
  meleeGeometry: [{ emitted: 0, completed: 0, contacts: 0, misses: 0, deflections: 0, deflectionOnly: 0 },
    { emitted: 0, completed: 0, contacts: 0, misses: 0, deflections: 0, deflectionOnly: 0 }], pendingMelee: {},
});
export function nextCombatDiagnostics(previous?: CombatDiagnostics, advanceTick = true): CombatDiagnostics | undefined {
  return previous && { ...previous, attempts: [...previous.attempts], hits: [...previous.hits],
    directDamage: [...previous.directDamage], environmentDamage: [...previous.environmentDamage], hitIds: [...previous.hitIds], ticks: previous.ticks + (advanceTick ? 1 : 0),
    effectiveDamage: [...previous.effectiveDamage], receivedDamage: [...previous.receivedDamage], healing: [...previous.healing], cloneDamage: [...previous.cloneDamage],
    damageByKind: { direct: [...previous.damageByKind.direct], zone: [...previous.damageByKind.zone], burn: [...previous.damageByKind.burn],
      poison: [...previous.damageByKind.poison], environment: [...previous.damageByKind.environment], self: [...previous.damageByKind.self] },
    actions: [copyActions(previous.actions[0]), copyActions(previous.actions[1])],
    cloneActions: [copyActions(previous.cloneActions[0]), copyActions(previous.cloneActions[1])],
    entityActions: { ...previous.entityActions }, entityActionIds: { ...previous.entityActionIds }, entityClones: { ...previous.entityClones },
    activeActionIds: { ...previous.activeActionIds }, actionHitIds: [...previous.actionHitIds], blockedIds: [...previous.blockedIds], dotSources: { ...previous.dotSources },
    poisonOwners: { ...previous.poisonOwners }, meleeGeometry: [{ ...previous.meleeGeometry[0] }, { ...previous.meleeGeometry[1] }],
    pendingMelee: Object.fromEntries(Object.entries(previous.pendingMelee).map(([id, trial]) => [id, { ...trial }])) };
}

export function recordMeleeCreation(metrics: CombatDiagnostics | undefined, entity: { id: string; ownerId: 1 | 2 }) {
  if (!metrics || metrics.pendingMelee[entity.id]) return;
  metrics.meleeGeometry[entity.ownerId - 1].emitted++;
  metrics.pendingMelee[entity.id] = { ownerId: entity.ownerId, contacted: false, deflected: false };
}
/** Geometric contact is distinct from HP damage: invulnerability and shields do not make a miss. */
export function recordMeleeContact(metrics: CombatDiagnostics | undefined, id: string, contacted: boolean) {
  const trial = metrics?.pendingMelee[id];
  if (trial && contacted) trial.contacted = true;
}
export function recordMeleeDeflection(metrics: CombatDiagnostics | undefined, id: string) {
  const trial = metrics?.pendingMelee[id];
  if (trial) trial.deflected = true;
}
/** A still-active swing at round end is censored, not silently counted as a miss. */
export function finishMeleeTrials(metrics: CombatDiagnostics | undefined, activeIds: string[]) {
  if (!metrics) return;
  const active = new Set(activeIds);
  for (const [id, trial] of Object.entries(metrics.pendingMelee)) {
    if (active.has(id)) continue;
    const metric = metrics.meleeGeometry[trial.ownerId - 1];
    metric.completed++;
    if (trial.contacted) metric.contacts++; else metric.misses++;
    if (trial.deflected) {
      metric.deflections++;
      if (!trial.contacted) metric.deflectionOnly++;
    }
    delete metrics.pendingMelee[id];
  }
}

export const diagnosticPlayerKey = (player: Player) => player.isClone ? player.aiControllerId ?? `clone:${player.id}:${player.createdAt}` : `player:${player.id}`;
export function recordAction(metrics: CombatDiagnostics | undefined, ownerId: 1 | 2, action: CombatAction, mana = 0, isClone = false) {
  if (!metrics) return;
  const actions = isClone ? metrics.cloneActions : metrics.actions;
  actions[ownerId - 1][action].uses++;
  actions[ownerId - 1][action].mana += mana;
}
export function recordEntityAction(metrics: CombatDiagnostics | undefined, entity: { id: string; ownerId: 1 | 2 },
  action: CombatAction, actionId: string, isClone = false) {
  if (!metrics) return;
  metrics.entityActions[entity.id] = action;
  metrics.entityActionIds[entity.id] = actionId;
  metrics.entityClones[entity.id] = isClone;
  (isClone ? metrics.cloneActions : metrics.actions)[entity.ownerId - 1][action].emitted++;
}
export function entityDamageSource(metrics: CombatDiagnostics | undefined, entity: { id: string; ownerId: 1 | 2 }, kind: DamageKind): DamageSource {
  return { kind, ownerId: entity.ownerId, entityId: entity.id,
    action: metrics?.entityActions[entity.id], actionId: metrics?.entityActionIds[entity.id], isClone: metrics?.entityClones[entity.id] };
}
/** Count a persistent melee threat once, rather than once per shielded tick. */
export function recordBlocked(metrics: CombatDiagnostics | undefined, defender: Pick<Player, 'id' | 'isClone'>,
  damage: number, action: CombatAction = 'defense', entityId?: string) {
  if (!metrics) return;
  if (entityId) {
    const key = defender.id + ':' + !!defender.isClone + ':' + action + ':' + entityId;
    if (metrics.blockedIds.includes(key)) return;
    metrics.blockedIds.push(key);
  }
  (defender.isClone ? metrics.cloneActions : metrics.actions)[defender.id - 1][action].blocked += damage;
}
export function recordHealthChange(metrics: CombatDiagnostics | undefined, target: Player, before: number, after: number, source: DamageSource) {
  if (!metrics || before === after) return;
  const damage = Math.max(0, before - after), healing = Math.max(0, after - before);
  const action = source.action ?? (source.entityId ? metrics.entityActions[source.entityId] : undefined);
  const actionId = source.actionId ?? (source.entityId ? metrics.entityActionIds[source.entityId] : undefined);
  const isClone = source.isClone ?? (source.entityId ? metrics.entityClones[source.entityId] : false);
  if (target.isClone) metrics.cloneDamage[target.id - 1] += damage;
  else {
    metrics.receivedDamage[target.id - 1] += damage;
    metrics.healing[target.id - 1] += healing;
    metrics.damageByKind[source.kind][target.id - 1] += damage;
  }
  if (source.ownerId !== null) {
    if (source.ownerId !== target.id && !target.isClone) metrics.effectiveDamage[source.ownerId - 1] += damage;
    if (action) {
      const metric = (isClone ? metrics.cloneActions : metrics.actions)[source.ownerId - 1][action];
      if (source.ownerId === target.id) metric.selfDamage += damage;
      else if (target.isClone) metric.cloneDamage += damage;
      else metric.damage += damage;
      metric.healing += healing;
      if (damage > 0 && source.ownerId !== target.id && !target.isClone && actionId && !metrics.actionHitIds.includes(actionId)) {
        metric.hits++;
        metrics.actionHitIds.push(actionId);
      }
    }
  }
}
export function recordHit(metrics: CombatDiagnostics | undefined, id: string, ownerId: 1 | 2, damage: number) {
  if (!metrics || damage <= 0) return;
  metrics.directDamage[ownerId - 1] += damage;
  const key = `${ownerId}:${id}`;
  if (!metrics.hitIds.includes(key)) { metrics.hits[ownerId - 1]++; metrics.hitIds.push(key); }
}
