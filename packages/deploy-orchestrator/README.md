# @nexus/deploy-orchestrator

Blue/green deploy for the platform's OWN 18 services (docs/FEATURES.md
§11.10) — distinct from `services/cicd`'s canary/blue-green **feature**
(§4), which is a product capability tenants use for THEIR deployments.
This is the platform deploying itself.

## What it does

- Starts the new version of a service as a genuinely separate process, on
  a color-specific port (`portFor` — blue uses the service's normal port,
  green uses `port + 1000`), so both can run simultaneously.
- Polls the new instance's standard `/health` endpoint for real, over
  real HTTP, until it's reported healthy `requiredConsecutiveSuccesses`
  times in a row (default 3) or a timeout passes (default 60s).
- On success: reports the new instance ready for cutover. The OLD
  instance is never touched — it kept serving the whole time.
- On failure/timeout: kills the new instance, leaves the old one running
  untouched. A failed deploy leaves the platform exactly as healthy as
  before the attempt.

## What it deliberately does NOT do

Shift real traffic at a load balancer/reverse proxy — this repo has no
such component for its own services. This tool's job ends at producing a
genuine, health-check-verified "this new instance is ready" signal;
wiring that to a specific production LB's API (nginx reload, an AWS ALB
target-group swap, etc.) is a disclosed, real next step, not silently
pretended to be done here.

## Usage

```sh
nexus-deploy pm 4002 services/pm "node dist/main.js" blue
```

Deploys the next color after `blue` (i.e. `green`) for the `pm` service,
whose normal port is 4002, run from `services/pm`, started via
`node dist/main.js`. Omit the trailing color argument for a service's
first-ever blue/green deploy.
