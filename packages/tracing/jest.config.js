// Unit-test config — pure-function tests only, no DB, no network, no
// real OTLP collector. Same shape as every other package's
// jest.config.js (see services/auth's for the three-tier test plan this
// fits into, docs/FEATURES.md §11.10).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
};
