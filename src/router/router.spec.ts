/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-empty-function */
import { ProstoRouter, THttpMethod, TProstoLookupResult } from '.'
import { TProstoLookupContext } from '..'
import { EProstoLogLevel } from '@prostojs/logger'

const c = {
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}
const router = new ProstoRouter<TTestHandler>({
    logLevel: EProstoLogLevel.DEBUG,
    logger: c,
})
const basicRoutes = [
    '/apiRoot',
    '/apiRoot/nested',
]
const parametricRoutes = [
    // ignore case 
    { r: '/api/user/:userName', check: '/api/user/JOHN', params: { userName: 'JOHN' } },
    { r: '/api/User/:userName/:type', check: '/api/User/JOHN/COMMON', params: { userName: 'JOHN', type: 'COMMON' } },
    { r: '/api/user/:userName-:type', check: '/api/user/ADAM-COMMON2?query=1234', params: { userName: 'ADAM', type: 'COMMON2' } },
    // others
    { r: '/api/time/:h(\\d{2})\\::m(\\d{2})', check: '/api/time/12:44', params: { h: '12', m: '44' } },
    { r: '/api/colon\\:path', check: '/api/colon:path', params: {} },
    { r: '/static/*', check: '/static/any-folder/any-file.md', params: { '*': 'any-folder/any-file.md' } },
    { r: '/static/*.js', check: '/static/only-js-folder/some-file.js', params: { '*': 'only-js-folder/some-file' } },
    { r: '/Static2/*/subfolder/*.exe', check: '/Static2/f1/subfolder/file.exe', params: { '*': ['f1', 'file'] } },
    { r: '/names/:name/:name/:name', check: '/names/John/Samatha/Doe', params: { 'name': ['John', 'Samatha', 'Doe'] } },
    { r: '/widlcard/*(\\d+)', check: '/widlcard/123456', params: { '*': '123456' } },
]
const trickyRoutes = [
    '/api/users/award_winners',
    '/api/users/admins',
    '/api/users/:id',
    '/api/:resourceType/foo',

    '/static/param1',
    '/static/param2',
    '/static/:paramA/next',

    '/test/S/:file(\\S+).png',
    '/test/D/:file(\\D+).png',
]
const encodingCheck = [
    {
        r: '/[...]/a .md',
        checks: [
            '/[...]/a .md',
            '/[...]/a%20.md',
            '/%5B...%5D/a%20.md',
        ],
    }, {
        r: '/[...]/a%20.md',
        checks: [
            '/[...]/a%2520.md',
            '/%5B...%5D/a%2520.md',
        ],
    }, {
        r: '/asset%2f123/test',
        checks: ['/asset%252f123/test'],
    }, {
        r: '/house%2325',
        checks: ['/house%252325'],
    },
]
const orderRoutes = [
    '/order/a:key/a01:key2',
    '/order/a1:key/a0:key2',

    '/order/b1:key/a0:key2',
    '/order/b1:key/a01:key2',

    '/order/c1:key/a0:key2/d1:k',
    '/order/c1:key/a01:key2/d:k',
]
const orderChecks = [
    { check: '/order/a123/a0123', to: orderRoutes[1] },
    { check: '/order/b123/a0123', to: orderRoutes[3] },
    { check: '/order/c123/a0123/d12', to: orderRoutes[5] },
]

const trickyRoutesDoubleEncoding = [
    { r: '/🍌/:id', check: '/%F0%9F%8D%8C/%23', params: { id: '#' } },
    { r: '/2/🍌/:id', check: '/2/%F0%9F%8D%8C/%2523', params: { id: '%23' } },
    { r: '/:id/🍌', check: '/%23/%F0%9F%8D%8C', params: { id: '#' } },
    { r: '/2/:id/🍌', check: '/2/%2523/%F0%9F%8D%8C', params: { id: '%23' } },

    { r: '/test~123/:param', check: '/test~123/%25', params: { param: '%' } },
    { r: '/2/test~123/:param', check: '/2/test%7E123/%2525', params: { param: '%25' } },
    { r: '/3/test~123/:param', check: '/3/test~123/%2525', params: { param: '%25' } },

    { r: '/4/%2F/:param', check: '/4/%252F/1', params: { param: '1' } },

    { r: '/5/:param', check: '/%35/%37', params: { param: '7' } },
    { r: '/52/:param', check: '/%352/%2537', params: { param: '%37' } },
]

type TTestHandler = (ctx: TProstoLookupContext) => void

function callHandler(found: TProstoLookupResult<TTestHandler>) {
    return found.route.handlers[0](found.ctx)
}
function testPath(router: ProstoRouter<TTestHandler>, method: THttpMethod, path: string, correct: string, params?: Record<string, string | string[]>) {
    const found = router.find(method, path) as TProstoLookupResult<TTestHandler>
    expect(found).toBeDefined()
    expect(callHandler(found)).toEqual(correct)
    if (params) {
        expect(Object.keys(found.ctx.params).length).toEqual(Object.keys(params).length)
        Object.keys(params).forEach(key => {
            expect(found.ctx.params).toHaveProperty(key)
            expect(found.ctx.params[key]).toEqual(params[key])
        })
    }
}

describe('ProstoRouter', () => {
    basicRoutes.forEach(r => router.get(r, () => r))
    parametricRoutes.forEach(r => router.get(r.r, () => r.r))
    trickyRoutes.forEach(r => router.get(r, () => r))
    encodingCheck.forEach(r => router.get(r.r, () => r.r))
    orderRoutes.forEach(r => router.get(r, () => r))

    basicRoutes.forEach(r => {
        it('must resolve basic ' + r, () => {
            testPath(router, 'GET', r, r)
        })
    })

    parametricRoutes.forEach(r => {
        it('must resolve parametric ' + r.check + ' -> ' + r.r + ' ' + JSON.stringify(r.params), () => {
            testPath(router, 'GET', r.check, r.r, r.params as unknown as Record<string, string | string[]>)
        })
    })

    trickyRoutes.forEach(r => {
        it('must resolve tricky ' + r, () => {
            testPath(router, 'GET', r, r)
        })
    })

    encodingCheck.forEach(r => {
        r.checks.forEach(c => {
            it('must resolve encoded ' + c + ' -> ' + r.r, () => {
                testPath(router, 'GET', c, r.r)
            })
        })
    })

    orderChecks.forEach(r => {
        it('must be in correct order ' + r.check + ' -> ' + r.to, () => {
            testPath(router, 'GET', r.check, r.to)
        })
    })

    it('must return proper path builder', () => {
        expect(
            router.get('/static/path1',
                () => {})({})
        )
            .toEqual('/static/path1')
        expect(
            router.get('/parametric/path/:var',
                () => {})({ var: 'test' })
        )
            .toEqual('/parametric/path/test')
        expect(
            router.get('/parametric/path/:var/:var2',
                () => {})({ var: 'test', var2: 'test2' })
        )
            .toEqual('/parametric/path/test/test2')
        expect(
            router.get('/parametric/:name/:name/:name',
                () => {})({ name: ['n1', 'n2', 'n3'] })
        )
            .toEqual('/parametric/n1/n2/n3')
        expect(
            router.get('/wild/*',
                () => {})({ '*': 'wild-var' })
        )
            .toEqual('/wild/wild-var')
        expect(
            router.get('/wild/*/more/*',
                () => {})({ '*': ['wild-var', 'moremore'] })
        )
            .toEqual('/wild/wild-var/more/moremore')
    })
})

describe('ProstoRouter ignoreTrailingSlash', () => {
    const router = new ProstoRouter<TTestHandler>({ ignoreTrailingSlash: true, logLevel: EProstoLogLevel.NOTHING, logger: c })
    basicRoutes.forEach(r => router.get(r, () => r))
    parametricRoutes.forEach(r => router.get(r.r, () => r.r))

    basicRoutes.forEach(r => {
        it('must resolve basic ' + r + '/', () => {
            testPath(router, 'GET', r + '/', r)
        })
    })

    parametricRoutes.forEach(r => {
        it('must resolve parametric ' + r.check + '/ -> ' + r.r + ' ' + JSON.stringify(r.params), () => {
            testPath(router, 'GET', r.check + '/', r.r, r.params as unknown as Record<string, string | string[]>)
        })
    })
})

describe('ProstoRouter ignoreCase', () => {
    const router = new ProstoRouter<TTestHandler>({ ignoreCase: true, logLevel: EProstoLogLevel.NOTHING, logger: c })
    basicRoutes.forEach(r => router.get(r, () => r))
    parametricRoutes.forEach(r => router.get(r.r, () => r.r))

    basicRoutes.forEach(r => {
        it('must resolve basic ' + r.toUpperCase(), () => {
            testPath(router, 'GET', r.toUpperCase(), r)
        })
    })

    parametricRoutes.slice(0, 3).forEach(r => {
        it('must resolve parametric ' + r.check.toUpperCase() + ' -> ' + r.r + ' ' + JSON.stringify(r.params), () => {
            testPath(router, 'GET', r.check.toUpperCase(), r.r, r.params as unknown as Record<string, string | string[]>)
        })
    })
})

describe('ProstoRouter shortcuts get, put, post...', () => {
    const methods = [
        'get',
        'put',
        'post',
        'patch',
        'delete',
        'head',
        'options',
    ]

    methods.forEach(m => {
        it('must call ' + m, () => {
            const router = new ProstoRouter()
            // @ts-ignore
            const mock = jest.spyOn(router, 'registerRoute').mockImplementation(() => {})
            const cb = () => 'ok'
            // @ts-ignore
            router[m]('/test', cb)
    
            expect(mock).toHaveBeenCalledWith(m.toUpperCase(), '/test', {}, cb)
        })
    })

    methods.forEach(m => {
        it('must call ' + m + ' with options', () => {
            const router = new ProstoRouter()
            // @ts-ignore
            const mock = jest.spyOn(router, 'registerRoute').mockImplementation(() => {})
            const cb = () => 'ok'
            // @ts-ignore
            router[m]('/test', {}, cb)
    
            expect(mock).toHaveBeenCalledWith(m.toUpperCase(), '/test', {}, cb)
        })
    })
    
    it('must call all', () => {
        const router = new ProstoRouter()
        // @ts-ignore
        const mock = jest.spyOn(router, 'registerRoute').mockImplementation(() => {})
        const cb = () => 'ok'
        // @ts-ignore
        router.all('/all', {}, cb)

        expect(mock).toHaveBeenCalledTimes(7)
    })
})

describe('ProstoRouter duplicate paths', () => {
    const paths = [
        '/abcde/fghij',
        '/abcde/fghij',
        '/123params/:key',
        '/123params/:name',
    ]

    it('must allow/disable duplicate paths', () => {
        const router1 = new ProstoRouter({
            disableDuplicatePath: false,
        })
        const router2 = new ProstoRouter({
            disableDuplicatePath: true,
        })
        router1.get(paths[0], () => paths[0])
        router1.get(paths[1], () => paths[1])

        const found1 = router1.find('GET', paths[0])
        expect(found1).toBeDefined()
        if (found1) {
            expect(found1.route.handlers.length).toEqual(2)
        }

        router2.get(paths[0], () => paths[0])
        router2.get(paths[2], () => paths[2])
        expect(() => {
            router2.get(paths[1], () => paths[1])
        }).toThrowError()
        expect(() => {
            router2.get(paths[3], () => paths[3])
        }).toThrowError()
    })

    it('must ignore duplicate route with same handler', () => {
        const router1 = new ProstoRouter({
            disableDuplicatePath: false,
        })
        const handler = () => {}
        router1.get(paths[0], handler)
        router1.get(paths[1], handler)

        const found1 = router1.find('GET', paths[0])
        expect(found1).toBeDefined()
        if (found1) {
            expect(found1.route.handlers.length).toEqual(1)
            expect(found1.route.handlers[0]).toEqual(handler)
        }
    })
})

describe('ProstoRouter decode url components (find-my-way/issues/234)', () => {
    it('must parse /:param path', () => {
        const router = new ProstoRouter()
        const handler = () => {}
        router.get('/:param', handler)
        
        expect((router.find('GET', '/foo%23bar') as TProstoLookupResult<typeof handler>).ctx.params).toEqual({ param: 'foo#bar' })
        expect((router.find('GET', '/%F0%9F%8D%8C') as TProstoLookupResult<typeof handler>).ctx.params).toEqual({ param: '🍌' })
        expect((router.find('GET', '/%F0%9F%8D%8C-foo') as TProstoLookupResult<typeof handler>).ctx.params).toEqual({ param: '🍌-foo' })
        expect((router.find('GET', '/%F0%9F%8D%8C-foo%23bar') as TProstoLookupResult<typeof handler>).ctx.params).toEqual({ param: '🍌-foo#bar' })
    })
})

describe('ProstoRouter must process tricky double encoded URIs', () => {
    trickyRoutesDoubleEncoding.forEach(r => router.get(r.r, () => r.r))

    trickyRoutesDoubleEncoding.forEach(r => {
        it('must resolve tricky double encoded ' + r.check + ' -> ' + r.r + ' ' + JSON.stringify(r.params), () => {
            testPath(router, 'GET', r.check, r.r, r.params as unknown as Record<string, string | string[]>)
        })
    })
})
