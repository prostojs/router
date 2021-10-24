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
}