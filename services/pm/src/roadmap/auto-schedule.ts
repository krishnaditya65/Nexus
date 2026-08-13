// Advanced Roadmaps auto-scheduling (docs/FEATURES.md §13.4) — algorithmic
// cross-project scheduling from team capacity + velocity + dependencies,
// genuinely distinct from Delivery Plans' `generate()` (that MERGES AND
// DISPLAYS sprint dates a human already set; this COMPUTES dates nobody
// set yet, from a shared capacity pool, dependency ordering, and epic
// size). Exported as a pure function — no database, no service — so the
// actual scheduling logic (topological ordering + greedy capacity
// bin-packing) is unit-testable on its own, same discipline as
// evaluateConditions/computeReorderRank/validateFields elsewhere in this
// build.

export interface SchedulableEpic {
  id: string;
  points: number;
  /** Ids of OTHER epics in this same input set that must finish before
   *  this one can start (mirrors ticket_links' 'blocks' semantics: a
   *  'blocks' edge source→target means source must finish first). */
  dependsOn: string[];
}

export interface ScheduledEpic {
  id: string;
  startSprintIndex: number;
  /** Inclusive — the last sprint this epic still has work scheduled in. */
  endSprintIndex: number;
}

export interface AutoScheduleResult {
  schedule: ScheduledEpic[];
  /** Epics excluded from dependency ordering because they sit in a
   *  dependency CYCLE (§13.4 is deliberately best-effort here, not a
   *  full DAG-validation feature) — scheduled last, in input order,
   *  ignoring their depends0n edges, rather than the whole run failing. */
  warnings: string[];
}

/**
 * Kahn's-algorithm topological sort + greedy capacity bin-packing.
 *
 * Every epic must wait until all its dependencies have finished (their
 * `endSprintIndex`) before it can start; subject to that, epics are
 * packed into a single shared capacity ledger (`velocityPerSprint` points
 * available per sprint) in priority order (the order they appear in
 * `epics`, same "caller controls priority via input order" convention as
 * `computeReorderRank`'s before/after-ticket ordering). An epic bigger
 * than one sprint's capacity spans multiple consecutive sprints.
 *
 * Deliberately NOT a full critical-path/resource-leveling solver (real
 * Advanced Roadmaps-equivalent tooling can do far more — parallel teams,
 * partial capacity reservation, what-if scenarios) — this is the
 * honestly-scoped first slice: one shared capacity pool, hard dependency
 * ordering, greedy first-fit packing.
 */
export function computeAutoSchedule(epics: SchedulableEpic[], velocityPerSprint: number): AutoScheduleResult {
  const warnings: string[] = [];
  const safeVelocity = velocityPerSprint > 0 ? velocityPerSprint : 1;
  if (velocityPerSprint <= 0) {
    warnings.push('velocityPerSprint was <= 0; treated as 1 to avoid an infinite scheduling loop.');
  }

  const byId = new Map(epics.map((e) => [e.id, e]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // depId -> [epics that depend on it]
  for (const e of epics) {
    inDegree.set(e.id, 0);
    dependents.set(e.id, []);
  }
  for (const e of epics) {
    for (const depId of e.dependsOn) {
      if (!byId.has(depId)) continue; // dependency outside this input set — ignore, not an error
      inDegree.set(e.id, (inDegree.get(e.id) ?? 0) + 1);
      dependents.get(depId)!.push(e.id);
    }
  }

  // Kahn's algorithm: repeatedly peel off zero-in-degree nodes, in input
  // order among ties (stable priority). Anything left unpeeled at the end
  // sits in a cycle.
  const queue = epics.filter((e) => inDegree.get(e.id) === 0).map((e) => e.id);
  const order: string[] = [];
  const remaining = new Map(inDegree);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const dependentId of dependents.get(id) ?? []) {
      const next = (remaining.get(dependentId) ?? 0) - 1;
      remaining.set(dependentId, next);
      if (next === 0) queue.push(dependentId);
    }
  }
  const cyclical = epics.map((e) => e.id).filter((id) => !order.includes(id));
  if (cyclical.length > 0) {
    warnings.push(
      `${cyclical.length} epic(s) are in a dependency cycle and were scheduled last, ignoring their dependencies: ${cyclical.join(', ')}`,
    );
    order.push(...cyclical);
  }

  const capacityLedger = new Map<number, number>(); // sprintIndex -> remaining points
  const capacityAt = (i: number) => capacityLedger.get(i) ?? safeVelocity;
  const finishSprintById = new Map<string, number>();
  const schedule: ScheduledEpic[] = [];

  for (const id of order) {
    const epic = byId.get(id)!;
    const depFinishes = epic.dependsOn
      .filter((d) => finishSprintById.has(d))
      .map((d) => finishSprintById.get(d)!);
    let sprint = depFinishes.length > 0 ? Math.max(...depFinishes) + 1 : 0;

    let remainingPoints = epic.points;
    let startSprint: number | null = null;
    // A zero-point epic (no estimated children yet) still gets a
    // one-sprint slot — "unscheduled" would be a worse UX than "shown at
    // its earliest possible sprint with no size yet."
    if (remainingPoints <= 0) {
      startSprint = sprint;
      finishSprintById.set(id, sprint);
      schedule.push({ id, startSprintIndex: sprint, endSprintIndex: sprint });
      continue;
    }
    while (remainingPoints > 0) {
      const avail = capacityAt(sprint);
      if (avail > 0) {
        if (startSprint === null) startSprint = sprint;
        const take = Math.min(avail, remainingPoints);
        capacityLedger.set(sprint, avail - take);
        remainingPoints -= take;
      }
      if (remainingPoints > 0) sprint++;
    }
    finishSprintById.set(id, sprint);
    schedule.push({ id, startSprintIndex: startSprint!, endSprintIndex: sprint });
  }

  return { schedule, warnings };
}
