#!/usr/bin/env node
// nexus-deploy — blue/green deploy CLI for the platform's own services
// (docs/FEATURES.md §11.10). Usage:
//   nexus-deploy <service> <basePort> <cwd> <startCommand> [currentColor]
// Example:
//   nexus-deploy pm 4002 services/pm "node dist/main.js" blue
import { runBlueGreenDeploy } from './deploy';
import { Color } from './plan';

async function main() {
  const [service, basePortStr, cwd, startCommand, currentColorArg] = process.argv.slice(2);
  if (!service || !basePortStr || !cwd || !startCommand) {
    console.error('Usage: nexus-deploy <service> <basePort> <cwd> <startCommand> [currentColor: blue|green]');
    process.exit(1);
  }
  const currentColor = (currentColorArg as Color | undefined) ?? null;

  console.log(`[nexus-deploy] starting blue/green deploy for "${service}" (current color: ${currentColor ?? 'none — first deploy'})`);
  const result = await runBlueGreenDeploy({
    service,
    basePort: Number(basePortStr),
    currentColor,
    startCommand,
    cwd,
  });

  if (result.promoted) {
    console.log(
      `[nexus-deploy] ${result.plan.incomingColor} instance of "${service}" is healthy on port ${result.plan.incomingPort} — ready for traffic cutover.`,
    );
    if (result.plan.outgoingColor) {
      console.log(
        `[nexus-deploy] "${result.plan.outgoingColor}" (port ${result.plan.outgoingPort}) is STILL RUNNING — stopping it is a separate, explicit step once real traffic has actually moved.`,
      );
    }
    process.exit(0);
  } else {
    console.error(`[nexus-deploy] deploy FAILED (${result.reason}) — incoming instance was killed. Outgoing instance untouched, still serving.`);
    process.exit(1);
  }
}

main();
