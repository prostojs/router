import { ProstoCache } from '.'

type TData = string
describe('ProstoCache', () => {
    const strings:TData[] = []

    it('must cache object and remove over limit', async () => {
        const cache = new ProstoCache({ limit: 10 })
        for (let i = 0; i < 20; i++) {
            strings.push(Math.random().toString())
            cache.set(String(i), strings[i])
        }
        await new Promise(resolve => setTimeout(resolve, 2))

        expect(cache.get('0')).toEqual(undefined)
        expect(cache.get('1')).toEqual(undefined)
        expect(cache.get('2')).toEqual(undefined)
        expect(cache.get('3')).toEqual(undefined)
        expect(cache.get('4')).toEqual(undefined)
        expect(cache.get('5')).toEqual(undefined)
        expect(cache.get('6')).toEqual(undefined)
        expect(cache.get('7')).toEqual(undefined)
        expect(cache.get('8')).toEqual(undefined)
        expect(cache.get('9')).toEqual(undefined)
        
        expect(cache.get('10')).toEqual(strings[10])
        expect(cache.get('11')).toEqual(strings[11])
        expect(cache.get('12')).toEqual(strings[12])
        expect(cache.get('13')).toEqual(strings[13])
        expect(cache.get('14')).toEqual(strings[14])
        expect(cache.get('15')).toEqual(strings[15])
        expect(cache.get('16')).toEqual(strings[16])
        expect(cache.get('17')).toEqual(strings[17])
        expect(cache.get('18')).toEqual(strings[18])
        expect(cache.get('19')).toEqual(strings[19])
    })

    it('must cache object and remove over limit', async () => {
        const cache = new ProstoCache({ limit: 10 })
        for (let i = 0; i < 20; i++) {
            strings.push(Math.random().toString())
            cache.set(String(i), strings[i])
        }
        await new Promise(resolve => setTimeout(resolve, 2))
        cache.clean()
        expect(cache.get('16')).toEqual(undefined)
    })

    it('must ignore cache when limit = 0', () => {
        const cache = new ProstoCache({ limit: 0 })
        cache.set('1', '123')
        expect(cache.get('1')).toEqual(undefined)
    })
})
