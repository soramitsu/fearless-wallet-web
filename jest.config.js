process.env.TS_JEST_DISABLE_VER_CHECKER = 'true';
process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';

module.exports = {
  preset: '@vue/cli-plugin-unit-jest/presets/typescript-and-babel',
  // setupFiles: ['./tests/unit/setup.js'],
  verbose: true,
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { diagnostics: false }],
    '^.+\\.vue$': '@vue/vue3-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!(@polkadot|@subwallet|@soramitsu-ui|@open-web3|lodash-es)/)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@extension-base/(.*)$': '<rootDir>/src/extension/background/extension-base/src/$1',
    '^@extension-base$': '<rootDir>/src/extension/background/extension-base/src',
    '^@sora$': '<rootDir>/src/sora/index.ts',
    '^@sora/(.*)$': '<rootDir>/src/sora/$1',
    '^@sora-types$': '<rootDir>/src/types/sora.ts',
    '^@sora-types/(.*)$': '<rootDir>/src/types/sora.ts',
    '@soramitsu-ui/ui/styles': '<rootDir>/tests/unit/__mocks__/styleMock.ts',
    '^@sora-substrate/util/src/bridgeProxy/sub/consts$': '<rootDir>/tests/unit/__mocks__/soraSubBridgeConsts.ts',
    '^@polkadot/ui-keyring$': '<rootDir>/tests/unit/__mocks__/polkadotUiKeyring.ts',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx,vue}'],
  coverageReporters: ['lcov'],
  coveragePathIgnorePatterns: ['node_modules/', 'coverage/'],
};
