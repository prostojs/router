import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'
import { dye } from '@prostojs/dye'

const dyeModifiers = [
    'dim',
    'bold',
    'underscore',
    'inverse',
    'italic',
    'crossed',
]
const dyeColors = [
    'red',
    'green',
    'cyan',
    'blue',
    'yellow',
    'white',
    'magenta',
    'black',
]

const external = [
    '@prostojs/cache',
    '@prostojs/parser',
    '@prostojs/tree',
    'path',
    'url',
    'stream',
]

const dyeDefines = createDyeReplaceConst()

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
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
            ...dyeDefines,
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

function createDyeReplaceConst() {
    const c = dye('red')
    const bg = dye('bg-red')
    const dyeReplacements = {
        __DYE_RESET__: "'" + dye.reset + "'",
        __DYE_COLOR_OFF__: "'" + c.close + "'",
        __DYE_BG_OFF__: "'" + bg.close + "'",
    }
    dyeModifiers.forEach((v) => {
        dyeReplacements[`__DYE_${v.toUpperCase()}__`] = "'" + dye(v).open + "'"
        dyeReplacements[`__DYE_${v.toUpperCase()}_OFF__`] =
            "'" + dye(v).close + "'"
    })
    dyeColors.forEach((v) => {
        dyeReplacements[`__DYE_${v.toUpperCase()}__`] = "'" + dye(v).open + "'"
        dyeReplacements[`__DYE_BG_${v.toUpperCase()}__`] =
            "'" + dye('bg-' + v).open + "'"
        dyeReplacements[`__DYE_${v.toUpperCase()}_BRIGHT__`] =
            "'" + dye(v + '-bright').open + "'"
        dyeReplacements[`__DYE_BG_${v.toUpperCase()}_BRIGHT__`] =
            "'" + dye('bg-' + v + '-bright').open + "'"
    })
    return dyeReplacements
}
