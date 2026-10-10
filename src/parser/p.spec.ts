import { describe, it, expect } from 'vitest'
import { parsePath } from '.'
import { EPathSegmentType, TParsedSegmentParametric } from './p-types'

describe('path-parser', () => {
    it('must parse simple STATIC path', () => {
        const segments = parsePath('static/static2')
        expect(segments.length).toEqual(1)
        expect(segments[0].value).toEqual('static/static2')
        expect(segments[0].type).toEqual(EPathSegmentType.STATIC)
    })

    it('must parse simple VAR path', () => {
        const segments = parsePath(':varName')
        expect(segments.length).toEqual(1)
        expect(segments[0].value).toEqual('varName')
        expect(segments[0].type).toEqual(EPathSegmentType.VARIABLE)
        expect((segments[0] as TParsedSegmentParametric).regex).toEqual(
            '([^\\/]*)',
        )
    })

    it('must parse simple VAR path with REGEX', () => {
        const segments = parsePath(':varName(\\d+)')
        expect(segments.length).toEqual(1)
        expect(segments[0].value).toEqual('varName')
        expect(segments[0].type).toEqual(EPathSegmentType.VARIABLE)
        expect((segments[0] as TParsedSegmentParametric).regex).toEqual(
            '(\\d+)',
        )
    })

    it('must parse simple VAR-VAR path', () => {
        const segments = parsePath(':var1-:var2')
        expect(segments.length).toEqual(3)
        expect(segments[0].value).toEqual('var1')
        expect(segments[0].type).toEqual(EPathSegmentType.VARIABLE)

        expect(segments[1].value).toEqual('-')
        expect(segments[1].type).toEqual(EPathSegmentType.STATIC)

        expect(segments[2].value).toEqual('var2')
        expect(segments[2].type).toEqual(EPathSegmentType.VARIABLE)
    })

    it('must parse simple WILDCARD path', () => {
        const segments = parsePath('*')
        expect(segments.length).toEqual(1)
        expect(segments[0].value).toEqual('*')
        expect(segments[0].type).toEqual(EPathSegmentType.WILDCARD)
        expect((segments[0] as TParsedSegmentParametric).regex).toEqual('(.*)')
    })

    it('must parse complex path', () => {
        const segments = parsePath('static/static2/:var1/static3/:var2(\\d+)*')
        expect(segments.length).toEqual(5)

        expect(segments[0].value).toEqual('static/static2/')
        expect(segments[0].type).toEqual(EPathSegmentType.STATIC)

        expect(segments[1].value).toEqual('var1')
        expect(segments[1].type).toEqual(EPathSegmentType.VARIABLE)
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual(
            '([^\\/]*)',
        )

        expect(segments[2].value).toEqual('/static3/')
        expect(segments[2].type).toEqual(EPathSegmentType.STATIC)

        expect(segments[3].value).toEqual('var2')
        expect(segments[3].type).toEqual(EPathSegmentType.VARIABLE)
        expect((segments[3] as TParsedSegmentParametric).regex).toEqual(
            '(\\d+)',
        )

        expect(segments[4].value).toEqual('*')
        expect(segments[4].type).toEqual(EPathSegmentType.WILDCARD)
        expect((segments[4] as TParsedSegmentParametric).regex).toEqual('(.*)')
    })

    it('must parse complex path with multiple Wildcards', () => {
        const segments = parsePath('start/*/end/*')
        expect(segments.length).toEqual(4)

        expect(segments[0].value).toEqual('start/')
        expect(segments[0].type).toEqual(EPathSegmentType.STATIC)

        expect(segments[1].value).toEqual('*')
        expect(segments[1].type).toEqual(EPathSegmentType.WILDCARD)
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual('(.*)')

        expect(segments[2].value).toEqual('/end/')
        expect(segments[2].type).toEqual(EPathSegmentType.STATIC)

        expect(segments[3].value).toEqual('*')
        expect(segments[3].type).toEqual(EPathSegmentType.WILDCARD)
        expect((segments[3] as TParsedSegmentParametric).regex).toEqual('(.*)')
    })

    it('must throw error if regex is broken', () => {
        expect(() => {
            parsePath('/static/:key(blabla')
        }).toThrowError()
    })

    it('must name the route path in a parse error', () => {
        expect(() => parsePath('/static/:key(blabla')).toThrowError(
            'Invalid route path "/static/:key(blabla": Unclosed node "RegEx"',
        )
    })

    it('must escape regex groups and skip escaped braces', () => {
        const segments = parsePath('/static/:key(bl(a\\(in(?:.+)ner\\)b)la)')
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual(
            '(bl(?:a\\(in(?:.+)ner\\)b)la)',
        )
    })

    it('must allow escaping colon (\\:)', () => {
        const segments = parsePath('/static/colon\\:path/')
        expect(segments[0].value).toEqual('/static/colon:path/')
    })

    it('must remove ^ from regex', () => {
        const segments = parsePath('/static/:var(^ab\\^cd)/')
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual(
            '(ab\\^cd)',
        )
    })

    it('must remove $ from regex', () => {
        const segments = parsePath('/static/:var(ab\\$cd$)/')
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual(
            '(ab\\$cd)',
        )
    })

    it('must parse parametric path with optional parameter', () => {
        const segments = parsePath('/optional-param/:a(\\d+)?/:b?/:c?/*?')
        expect((segments[1] as TParsedSegmentParametric).name).toEqual('a')
        expect((segments[1] as TParsedSegmentParametric).value).toEqual('a')
        expect((segments[1] as TParsedSegmentParametric).optional).toEqual(true)
        expect((segments[3] as TParsedSegmentParametric).name).toEqual('b')
        expect((segments[3] as TParsedSegmentParametric).value).toEqual('b')
        expect((segments[3] as TParsedSegmentParametric).optional).toEqual(true)
        expect((segments[5] as TParsedSegmentParametric).name).toEqual('c')
        expect((segments[5] as TParsedSegmentParametric).optional).toEqual(true)
        expect((segments[7] as TParsedSegmentParametric).name).toEqual('*')
        expect((segments[7] as TParsedSegmentParametric).type).toEqual(3)
        expect((segments[7] as TParsedSegmentParametric).optional).toEqual(true)
    })

    it('must close a param right after its regex group', () => {
        expect(parsePath('/:a(x)(y)')).toEqual([
            { type: 0, value: '/' },
            { type: 1, value: 'a', regex: '(x)', name: 'a' },
            { type: 0, value: '(y)' },
        ])
        expect(parsePath('/*(x)*')).toEqual([
            { type: 0, value: '/' },
            { type: 3, value: '*', regex: '(x)', name: '*' },
            { type: 3, value: '*', regex: '(.*)', name: '*' },
        ])
    })

    it('must consume a single optional marker after a regex group', () => {
        expect(parsePath('/:a(x)?y')).toEqual([
            { type: 0, value: '/' },
            { type: 1, value: 'a', regex: '(x)', name: 'a', optional: true },
            { type: 0, value: 'y' },
        ])
        expect(parsePath('/*??')).toEqual([
            { type: 0, value: '/' },
            { type: 3, value: '*', regex: '(.*)', name: '*', optional: true },
            { type: 0, value: '?' },
        ])
        // name already marked optional: the marker after the group stays static
        expect(parsePath('/:a?(x)?')).toEqual([
            { type: 0, value: '/' },
            { type: 1, value: 'a', regex: '(x)', name: 'a', optional: true },
            { type: 0, value: '?' },
        ])
    })

    it('must treat an even number of backslashes as not escaping', () => {
        expect(
            (parsePath('/:a(\\\\)')[1] as TParsedSegmentParametric).regex,
        ).toEqual('(\\\\)')
        expect(() => parsePath('/:a(x\\\\\\)')).toThrowError()
    })

    it('must make nested groups non-capturing', () => {
        expect(
            (parsePath('/:a((b)(?:c))')[1] as TParsedSegmentParametric).regex,
        ).toEqual('((?:b)(?:c))')
    })

    it('must leave value undefined for a nameless param', () => {
        const [, seg] = parsePath('/:(x)') as TParsedSegmentParametric[]
        expect(seg.name).toEqual('')
        expect(seg.value).toBeUndefined()
        expect(seg.regex).toEqual('(x)')
    })
})
