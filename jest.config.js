module.exports = {
  preset: '@vue/cli-plugin-unit-jest/presets/typescript-and-babel',
  // setupFiles: ['./tests/unit/setup.js'],
  verbose: true,
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/?!(@polkadot/util)'],
  // Same alias as tsconfig.json and vue.config.base.js, so tests can load background code that uses it.
  moduleNameMapper: {
    '^@extension-base/(.*)$': '<rootDir>/src/extension/background/extension-base/src/$1',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx,vue}'],
  coverageReporters: ['lcov'],
  coveragePathIgnorePatterns: ['node_modules/', 'coverage/'],
};
