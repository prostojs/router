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
        expect((segments[0] as TParsedSegmentParametric).regex).toEqual('([^\\/]*)')
    })

    it('must parse simple VAR path with REGEX', () => {
        const segments = parsePath(':varName(\\d+)')
        expect(segments.length).toEqual(1)
        expect(segments[0].value).toEqual('varName')
        expect(segments[0].type).toEqual(EPathSegmentType.VARIABLE)
        expect((segments[0] as TParsedSegmentParametric ).regex).toEqual('(\\d+)')
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
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual('([^\\/]*)')

        expect(segments[2].value).toEqual('/static3/')
        expect(segments[2].type).toEqual(EPathSegmentType.STATIC)

        expect(segments[3].value).toEqual('var2')
        expect(segments[3].type).toEqual(EPathSegmentType.VARIABLE)
        expect((segments[3] as TParsedSegmentParametric).regex).toEqual('(\\d+)')

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

    it('must escape regex groups and skip escaped braces', () => {
        const segments = parsePath('/static/:key(bl(a\\(in(?:.+)ner\\)b)la)')
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual('(bl(?:a\\(in(?:.+)ner\\)b)la)')
    })

    it('must allow escaping colon (\\:)', () => {
        const segments = parsePath('/static/colon\\:path/')
        expect(segments[0].value).toEqual('/static/colon:path/')
    })

    it('must remove ^ from regex', () => {
        const segments = parsePath('/static/:var(^ab\\^cd)/')
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual('(ab\\^cd)')
    })

    it('must remove $ from regex', () => {
        const segments = parsePath('/static/:var(ab\\$cd$)/')
        expect((segments[1] as TParsedSegmentParametric).regex).toEqual('(ab\\$cd)')
    })
})
