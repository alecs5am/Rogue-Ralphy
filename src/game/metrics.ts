export type HitEvent = { time: number; damage: number; targetId: string };
export type TargetMetrics = { damage: number; hits: number; kills: number };

export type Metrics = {
  triggers: number; projectiles: number; hits: number; kills: number; totalDamage: number;
  hitEvents: HitEvent[]; targetMetrics: Record<string, TargetMetrics>; peakDps: number;
  successfulProjectiles: number; misses: number;
};

export function createMetrics(): Metrics {
  return {
    triggers: 0, projectiles: 0, hits: 0, kills: 0, totalDamage: 0,
    hitEvents: [], targetMetrics: {}, peakDps: 0,
    successfulProjectiles: 0, misses: 0,
  };
}

export function recordTrigger(metrics: Metrics): Metrics {
  return { ...metrics, triggers: metrics.triggers + 1 };
}

export function recordProjectile(metrics: Metrics): Metrics {
  return { ...metrics, projectiles: metrics.projectiles + 1 };
}

export function recordHit(metrics: Metrics, damage: number, time: number, targetId: string, firstHit: boolean): Metrics {
  const hitEvents = [...metrics.hitEvents.filter((event) => event.time > time - 3), { time, damage, targetId }];
  const rollingDps = hitEvents.reduce((total, event) => total + event.damage, 0) / 3;
  const target = metrics.targetMetrics[targetId] ?? { damage: 0, hits: 0, kills: 0 };
  return {
    ...metrics,
    hits: metrics.hits + 1,
    totalDamage: metrics.totalDamage + damage,
    hitEvents,
    targetMetrics: { ...metrics.targetMetrics, [targetId]: { ...target, damage: target.damage + damage, hits: target.hits + 1 } },
    peakDps: Math.max(metrics.peakDps, rollingDps),
    successfulProjectiles: metrics.successfulProjectiles + Number(firstHit),
  };
}

export function recordProjectileOutcome(metrics: Metrics, everHit: boolean): Metrics {
  return everHit ? metrics : { ...metrics, misses: metrics.misses + 1 };
}

export function recordKill(metrics: Metrics, targetId: string): Metrics {
  const target = metrics.targetMetrics[targetId] ?? { damage: 0, hits: 0, kills: 0 };
  return { ...metrics, kills: metrics.kills + 1, targetMetrics: { ...metrics.targetMetrics, [targetId]: { ...target, kills: target.kills + 1 } } };
}

export function summarizeMetrics(metrics: Metrics, now: number) {
  const cutoff = now - 3;
  let rollingDamage = 0;
  const rollingDamageByTarget = new Map<string, number>();
  for (const event of metrics.hitEvents) {
    if (event.time > cutoff) {
      rollingDamage += event.damage;
      rollingDamageByTarget.set(event.targetId, (rollingDamageByTarget.get(event.targetId) ?? 0) + event.damage);
    }
  }
  const rollingDps = rollingDamage / 3;
  const knownOutcomes = metrics.successfulProjectiles + metrics.misses;
  const targets = Object.fromEntries(Object.entries(metrics.targetMetrics).map(([targetId, target]) => [targetId, {
    ...target,
    rollingDps: (rollingDamageByTarget.get(targetId) ?? 0) / 3,
  }]));
  return {
    totalDamage: metrics.totalDamage,
    triggers: metrics.triggers,
    projectiles: metrics.projectiles,
    hits: metrics.hits,
    successfulProjectiles: metrics.successfulProjectiles,
    misses: metrics.misses,
    accuracy: knownOutcomes ? metrics.successfulProjectiles / knownOutcomes : 0,
    kills: metrics.kills,
    rollingDps,
    peakDps: metrics.peakDps,
    targets,
  };
}

export function resetMetrics(_: Metrics): Metrics {
  return createMetrics();
}
