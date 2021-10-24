import { EPathSegmentType, TParsedSegmentParametric, TParsedSegmentStatic } from '../parser/p-types'
import { generateFullMatchFunc, generateFullMatchRegex } from './match-utils'

const segments: (TParsedSegmentStatic | TParsedSegmentParametric)[] = [
    {
        type: EPathSegmentType.STATIC,
        value: 'static',
    }, {
        type: EPathSegmentType.VARIABLE,
        value: 'key',
        regex: '([^\\/]*)',
    }, {
        type: EPathSegmentType.STATIC,
        value: '-',
    }, {
        type: EPathSegmentType.WILDCARD,
        value: '*',
        regex: '(.*)',
    },
]

const segmentsMulti: (TParsedSegmentStatic | TParsedSegmentParametric)[] = [
    {
        type: EPathSegmentType.VARIABLE,
        value: 'key',
        regex: '([^\\/]*)',
    }, {
        type: EPathSegmentType.STATIC,
        value: '-',
    }, {
        type: EPathSegmentType.VARIABLE,
        value: 'key',
        regex: '([^\\/]*)',
    }, {
        type: EPathSegmentType.STATIC,
        value: '-',
    }, {
        type: EPathSegmentType.WILDCARD,
        value: '*',
        regex: '(.*)',
    }, {
        type: EPathSegmentType.STATIC,
        value: '-',
    }, {
        type: EPathSegmentType.WILDCARD,
        value: '*',
        regex: '(.*)',
    },
]

describe('match-utils->generateFullMatchRegex', () => {
    it('must generate Full Match Regex', () => {
        expect(generateFullMatchRegex(segments)).toEqual('static([^\\/]*)\\-(.*)')
    })
})

describe('match-utils->generateFullMatchFunc', () => {
    it('must generate working function with VAR and WILDCARD', () => {
        const func = generateFullMatchFunc(segments)
        const params: Record<string, string> = {}

        expect(typeof func === 'function')

        func('staticvalue-wildcard', params, { safeDecodeURIComponent: (s: string) => s })

        expect(Object.keys(params)).toEqual(['key', '*'])
        expect(params.key).toEqual('value')
        expect(params['*']).toEqual('wildcard')
    })

    it('must generate working function with multi-VAR and multi-WILDCARD', () => {
        const func = generateFullMatchFunc(segmentsMulti)
        const params: Record<string, string[]> = {}

        expect(typeof func === 'function')

        func('val1-val2-wild1-wild2', params, { safeDecodeURIComponent: (s: string) => s })

        expect(Object.keys(params)).toEqual(['key', '*'])
        expect(params.key.length).toEqual(2)
        expect(params.key[0]).toEqual('val1')
        expect(params.key[1]).toEqual('val2')
        expect(params.key.length).toEqual(2)
        expect(params['*'][0]).toEqual('wild1')
        expect(params['*'][1]).toEqual('wild2')
    })
})
