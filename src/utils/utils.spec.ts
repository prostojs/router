import { safeDecodeURIComponent, safeDecodeURI } from './decode'
import { countOfSlashes } from './strings'

describe('utils->safeDecodeURIComponent', () => {
    it('must decode URI', () => {
        const uri = 'some/uri component = 123 ""'
        expect(safeDecodeURIComponent(encodeURIComponent(uri))).toEqual(uri)
        expect(safeDecodeURIComponent('ascii')).toEqual('ascii')
    })

    it('must return initial uri on error', () => {
        const uri = '%fa'
        expect(safeDecodeURIComponent(uri)).toEqual(uri)
    })
})

describe('utils->safeDecodeURI', () => {
    it('must decode URI', () => {
        const uri = 'some/uri c?ompon#ent = 123 ""'
        expect(safeDecodeURI(encodeURI(uri))).toEqual(uri)
        expect(safeDecodeURI('ascii')).toEqual('ascii')
    })

    it('must return initial uri on error', () => {
        const uri = '%fa'
        expect(safeDecodeURI(uri)).toEqual(uri)
    })
})

describe('utils->countOfSlashes', () => {
    it('must calculate count Of Slashes', () => {
        const uri = '/api/some/url'
        expect(countOfSlashes(uri)).toEqual(3)
    })
})
