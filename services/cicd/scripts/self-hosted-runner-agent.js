#!/usr/bin/env node
// A reference self-hosted/BYO runner agent — the actual thing a customer
// would run on their own on-prem/GPU box, entirely outside this
// platform's infrastructure. Deliberately a standalone script, not
// something the cicd NestJS process spawns itself: a real BYO runner is
// a separate process on a separate machine that only ever talks to this
// service over HTTP with its own bearer token (see
// src/runners/token.util.ts's docblock on the token format).
//
// Usage: RUNNER_TOKEN=<token> node scripts/self-hosted-runner-agent.js [labels]
//   labels defaults to the labels the runner was registered with — pass
//   explicitly if you want to poll a subset (e.g. only "gpu").
//
// Loop: heartbeat -> poll for a job matching its labels -> if claimed,
// clone the repo itself from git-host (using the auth header handed back
// with the claim — see JobBrokerService's docblock for why this is
// transient/single-use) -> run the step as a real `docker run` container,
// exactly the same invocation shape RunnerService uses locally -> report
// the result back.

const { spawn } = require('child_process');
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const CICD_URL = process.env.CICD_URL || 'http://localhost:4005';
const GIT_HOST_URL = process.env.GIT_HOST_URL || 'http://localhost:4003';
const RUNNER_TOKEN = process.env.RUNNER_TOKEN;
const LABELS = (process.argv[2] || 'gpu,on-prem').split(',');
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 1500);

if (!RUNNER_TOKEN) {
  console.error('RUNNER_TOKEN env var is required (from POST /runners)');
  process.exit(1);
}

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, opts);
    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
    child.on('error', (err) => resolve({ code: 1, output: output + `\n${err.message}` }));
  });
}

async function heartbeat() {
  await fetch(`${CICD_URL}/runners/heartbeat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${RUNNER_TOKEN}` },
  });
}

async function claimNext() {
  const res = await fetch(`${CICD_URL}/runners/jobs/next?labels=${encodeURIComponent(LABELS.join(','))}`, {
    headers: { authorization: `Bearer ${RUNNER_TOKEN}` },
  });
  const body = await res.json();
  return body.id ? body : null;
}

async function completeJob(jobId, status, log, exitCode) {
  await fetch(`${CICD_URL}/runners/jobs/${jobId}/complete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${RUNNER_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ status, log, exitCode }),
  });
}

async function executeJob(job) {
  console.log(`[agent] claimed job ${job.id} (step "${job.step_name}")`);
  const workspace = mkdtempSync(join(tmpdir(), 'eos-byo-runner-'));
  try {
    const cloneUrl = `${GIT_HOST_URL}/${job.repo_name}.git`;
    const clone = await run('git', [
      '-c',
      `http.extraHeader=Authorization: ${job.authorizationHeader}`,
      'clone',
      '--depth',
      '1',
      '--branch',
      job.commit_ref,
      cloneUrl,
      workspace,
    ]);
    if (clone.code !== 0) {
      await completeJob(job.id, 'failed', `clone failed: ${clone.output}`, clone.code);
      return;
    }

    const image = job.image || 'node:20-alpine';
    const result = await run('docker', [
      'run',
      '--rm',
      '-v',
      `${workspace}:/workspace`,
      '-w',
      '/workspace',
      image,
      'sh',
      '-c',
      job.run_cmd || '',
    ]);
    await completeJob(job.id, result.code === 0 ? 'succeeded' : 'failed', result.output, result.code);
    console.log(`[agent] job ${job.id} ${result.code === 0 ? 'succeeded' : 'failed'}`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`[agent] polling ${CICD_URL} for labels [${LABELS.join(', ')}]`);
  await heartbeat();
  for (;;) {
    await heartbeat();
    const job = await claimNext();
    if (job) {
      await executeJob(job);
    } else {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});
