import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'
import dye from '@prostojs/dye/rolldown'

const external = [
    '@prostojs/cache',
    '@prostojs/parser',
    '@prostojs/tree',
    'path',
    'url',
    'stream',
]

function createConfig(type) {
    const formats = {
        cjs: 'cjs',
        mjs: 'es',
    }
    return defineConfig({
        external,
        input: './src/index.ts',
        output: {
            file: `./dist/index.${type}`,
            format: formats[type],
            sourcemap: false,
        },
        plugins: [dye()],
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
    })
}

function createDtsConfig() {
    return defineConfig({
        external,
        input: './dts-build/index.d.ts',
        plugins: [
            dts({
                dtsInput: true,
            }),
        ],
        output: {
            file: './dist/index.d.ts',
            format: 'es',
            sourcemap: false,
        },
    })
}

export default [createConfig('mjs'), createConfig('cjs'), createDtsConfig()]
