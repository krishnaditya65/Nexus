// Blue/green deploy for the platform's OWN 18 services (docs/FEATURES.md
// §11.10) — distinct from services/cicd's canary/blue-green FEATURE
// (`docs/FEATURES.md` §4), which is a product capability tenants use for
// THEIR deployments; this is the platform deploying itself. Pure planning
// logic lives here, independently unit-tested; the actual process-
// spawning/health-polling side effects live in deploy.ts.

export type Color = 'blue' | 'green';

/** Pure — the color NOT currently live always receives the new deploy;
 *  "blue" is the arbitrary starting color for a service's first-ever
 *  deploy (no prior color recorded). */
export function nextColor(current: Color | null): Color {
  if (current === null) return 'blue';
  return current === 'blue' ? 'green' : 'blue';
}

/** Pure — each color gets a fixed, deterministic port offset from the
 *  service's normal port, so blue and green can run SIMULTANEOUSLY (the
 *  whole point of blue/green — the new version starts up and gets
 *  health-checked while the old one is still serving real traffic,
 *  unlike a rolling restart that has a gap). */
export function portFor(basePort: number, color: Color): number {
  return color === 'blue' ? basePort : basePort + 1000;
}

export interface HealthCheckState {
  consecutiveSuccesses: number;
  elapsedMs: number;
}

export interface HealthCheckPolicy {
  requiredConsecutiveSuccesses: number;
  timeoutMs: number;
}

export type HealthCheckDecision = 'continue' | 'promote' | 'timeout';

/**
 * Pure — the actual gating decision a blue/green deploy hinges on: has
 * the new (green) instance proven itself healthy enough times in a row
 * to trust cutting real traffic to it, or has it run out of time first?
 * `requiredConsecutiveSuccesses` > 1 exists specifically to avoid
 * promoting on a single lucky health check during, say, a slow cold-
 * start warm-up that then immediately starts failing.
 */
export function decideHealthCheckOutcome(state: HealthCheckState, policy: HealthCheckPolicy): HealthCheckDecision {
  if (state.consecutiveSuccesses >= policy.requiredConsecutiveSuccesses) return 'promote';
  if (state.elapsedMs >= policy.timeoutMs) return 'timeout';
  return 'continue';
}

export interface DeployPlan {
  service: string;
  incomingColor: Color;
  outgoingColor: Color | null;
  incomingPort: number;
  outgoingPort: number | null;
}

/** Pure — the full plan for one service's deploy, before anything is
 *  actually spawned. `outgoingColor`/`outgoingPort` are null on a
 *  service's first-ever blue/green deploy (nothing to drain afterward —
 *  there's no "old" instance yet). */
export function planDeploy(service: string, basePort: number, currentColor: Color | null): DeployPlan {
  const incomingColor = nextColor(currentColor);
  return {
    service,
    incomingColor,
    outgoingColor: currentColor,
    incomingPort: portFor(basePort, incomingColor),
    outgoingPort: currentColor ? portFor(basePort, currentColor) : null,
  };
}
