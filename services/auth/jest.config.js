// Unit-test config, deliberately scoped to *.spec.ts next to the source
// they test (Nest's own convention) — no DB, no network, pure-function
// tests only. Integration tests against the real docker-compose stack are
// a separate, not-yet-built layer (see docs/FEATURES.md §11.10's
// "automated tests" item for the full three-tier plan: unit / integration
// / e2e).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
};
