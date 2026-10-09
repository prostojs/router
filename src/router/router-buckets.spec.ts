import { describe, it, expect } from 'vitest'
import { ProstoRouter } from '.'
import { compileBucketMatcher, compileSubBucketedMatcher } from './match-utils'
import {
    TProstoLookupResult,
    TProstoParamsType,
    TProstoRoute,
    TProstoRouterMethodIndex,
    TProstoRouterOptions,
} from './router.types'

type THandler = () => string

function mkRouter(routes: string[], options?: Partial<TProstoRouterOptions>) {
    const router = new ProstoRouter<THandler>({ silent: true, ...options })
    for (const r of routes) router.get(r, () => r)
    return router
}

function resolve(router: ProstoRouter<THandler>, path: string) {
    const found = router.lookup('GET', path) as
        | TProstoLookupResult<THandler>
        | undefined
    return found
        ? { route: found.route.handlers[0](), params: found.ctx.params }
        : undefined
}

function buckets(router: ProstoRouter<THandler>) {
    router.compile()
    const root = (
        router as unknown as {
            root: Record<string, TProstoRouterMethodIndex | undefined>
        }
    ).root
    return root.GET!.parametrics.byParts
}

const many = (n: number, f: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => f(i))

describe('lookup params isolation (no leaks across lookups)', () => {
    it('static route returns a fresh params object per lookup', () => {
        const router = mkRouter(['/static/path'])
        const a = router.lookup('GET', '/static/path')!
        a.ctx.params.injected = 'x'
        const b = router.lookup('GET', '/static/path')!
        expect(b.ctx.params).toEqual({})
        expect(b.ctx.params).not.toBe(a.ctx.params)
        expect(b.ctx).not.toBe(a.ctx)
        expect(b.route).toBe(a.route)
    })

    it('static route params are mutable (not frozen)', () => {
        const router = mkRouter(['/static/path'])
        const a = router.lookup('GET', '/static/path')!
        expect(Object.isFrozen(a.ctx.params)).toBe(false)
        a.ctx.params.k = 'v'
        expect(a.ctx.params.k).toBe('v')
    })

    for (const cacheLimit of [0, 50]) {
        describe(`cacheLimit: ${cacheLimit}`, () => {
            it('parametric params do not leak between lookups', () => {
                const router = mkRouter(['/users/:id'], { cacheLimit })
                const a = router.lookup('GET', '/users/42')!
                expect(a.ctx.params).toEqual({ id: '42' })
                a.ctx.params.id = 'hacked'
                a.ctx.params.extra = 'x'
                const b = router.lookup('GET', '/users/42')!
                expect(b.ctx.params).toEqual({ id: '42' })
                b.ctx.params.id = 'again'
                expect(router.lookup('GET', '/users/42')!.ctx.params).toEqual({
                    id: '42',
                })
            })

            it('repeated-name (array) params do not leak', () => {
                const router = mkRouter(['/n/:name/:name'], { cacheLimit })
                const a = router.lookup('GET', '/n/a/b')!
                ;(a.ctx.params.name as string[]).push('c')
                const b = router.lookup('GET', '/n/a/b')!
                expect(b.ctx.params).toEqual({ name: ['a', 'b'] })
                expect(b.ctx.params.name).not.toBe(a.ctx.params.name)
            })

            it('static params do not leak', () => {
                const router = mkRouter(['/s'], { cacheLimit })
                router.lookup('GET', '/s')!.ctx.params.x = '1'
                expect(router.lookup('GET', '/s')!.ctx.params).toEqual({})
            })

            it('wildcard params do not leak', () => {
                const router = mkRouter(['/files/*'], { cacheLimit })
                router.lookup('GET', '/files/a/b')!.ctx.params['*'] = 'zz'
                expect(router.lookup('GET', '/files/a/b')!.ctx.params).toEqual({
                    '*': 'a/b',
                })
            })

            it('optional params keep undefined keys', () => {
                const router = mkRouter(['/opt/:a?/:b?'], { cacheLimit })
                router.lookup('GET', '/opt/1')
                const r = router.lookup('GET', '/opt/1')!
                expect(Object.keys(r.ctx.params).sort()).toEqual(['a', 'b'])
                expect(r.ctx.params).toEqual({ a: '1', b: undefined })
            })
        })
    }

    it('cached lookups still resolve the same route', () => {
        const router = mkRouter(['/users/:id', '/s'], { cacheLimit: 10 })
        const a = router.lookup('GET', '/users/1')!
        const b = router.lookup('GET', '/users/1')!
        expect(b.route).toBe(a.route)
        expect(router.lookup('GET', '/s')!.route).toBe(
            router.lookup('GET', '/s')!.route,
        )
    })
})

describe('parametric sub-buckets (by leading literal segments)', () => {
    it('resolves every route in a many-route bucket', () => {
        const routes = [
            ...many(200, (i) => `/api/v1/res${i}/:id`),
            ...many(200, (i) => `/api/v1/res${i}/:id/sub/:subId`),
        ]
        const router = mkRouter(routes)
        for (let i = 0; i < 200; i++) {
            expect(resolve(router, `/api/v1/res${i}/${i * 7}`)).toEqual({
                route: `/api/v1/res${i}/:id`,
                params: { id: String(i * 7) },
            })
            expect(resolve(router, `/api/v1/res${i}/a/sub/b`)).toEqual({
                route: `/api/v1/res${i}/:id/sub/:subId`,
                params: { id: 'a', subId: 'b' },
            })
        }
        expect(resolve(router, '/api/v1/res200/1')).toBeUndefined()
        expect(resolve(router, '/api/v2/res1/1')).toBeUndefined()
        expect(resolve(router, '/api/v1/res1/a/sib/b')).toBeUndefined()
    })

    it('keeps priority when a shallow route outranks keyed routes', () => {
        // '/api/:type/long-literal-suffix' has 1 leading literal segment but a
        // longer static part, so it sorts before '/api/resN/:id'
        const routes = [
            ...many(10, (i) => `/api/res${i}/:id`),
            '/api/:type/long-literal-suffix',
            '/api/:type/:id',
        ]
        const router = mkRouter(routes)
        expect(resolve(router, '/api/res3/long-literal-suffix')).toEqual({
            route: '/api/:type/long-literal-suffix',
            params: { type: 'res3' },
        })
        expect(resolve(router, '/api/res3/x')).toEqual({
            route: '/api/res3/:id',
            params: { id: 'x' },
        })
        // unknown leading literal → only shallow routes are candidates
        expect(resolve(router, '/api/other/x')).toEqual({
            route: '/api/:type/:id',
            params: { type: 'other', id: 'x' },
        })
        expect(resolve(router, '/api/other/long-literal-suffix')).toEqual({
            route: '/api/:type/long-literal-suffix',
            params: { type: 'other' },
        })
        expect(resolve(router, '/other/res3/x')).toBeUndefined()
    })

    it('keeps the sorted order inside a sub-bucket', () => {
        const routes = [
            ...many(10, (i) => `/order/k${i}/:id`),
            '/order/k1/a:key',
            '/order/k1/a1:key',
            '/order/k1/:x-:y',
        ]
        const router = mkRouter(routes)
        expect(resolve(router, '/order/k1/a123')).toEqual({
            route: '/order/k1/a1:key',
            params: { key: '23' },
        })
        expect(resolve(router, '/order/k1/a023')).toEqual({
            route: '/order/k1/a:key',
            params: { key: '023' },
        })
        expect(resolve(router, '/order/k1/b-c')).toEqual({
            route: '/order/k1/:x-:y',
            params: { x: 'b', y: 'c' },
        })
        expect(resolve(router, '/order/k1/bc')).toEqual({
            route: '/order/k1/:id',
            params: { id: 'bc' },
        })
    })

    it('param-first routes (no leading literal) stay reachable', () => {
        const routes = [...many(20, (i) => `/r${i}/:id`), '/:tenant/:id']
        const router = mkRouter(routes)
        expect(resolve(router, '/r19/5')!.route).toBe('/r19/:id')
        expect(resolve(router, '/zz/5')).toEqual({
            route: '/:tenant/:id',
            params: { tenant: 'zz', id: '5' },
        })
    })

    it('supports ignoreCase (ASCII and non-ASCII literals)', () => {
        const routes = [
            ...many(10, (i) => `/API/Res${i}/:id`),
            ...many(10, (i) => `/Ärger${i}/:id`),
            ...many(10, (i) => `/ΟΔΟΣ${i}/:id`),
        ]
        const router = mkRouter(routes, { ignoreCase: true })
        expect(resolve(router, '/api/RES3/AbC')).toEqual({
            route: '/API/Res3/:id',
            params: { id: 'AbC' },
        })
        expect(resolve(router, '/ärger4/X')!.route).toBe('/Ärger4/:id')
        expect(resolve(router, '/ÄRGER4/X')!.route).toBe('/Ärger4/:id')
        // σ / ς / Σ are case-insensitively equal for the regex
        expect(resolve(router, '/οδοσ5/1')!.route).toBe('/ΟΔΟΣ5/:id')
        expect(resolve(router, '/οδος5/1')!.route).toBe('/ΟΔΟΣ5/:id')
        const strict = mkRouter(routes)
        expect(resolve(strict, '/api/RES3/AbC')).toBeUndefined()
        expect(resolve(strict, '/API/Res3/AbC')!.route).toBe('/API/Res3/:id')
    })

    it('supports ignoreTrailingSlash', () => {
        const routes = many(10, (i) => `/api/res${i}/:id`)
        const router = mkRouter(routes, { ignoreTrailingSlash: true })
        expect(resolve(router, '/api/res3/1/')).toEqual({
            route: '/api/res3/:id',
            params: { id: '1' },
        })
        const strict = mkRouter(routes)
        expect(resolve(strict, '/api/res3/1/')).toBeUndefined()
        const mixed = mkRouter(routes, {
            ignoreTrailingSlash: true,
            ignoreCase: true,
        })
        expect(mixed.lookup('GET', '/API/res3/1/')!.ctx.params).toEqual({
            id: '1',
        })
    })

    it('keeps the %25 workaround and decodes params', () => {
        const routes = [
            ...many(10, (i) => `/p%20${i}/:id`),
            ...many(10, (i) => `/🍌${i}/:id`),
            ...many(10, (i) => `/test~${i}/:param`),
        ]
        const router = mkRouter(routes)
        expect(resolve(router, '/p%25203/x')).toEqual({
            route: '/p%203/:id',
            params: { id: 'x' },
        })
        expect(resolve(router, '/p 3/x')).toBeUndefined()
        expect(resolve(router, '/%F0%9F%8D%8C2/%23')).toEqual({
            route: '/🍌2/:id',
            params: { id: '#' },
        })
        expect(resolve(router, '/test%7E3/%2525')).toEqual({
            route: '/test~3/:param',
            params: { param: '%25' },
        })
        expect(resolve(router, '/test~3/a%20b')).toEqual({
            route: '/test~3/:param',
            params: { param: 'a b' },
        })
    })

    it('supports custom regex params (leading and trailing)', () => {
        const routes = [
            ...many(10, (i) => `/api/res${i}/:id([^\\/]+)-:n([^\\/]+)`),
            ...many(10, (i) => `/api/res${i}/:id([^\\/]+)`),
            '/:ver(v[^\\/]+)/res/:id',
        ]
        const router = mkRouter(routes)
        expect(resolve(router, '/api/res4/a-b')).toEqual({
            route: '/api/res4/:id([^\\/]+)-:n([^\\/]+)',
            params: { id: 'a', n: 'b' },
        })
        expect(resolve(router, '/api/res4/ab')).toEqual({
            route: '/api/res4/:id([^\\/]+)',
            params: { id: 'ab' },
        })
        expect(resolve(router, '/v2/res/7')).toEqual({
            route: '/:ver(v[^\\/]+)/res/:id',
            params: { ver: 'v2', id: '7' },
        })
        expect(resolve(router, '/x2/res/7')).toBeUndefined()
    })

    it('leaves wildcards and statics untouched', () => {
        const routes = [
            ...many(10, (i) => `/api/res${i}/:id`),
            '/api/res3/*',
            '/api/res3/static',
        ]
        const router = mkRouter(routes)
        expect(resolve(router, '/api/res3/static')!.route).toBe(
            '/api/res3/static',
        )
        expect(resolve(router, '/api/res3/x')!.route).toBe('/api/res3/:id')
        expect(resolve(router, '/api/res3/x/y')).toEqual({
            route: '/api/res3/*',
            params: { '*': 'x/y' },
        })
        expect(resolve(router, '/api/res11/x/y')).toBeUndefined()
    })

    it('works with cacheLimit', () => {
        const routes = many(20, (i) => `/api/res${i}/:id`)
        const router = mkRouter(routes, { cacheLimit: 5 })
        for (let round = 0; round < 3; round++) {
            for (let i = 0; i < 20; i++) {
                expect(resolve(router, `/api/res${i}/${round}`)).toEqual({
                    route: `/api/res${i}/:id`,
                    params: { id: String(round) },
                })
            }
        }
        expect(resolve(router, '/api/res20/1')).toBeUndefined()
    })

    it('handles routes added after the first lookup (recompile)', () => {
        const router = mkRouter(many(10, (i) => `/api/res${i}/:id`))
        expect(resolve(router, '/api/res3/1')!.route).toBe('/api/res3/:id')
        router.get('/api/:any/:id', () => '/api/:any/:id')
        expect(resolve(router, '/api/zzz/1')!.route).toBe('/api/:any/:id')
        expect(resolve(router, '/api/res3/1')!.route).toBe('/api/res3/:id')
    })

    it('matches the single-regex bucket matcher exactly (fuzz)', () => {
        const words = ['api', 'API', 'v1', 'res', 'Res', 'ärg', 'x', 'k1', 'k2']
        let seed = 7
        const rnd = (n: number) => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff
            return seed % n
        }
        const pick = <T>(a: T[]) => a[rnd(a.length)]
        const routes = new Set<string>()
        for (let i = 0; i < 300; i++) {
            const len = 2 + rnd(4)
            const parts: string[] = []
            for (let j = 0; j < len; j++) {
                const roll = rnd(10)
                if (roll < 6) parts.push(pick(words) + (rnd(3) ? '' : rnd(5)))
                else if (roll < 8) parts.push(':p' + j)
                else if (roll < 9) parts.push(pick(words) + '-:q' + j)
                else parts.push(':c' + j + '([^\\/]+)')
            }
            if (!parts.some((p) => p.includes(':'))) parts.push(':last')
            routes.add('/' + parts.join('/'))
        }
        const paths: string[] = []
        for (const r of routes) {
            for (let k = 0; k < 4; k++) {
                const segs = r
                    .slice(1)
                    .split('/')
                    .map((s) => {
                        if (s.includes(':') && !s.endsWith(':last')) {
                            const lit = s.split(':')[0]
                            return lit + pick(['1', 'ab', 'x-y', '', 'API'])
                        }
                        if (s === ':last') return 'z'
                        if (rnd(4) === 0) return pick(words)
                        return rnd(3) === 0 ? s.toUpperCase() : s
                    })
                paths.push('/' + segs.join('/'))
            }
        }

        for (const ignoreCase of [false, true]) {
            const router = mkRouter([...routes], { ignoreCase })
            let compared = 0
            let matched = 0
            for (const [, bucket] of buckets(router)) {
                const ref = compileBucketMatcher(bucket, ignoreCase)
                const sub = compileSubBucketedMatcher(bucket, ignoreCase)
                for (const path of paths) {
                    const p1: TProstoParamsType = {}
                    const p2: TProstoParamsType = {}
                    const r1 = ref(path, p1) as TProstoRoute<unknown> | null
                    const r2 = sub(path, p2) as TProstoRoute<unknown> | null
                    expect(r2?.path, path).toBe(r1?.path)
                    expect(p2, path).toEqual(p1)
                    compared++
                    if (r1) matched++
                }
            }
            expect(compared).toBeGreaterThan(1000)
            expect(matched).toBeGreaterThan(100)
        }
    })
})

describe('empty path segment (current behaviour)', () => {
    // An empty value for a `:param` segment is not matched: the bucket matcher
    // treats the empty capture as the route delimiter, so the lookup falls
    // through (404 unless a wildcard catches it). Documented, not endorsed.
    it('does not match an empty parametric segment', () => {
        const router = mkRouter(['/a/:x', '/a/:x/b/:y'])
        expect(resolve(router, '/a/')).toBeUndefined()
        expect(resolve(router, '/a//b/1')).toBeUndefined()
        expect(resolve(router, '/a/1/b/')).toBeUndefined()
        expect(resolve(router, '/a/1')!.params).toEqual({ x: '1' })
    })

    it('does not try other bucket routes after an empty capture', () => {
        const router = mkRouter(['/a/:x', '/:y/:z'])
        expect(resolve(router, '/a/')).toBeUndefined()
        expect(resolve(router, '/b/')).toBeUndefined()
        expect(resolve(router, '/b/1')!.route).toBe('/:y/:z')
    })

    it('same with sub-buckets active', () => {
        const router = mkRouter(many(10, (i) => `/api/res${i}/:id`))
        expect(resolve(router, '/api/res3/')).toBeUndefined()
        expect(resolve(router, '/api/res3/1')!.params).toEqual({ id: '1' })
    })

    it('an empty wildcard capture is not matched either', () => {
        const router = mkRouter(['/a/:x', '/a/*'])
        expect(resolve(router, '/a/')).toBeUndefined()
        expect(resolve(router, '/a/1/2')).toEqual({
            route: '/a/*',
            params: { '*': '1/2' },
        })
    })
})

describe('per-call ignoreTrailingSlash', () => {
    for (const cacheLimit of [0, 50]) {
        it(`is honoured without router-level options (cacheLimit: ${cacheLimit})`, () => {
            const router = mkRouter(
                [
                    '/static/path',
                    '/users/:id',
                    ...many(10, (i) => `/api/res${i}/:id`),
                ],
                { cacheLimit },
            )
            for (let round = 0; round < 2; round++) {
                expect(
                    router.lookup('GET', '/static/path/', true)?.route.path,
                ).toBe('/static/path')
                expect(
                    router.lookup('GET', '/users/42/?q=1', true)?.ctx.params,
                ).toEqual({ id: '42' })
                expect(
                    router.lookup('GET', '/api/res3/x/', true)?.ctx.params,
                ).toEqual({ id: 'x' })
                // without the flag (or with false) the trailing slash still misses
                expect(router.lookup('GET', '/static/path/')).toBeUndefined()
                expect(
                    router.lookup('GET', '/users/42/', false),
                ).toBeUndefined()
                expect(router.lookup('GET', '/api/res3/x/')).toBeUndefined()
            }
        })
    }

    it('combines with ignoreCase', () => {
        const router = mkRouter(['/Users/:id'], { ignoreCase: true })
        expect(router.lookup('GET', '/users/1/', true)?.ctx.params).toEqual({
            id: '1',
        })
        expect(router.lookup('GET', '/users/1/')).toBeUndefined()
    })

    it('keeps "/" as is', () => {
        const router = mkRouter(['/'])
        expect(router.lookup('GET', '/', true)?.route.path).toBe('')
    })
})
