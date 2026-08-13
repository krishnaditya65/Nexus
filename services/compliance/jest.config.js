// Unit-test config — pure-function/data tests only, no DB, no network. See
// services/auth/jest.config.js's docblock for the three-tier test plan
// this fits into (docs/FEATURES.md §11.10).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
};
