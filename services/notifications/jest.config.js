// Unit-test config — pure-function tests only, no DB, no network, no
// real webpush/SMTP sends. This service had NO jest config at all before
// this pass (docs/FEATURES.md test-coverage gap) — everything it does is
// DB/network-shaped (push sends, email sends, cron ticks calling other
// services), so genuine unit coverage means extracting the pure decision
// logic OUT of those methods first (see push-status.ts) rather than
// mocking pg/web-push/nodemailer to fake a unit test. See
// services/auth/jest.config.js's docblock for the three-tier test plan
// this fits into.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
};
