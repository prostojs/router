module.exports = {
    preset: 'ts-jest',
    moduleFileExtensions: [
      "ts",
      "js"
    ],
    rootDir: __dirname,
    testRegex: ".spec.ts$",
    transform: {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    coverageDirectory: 'coverage',
    coverageReporters: ['html', 'lcov', 'text'],
    collectCoverageFrom: [
        'src/**/*.ts',
    ],
    watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/.git/'],
    testEnvironment: "node",
    globals: {
      __DYE_RED_BRIGHT__: '',
      __DYE_BOLD__: '',
      __DYE_RESET__: '',
      __DYE_RED__: '',
      __DYE_COLOR_OFF__: '',
      __DYE_GREEN__: '',
      __DYE_YELLOW__: '',
      __DYE_DIM__: '',
      __DYE_DIM_OFF__: '',
      __VERSION__: 'JEST_TEST',
    }
}