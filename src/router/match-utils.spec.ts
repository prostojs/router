import { describe, it, expect } from 'vitest'
import {
    EPathSegmentType,
    TParsedSegmentParametric,
    TParsedSegmentStatic,
} from '../parser/p-types'
import { generateFullMatchFunc, generateFullMatchRegex } from './match-utils'

const s = (value: string): TParsedSegmentStatic => ({
    type: EPathSegmentType.STATIC,
    value,
})
const p = (name: string, regex = '([^\\/]*)'): TParsedSegmentParametric => ({
    type: EPathSegmentType.VARIABLE,
    name,
    value: name,
    regex,
})
const w = (regex = '(.*)'): TParsedSegmentParametric => p('*', regex)
const po = (name: string, regex?: string) =>
    Object.assign(p(name, regex), { optional: true })
const wo = (regex?: string) => Object.assign(w(regex), { optional: true })

const segments: (TParsedSegmentStatic | TParsedSegmentParametric)[] = [
    s('static'),
    p('key'),
    s('-'),
    w(),
]

const segmentsMulti: (TParsedSegmentStatic | TParsedSegmentParametric)[] = [
    p('key'),
    s('-'),
    p('key'),
    s('-'),
    w(),
    s('-'),
    w(),
]

const segmentsOptional: (TParsedSegmentStatic | TParsedSegmentParametric)[] = [
    p('key'),
    s('-'),
    p('key'),
    s('-'),
    po('opt'),
    s('-'),
    wo(),
    s('/'),
    po('opt2'),
]

const segmentsOptional2: (TParsedSegmentStatic | TParsedSegmentParametric)[] = [
    s('/start/'),
    po('v1'),
    s('/'),
    po('v2'),
    s('/'),
    wo('([^-]*)'),
    s('-'),
    po('v3'),
]

describe('match-utils->generateFullMatchRegex', () => {
    it('must generate Full Match Regex with vars', () => {
        expect(generateFullMatchRegex(segments)).toEqual(
            'static([^\\/]*)\\-(.*)',
        )
    })
    it('must generate Full Match Regex with multi vars', () => {
        expect(generateFullMatchRegex(segmentsMulti)).toEqual(
            '([^\\/]*)\\-([^\\/]*)\\-(.*)\\-(.*)',
        )
    })
    it('must generate Full Match Regex for optional vars', () => {
        expect(generateFullMatchRegex(segmentsOptional)).toEqual(
            '([^\\/]*)\\-([^\\/]*)\\-([^\\/]*)?\\-?(.*)?\\/?([^\\/]*)?',
        )
        expect(generateFullMatchRegex(segmentsOptional2)).toEqual(
            '\\/start\\/?([^\\/]*)?\\/?([^\\/]*)?\\/?([^-]*)?\\-?([^\\/]*)?',
        )
    })
})

describe('match-utils->generateFullMatchFunc', () => {
    const utils = {
        safeDecodeURIComponent: (s: string) => s,
        // safeDecodeURIComponentWithPercent: (s: string) => s,
    }
    it('must generate working function with VAR and WILDCARD', () => {
        const func = generateFullMatchFunc(segments)
        const params: Record<string, string> = {}

        expect(typeof func === 'function')

        func('staticvalue-wildcard', params, utils)

        expect(Object.keys(params)).toEqual(['key', '*'])
        expect(params.key).toEqual('value')
        expect(params['*']).toEqual('wildcard')
    })

    it('must generate working function with multi-VAR and multi-WILDCARD', () => {
        const func = generateFullMatchFunc(segmentsMulti)
        const params: Record<string, string[]> = {}

        expect(typeof func === 'function')

        func('val1-val2-wild1-wild2', params, utils)

        expect(Object.keys(params)).toEqual(['key', '*'])
        expect(params.key.length).toEqual(2)
        expect(params.key[0]).toEqual('val1')
        expect(params.key[1]).toEqual('val2')
        expect(params.key.length).toEqual(2)
        expect(params['*'][0]).toEqual('wild1')
        expect(params['*'][1]).toEqual('wild2')
    })

    it('must generate working function with optional vars', () => {
        const func = generateFullMatchFunc(segmentsOptional2)
        const params: Record<string, string[]> = {}

        expect(typeof func === 'function')

        func('/start/1/2/9-3', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toEqual('1')
        expect(params.v2).toEqual('2')
        expect(params['*']).toEqual('9')
        expect(params.v3).toEqual('3')

        func('/start/1/2/9/5/4/2/1/-3', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toEqual('1')
        expect(params.v2).toEqual('2')
        expect(params['*']).toEqual('9/5/4/2/1/')
        expect(params.v3).toEqual('3')

        func('/start/1/2/9-', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toEqual('1')
        expect(params.v2).toEqual('2')
        expect(params['*']).toEqual('9')
        expect(params.v3).toBeUndefined()

        func('/start/1/2/9', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toEqual('1')
        expect(params.v2).toEqual('2')
        expect(params['*']).toEqual('9')
        expect(params.v3).toBeUndefined()

        func('/start/1/2', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toEqual('1')
        expect(params.v2).toEqual('2')
        expect(params['*']).toBeUndefined()
        expect(params.v3).toBeUndefined()

        func('/start/5', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toEqual('5')
        expect(params.v2).toBeUndefined()
        expect(params['*']).toBeUndefined()
        expect(params.v3).toBeUndefined()

        func('/start/', params, utils)
        expect(Object.keys(params)).toEqual(['v1', 'v2', '*', 'v3'])
        expect(params.v1).toBeUndefined()
        expect(params.v2).toBeUndefined()
        expect(params['*']).toBeUndefined()
        expect(params.v3).toBeUndefined()
    })
})
