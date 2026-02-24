import { describe, it, expect, vi } from 'vitest'
import {
    EPathSegmentType,
    TParsedSegmentParametric,
    TParsedSegmentStatic,
} from '../parser/p-types'
import { compileBucketMatcher, compileIndividualMatchers, generateFullMatchFunc, generateFullMatchRegex } from './match-utils'
import { TProstoParamsType, TProstoRoute } from './router.types'
import { parsePath } from '../parser'

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

// Helper to build a minimal TProstoRoute from a path string
function makeRoute(path: string): TProstoRoute<unknown, unknown> {
    const segments = parsePath(path)
    const lengths = segments.map((seg) =>
        seg.type === EPathSegmentType.STATIC ? seg.value.length : 0,
    )
    return {
        method: 'GET',
        options: {},
        path,
        handlers: [],
        isStatic: false,
        isParametric: true,
        isOptional: false,
        isWildcard: false,
        segments,
        generalized: '',
        lengths,
        minLength: lengths.reduce((a, b) => a + b, 0),
        firstLength: lengths[0],
        firstStatic: segments[0]?.value ?? '',
        fullMatch: () => null,
        pathBuilder: () => '',
    }
}

describe('compileBucketMatcher fallback to compileIndividualMatchers', () => {
    const routes = [
        makeRoute('/api/users/:userId'),
        makeRoute('/api/projects/:projectId'),
        makeRoute('/api/teams/:teamId'),
    ]

    it('compileIndividualMatchers matches and extracts params correctly', () => {
        const matcher = compileIndividualMatchers(routes, false)

        const params1: TProstoParamsType = {}
        const result1 = matcher('/api/users/john', params1)
        expect(result1).toBe(routes[0])
        expect(params1.userId).toBe('john')

        const params2: TProstoParamsType = {}
        const result2 = matcher('/api/projects/proj42', params2)
        expect(result2).toBe(routes[1])
        expect(params2.projectId).toBe('proj42')

        const params3: TProstoParamsType = {}
        const result3 = matcher('/api/teams/alpha', params3)
        expect(result3).toBe(routes[2])
        expect(params3.teamId).toBe('alpha')

        const params4: TProstoParamsType = {}
        const result4 = matcher('/api/unknown/123', params4)
        expect(result4).toBeNull()
    })

    it('compileIndividualMatchers produces same results as compileBucketMatcher', () => {
        const masterMatcher = compileBucketMatcher(routes, false)
        const fallbackMatcher = compileIndividualMatchers(routes, false)

        const testPaths = [
            '/api/users/john',
            '/api/projects/proj42',
            '/api/teams/alpha',
            '/api/unknown/123',
            '/completely/different',
        ]

        for (const path of testPaths) {
            const masterParams: TProstoParamsType = {}
            const fallbackParams: TProstoParamsType = {}
            const masterResult = masterMatcher(path, masterParams)
            const fallbackResult = fallbackMatcher(path, fallbackParams)
            expect(fallbackResult).toBe(masterResult)
            if (masterResult) {
                expect(fallbackParams).toEqual(masterParams)
            }
        }
    })

    it('compileBucketMatcher falls back when RegExp constructor throws', () => {
        const OrigRegExp = globalThis.RegExp
        const spy = vi.spyOn(globalThis, 'RegExp').mockImplementation(
            function (this: RegExp, pattern: string | RegExp, flags?: string) {
                const str = String(pattern)
                // Let individual route regexes through, block only the master alternation
                if (str.startsWith('^(?:') && str.includes('|')) {
                    throw new Error('simulated: regex too large')
                }
                return new OrigRegExp(pattern, flags!)
            } as unknown as typeof RegExp,
        )

        try {
            const matcher = compileBucketMatcher(routes, false)

            const params: TProstoParamsType = {}
            const result = matcher('/api/users/jane', params)
            expect(result).toBe(routes[0])
            expect(params.userId).toBe('jane')

            const params2: TProstoParamsType = {}
            const result2 = matcher('/api/projects/xyz', params2)
            expect(result2).toBe(routes[1])
            expect(params2.projectId).toBe('xyz')

            const params3: TProstoParamsType = {}
            expect(matcher('/no/match', params3)).toBeNull()
        } finally {
            spy.mockRestore()
        }
    })
})
