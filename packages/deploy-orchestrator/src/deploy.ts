// The side-effecting half of blue/green deploy (docs/FEATURES.md
// §11.10) — real child-process spawning and real HTTP health polling
// against every service's standardized `/health` endpoint (established
// convention, see e.g. services/pm/src/health/health.controller.ts's
// docblock). See plan.ts for the pure decision logic this drives.
//
// **What this does**: starts the new version as a genuinely separate
// process on the color-specific port, polls its `/health` endpoint for
// real, and on success reports the new instance is ready — leaving the
// OLD instance completely untouched and still serving traffic the whole
// time (the actual point of blue/green over a rolling restart, which has
// a real availability gap while the process restarts in place).
//
// **What this deliberately does NOT do**: shift real user traffic at a
// load balancer/reverse proxy — this repo has no such component of its
// own (no nginx/Envoy config, no cloud LB integration) for its OWN
// services (distinct from services/cicd's canary/blue-green FEATURE,
// which models traffic percentage as data a REAL external LB integration
// would read — see that feature's own docblock for the identical
// "models the decision, doesn't itself shift traffic" scope note). This
// script's job ends at producing a genuine, health-check-verified
// "this new instance is ready" signal; wiring that signal to a specific
// production load balancer's API is a disclosed, real next step, not
// silently pretended to be done here.
import { ChildProcess, spawn } from 'child_process';
import { Color, DeployPlan, decideHealthCheckOutcome, planDeploy } from './plan';

export interface DeployOptions {
  service: string;
  basePort: number;
  currentColor: Color | null;
  /** Shell command that starts the service, e.g. "node dist/main.js" —
   *  PORT is injected via env, matching every service's own
   *  `process.env.PORT ?? <default>` convention. */
  startCommand: string;
  cwd: string;
  healthPath?: string;
  pollIntervalMs?: number;
  requiredConsecutiveSuccesses?: number;
  timeoutMs?: number;
}

export interface DeployResult {
  plan: DeployPlan;
  promoted: boolean;
  reason: 'promoted' | 'timeout' | 'process_exited';
  incomingProcess: ChildProcess | null;
}

async function pollOnce(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Runs one full blue/green deploy attempt for a service: spawns the
 * incoming color's process, polls its health endpoint until it either
 * proves itself (promote) or the deadline passes (timeout/rollback).
 * On timeout or an unexpected process exit, the incoming process is
 * killed and the function returns `promoted: false` — the outgoing
 * (old) instance was NEVER touched by this function at any point, so a
 * failed deploy leaves the platform exactly as healthy as before it
 * started. Actually stopping the outgoing instance after a successful
 * promotion is deliberately a SEPARATE, explicit caller action (see
 * cli.ts) — never automatic — so a human/pipeline step controls when
 * the old version actually stops serving.
 */
export async function runBlueGreenDeploy(options: DeployOptions): Promise<DeployResult> {
  const plan = planDeploy(options.service, options.basePort, options.currentColor);
  const healthPath = options.healthPath ?? '/health';
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const requiredConsecutiveSuccesses = options.requiredConsecutiveSuccesses ?? 3;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const [cmd, ...args] = options.startCommand.split(' ');
  const child = spawn(cmd, args, {
    cwd: options.cwd,
    env: { ...process.env, PORT: String(plan.incomingPort) },
    stdio: 'inherit',
  });

  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  const startedAt = Date.now();
  let consecutiveSuccesses = 0;

  while (true) {
    if (exited) {
      return { plan, promoted: false, reason: 'process_exited', incomingProcess: null };
    }

    const healthy = await pollOnce(`http://localhost:${plan.incomingPort}${healthPath}`);
    consecutiveSuccesses = healthy ? consecutiveSuccesses + 1 : 0;

    const outcome = decideHealthCheckOutcome(
      { consecutiveSuccesses, elapsedMs: Date.now() - startedAt },
      { requiredConsecutiveSuccesses, timeoutMs },
    );

    if (outcome === 'promote') {
      return { plan, promoted: true, reason: 'promoted', incomingProcess: child };
    }
    if (outcome === 'timeout') {
      child.kill();
      return { plan, promoted: false, reason: 'timeout', incomingProcess: null };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
