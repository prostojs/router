import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
    const { createDyeReplacements } = await import('@prostojs/dye/common')

    return {
        define: {
            ...createDyeReplacements({ strip: true }),
            __VERSION__: JSON.stringify('VITEST_TEST'),
        },
        test: {
            include: ['src/**/*.spec.ts'],
            coverage: {
                provider: 'v8',
                reporter: ['html', 'lcov', 'text'],
                include: ['src/**/*.ts'],
            },
        },
    }
})
