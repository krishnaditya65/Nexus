// Unit-test config — pure-function tests only, no DB, no filesystem, no
// real warehouse connector calls. This service had NO jest config at all
// before this pass (docs/FEATURES.md test-coverage gap). See
// services/auth/jest.config.js's docblock for the three-tier test plan
// this fits into.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
};
