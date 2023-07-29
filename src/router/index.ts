export * from './router.types'
import { ProstoCache } from '@prostojs/cache'
import { parsePath } from '../parser'
import { EPathSegmentType, TParsedSegmentParametric } from '../parser/p-types'
import { safeDecodeURI, safeDecodeURIComponent } from '../utils/decode'
import { countOfSlashes } from '../utils/strings'
import { generateFullMatchFunc, generatePathBuilder } from './match-utils'
import { THttpMethod, TProstoRouteHandler, TProstoRouterMainIndex, TProstoRoute, TProstoRoutsRegistry,
    TProstoParamsType, TProstoRouterPathBuilder,
    TProstoRouterMethodIndex, TProstoLookupResult, TProstoRouterOptions, TProstoRouteOptions } from './router.types'
import { ProstoTree } from '@prostojs/tree'
import { banner } from '../utils/banner'
import { TProstoRouteMatchFunc } from './router.types'

const methods: THttpMethod[] = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

const matcherFuncUtils = {
    safeDecodeURIComponent,
}

type TProstoRouterCache = {
    [method in THttpMethod]: ProstoCache
}
export class ProstoRouter<BaseHandlerType = TProstoRouteHandler> {
    protected readonly _options: TProstoRouterOptions

    protected cache?: TProstoRouterCache

    constructor(_options?: Partial<TProstoRouterOptions>) {
        this._options = {
            ..._options,
        }
        if (!this._options.silent) {
            consoleInfo('The Router Initialized')
        }
        const cacheOpts = {
            limit: _options?.cacheLimit || 0,
        }
        if (_options?.cacheLimit) {
            this.cache = {
                GET: new ProstoCache<TProstoLookupResult>(cacheOpts),
                PUT: new ProstoCache<TProstoLookupResult>(cacheOpts),
                POST: new ProstoCache<TProstoLookupResult>(cacheOpts),
                PATCH: new ProstoCache<TProstoLookupResult>(cacheOpts),
                DELETE: new ProstoCache<TProstoLookupResult>(cacheOpts),
                HEAD: new ProstoCache<TProstoLookupResult>(cacheOpts),
                OPTIONS: new ProstoCache<TProstoLookupResult>(cacheOpts),
            }
        }
    }

    protected refreshCache(method: THttpMethod | '*') {
        if (this._options.cacheLimit && this.cache) {
            if (method === '*') {
                this.cache.GET.reset()
                this.cache.PUT.reset()
                this.cache.POST.reset()
                this.cache.PATCH.reset()
                this.cache.DELETE.reset()
                this.cache.HEAD.reset()
                this.cache.OPTIONS.reset()
            } else if (this.cache && this.cache[method]) {
                this.cache[method].reset()
            }
        }
    }

    protected root: TProstoRouterMainIndex = {}

    protected routes: TProstoRoute<unknown, unknown>[] = []

    protected routesRegistry: TProstoRoutsRegistry<unknown, unknown> = {}

    protected registerRoute<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(
        method: THttpMethod,
        path: string,
        options: TProstoRouteOptions,
        handler: HandlerType
    ): TProstoRouterPathHandle<ParamsType> {
        // if (this._options.logLevel >= EProstoLogLevel.DEBUG) {
        //     this.logger.debug('Register route ' + method + ': ' + path)
        // }
        this.refreshCache(method)
        const opts = this.mergeOptions(options)
        const normalPath = ('/' + path)
            .replace(/^\/\//, '/')
            .replace(/\/$/, '')
            .replace(/%/g, '%25') // <-- workaround to avoid double decoding
        const { root } = this
        const segments = parsePath(normalPath)
        if (!root[method]) {
            root[method] = {
                statics: {},
                parametrics: {
                    byParts: [],
                },
                wildcards: [],
            }
        }
        const rootMethod = root[method] as TProstoRouterMethodIndex
        const generalized = method + ':' + segments.map(s => {
            switch (s.type) {
                case EPathSegmentType.STATIC: return s.value
                case EPathSegmentType.VARIABLE: return '<VAR' + (s.regex === '([^-\\/]*)' ? '' : s.regex) + '>'
                case EPathSegmentType.WILDCARD: return s.value
            }
        }).join('')
        let route: TProstoRoute<HandlerType, ParamsType> = this.routesRegistry[generalized] as TProstoRoute<HandlerType, ParamsType>
        if (route) {
            if (this._options.disableDuplicatePath) {
                const error = `Attempt to register duplicated path: "${path}". Duplicate paths are disabled.\nYou can enable duplicated paths removing 'disableDuplicatePath' option.`
                consoleError(error)
                throw new Error(error)
            }
            if (route.handlers.includes(handler)) {
                // if (this._options.logLevel >= EProstoLogLevel.ERROR) {
                consoleError('Duplicate route with same handler ignored ' + generalized)
                // }
            } else {
                // if (this._options.logLevel >= EProstoLogLevel.WARN) {
                consoleWarn('Duplicate route registered ' + generalized)
                // }
                route.handlers.push(handler)
            }
        } else {
            const isStatic = segments.length === 1 && segments[0].type === EPathSegmentType.STATIC || segments.length === 0
            const isParametric = !!segments.find(p => p.type === EPathSegmentType.VARIABLE)
            const firstOptional = segments.findIndex(p => (p as TParsedSegmentParametric).optional)
            const isOptional = firstOptional >= 0
            const isWildcard = !!segments.find(p => p.type === EPathSegmentType.WILDCARD)
            const lengths = segments.slice(0, firstOptional >= 0 ? firstOptional : undefined).map(s => s.type === EPathSegmentType.STATIC ? s.value.length : 0)
            const normalPathCase = segments[0] ? (this._options.ignoreCase ? segments[0].value.toLowerCase() : segments[0].value) : '/'
            this.routesRegistry[generalized] = route = {
                method,
                options: opts,
                path: normalPath,
                handlers: [handler],
                isStatic,
                isParametric,
                isOptional,
                isWildcard,
                segments,
                lengths,
                minLength: lengths.reduce((a, b) => a + b, 0),
                firstLength: lengths[0],
                firstStatic: normalPathCase.slice(0, lengths[0]),
                generalized,
                fullMatch: generateFullMatchFunc<unknown>(segments, this._options.ignoreCase),
                pathBuilder: generatePathBuilder<unknown>(segments),
            }
            this.routes.push(route as TProstoRoute<unknown, unknown>)
            if (route.isStatic) {
                // static is straight forward
                rootMethod.statics[normalPathCase] = route as TProstoRoute<unknown, unknown>
            } else {
                // dynamic
                if (route.isParametric && !route.isWildcard && !route.isOptional) {
                    const countOfParts = route.segments
                        .filter(s => s.type === EPathSegmentType.STATIC)
                        .map(s => countOfSlashes(s.value)).reduce((a, b) => a + b, 1)  
                    const byParts = rootMethod.parametrics.byParts[countOfParts] = rootMethod.parametrics.byParts[countOfParts] || []
                    byParts.push(route as TProstoRoute<unknown, unknown>)
                    rootMethod.parametrics.byParts[countOfParts] = byParts.sort(routeSorter)
                } else if (route.isWildcard || route.isOptional) {
                    rootMethod.wildcards.push(route as TProstoRoute<unknown, unknown>)
                    rootMethod.wildcards = rootMethod.wildcards.sort(routeSorter)
                }
            }
        }
        return {
            getPath: route.pathBuilder,
            getArgs: () => route.segments.filter(p => p.type === EPathSegmentType.VARIABLE || p.type === EPathSegmentType.WILDCARD).map(s => (s as TParsedSegmentParametric).name),
            getStaticPart: () => route.firstStatic,
            test: route.fullMatch,
            isStatic: route.isStatic,
            isParametric: route.isParametric,
            isWildcard: route.isWildcard,
            generalized,
        }
    }

    protected mergeOptions(options: TProstoRouteOptions): TProstoRouteOptions {
        return {
            ...options,
        }
    }

    protected sanitizePath(path: string, ignoreTrailingSlash?: boolean) {
        const end = path.indexOf('?')
        let slicedPath = end >= 0 ? path.slice(0, end) : path
        if ((ignoreTrailingSlash || this._options.ignoreTrailingSlash) && slicedPath[slicedPath.length - 1] === '/') {
            slicedPath = slicedPath.slice(0, slicedPath.length - 1)
        }
        const normalPath = safeDecodeURI(
            slicedPath
                .replace(/%25/g, '%2525') // <-- workaround to avoid double decoding
        )
        return {
            normalPath,
            normalPathWithCase: this._options.ignoreCase ? normalPath.toLowerCase() : normalPath,
        }
    }

    public lookup<HandlerType = BaseHandlerType>(method: THttpMethod, path: string, ignoreTrailingSlash?: boolean): TProstoLookupResult<HandlerType> | void {
        // if (this._options.logLevel >= EProstoLogLevel.DEBUG) {
        //     this.logger.debug('Lookup route ' + method + ': ' + path)
        // }
        if (this._options.cacheLimit && this.cache && this.cache[method]) {
            const cached = this.cache[method].get(path) as TProstoLookupResult<HandlerType>
            if (cached) return cached
        }
        const { normalPath, normalPathWithCase } = this.sanitizePath(path, ignoreTrailingSlash)
        const rootMethod = this.root[method]
        const lookupResult: TProstoLookupResult<HandlerType> = {
            route: null as unknown as TProstoRoute<HandlerType>,
            ctx: { params: {} },
        }
        const cache = (result: TProstoLookupResult<HandlerType>): TProstoLookupResult<HandlerType> => {
            // if (this._options.logLevel >= EProstoLogLevel.DEBUG) {
            //     this.logger.debug('Route found  ' + method + ': ' + lookupResult.route.path, lookupResult.ctx.params)
            // }
            if (this._options.cacheLimit && this.cache && this.cache[method]) {
                this.cache[method].set(path, result)
            }
            return result
        }
        if (rootMethod) {
            lookupResult.route = rootMethod.statics[normalPathWithCase] as TProstoRoute<HandlerType>
            if (lookupResult.route) return cache(lookupResult)
            const pathSegmentsCount = countOfSlashes(normalPath) + 1
            const pathLength = normalPath.length
            const { parametrics } = rootMethod
            const bySegments = parametrics.byParts[pathSegmentsCount]
            if (bySegments) {
                for (let i = 0; i < bySegments.length; i++) {
                    lookupResult.route = bySegments[i] as TProstoRoute<HandlerType>
                    if (pathLength >= lookupResult.route.minLength) {
                        if (normalPathWithCase.startsWith(lookupResult.route.firstStatic)
                            && lookupResult.route.fullMatch(normalPath, lookupResult.ctx.params, matcherFuncUtils)) {
                            return cache(lookupResult)
                        }
                    }
                }
            }
            const { wildcards } = rootMethod
            for (let i = 0; i < wildcards.length; i++) {
                lookupResult.route = wildcards[i] as TProstoRoute<HandlerType>
                if (pathLength >= lookupResult.route.minLength) {
                    if (normalPathWithCase.startsWith(lookupResult.route.firstStatic)
                        && lookupResult.route.fullMatch(normalPath, lookupResult.ctx.params, matcherFuncUtils)) {
                        return cache(lookupResult)
                    }
                }
            }
        }
        // if (this._options.logLevel >= EProstoLogLevel.DEBUG) {
        //     this.logger.debug('Route not found ' + method + ': ' + path)
        // }
    }

    public find(method: THttpMethod, path: string) {
        return this.lookup(method, path)
    }

    public on<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(
        method: THttpMethod | '*',
        path: string,
        options: TProstoRouteOptions | HandlerType,
        handler?: HandlerType
    ): TProstoRouterPathHandle<ParamsType> {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        if (method === '*') {
            return methods.map(m => this.registerRoute<ParamsType, HandlerType>(m, path, opts, func))[0]
        }
        return this.registerRoute<ParamsType, HandlerType>(method, path, opts, func)
    }

    public all<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('*', path, opts, func)
    }

    public get<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('GET', path, opts, func)
    }

    public put<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('PUT', path, opts, func)
    }

    public post<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('POST', path, opts, func)
    }

    public patch<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('PATCH', path, opts, func)
    }

    public delete<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('DELETE', path, opts, func)
    }

    public options<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('OPTIONS', path, opts, func)
    }

    public head<ParamsType = TProstoParamsType, HandlerType = BaseHandlerType>(path: string, options: TProstoRouteOptions | HandlerType, handler?: HandlerType) {
        const { opts, func } = extractOptionsAndHandler<HandlerType>(options, handler)
        return this.on<ParamsType, HandlerType>('HEAD', path, opts, func)
    }

    public getRoutes() {
        return this.routes
    }

    public toTree() {
        const rootStyle = (v: string) => __DYE_BOLD__ + v + __DYE_BOLD_OFF__
        const paramStyle = (v: string) => __DYE_CYAN__ + __DYE_BOLD__ + ':' + v + __DYE_COLOR_OFF__ + __DYE_BOLD_OFF__
        const regexStyle = (v: string) => __DYE_CYAN__ + __DYE_DIM__ + v + __DYE_DIM_OFF__ + __DYE_COLOR_OFF__
        const handlerStyle = (v: string) => __DYE_BOLD__ + __DYE_GREEN_BRIGHT__ + '→ ' + __DYE_COLOR_OFF__ + __DYE_BOLD_OFF__ + v
        const methodStyle = (v: string) => __DYE_DIM_OFF__ + __DYE_GREEN_BRIGHT__ + '• (' + v + ') ' + __DYE_COLOR_OFF__
        type TreeData = {
            label: string
            stylist?: (v: string) => string
            methods: THttpMethod[]
            children: TreeData[]
        }
        const data: TreeData = {
            label: '⁕ Router',
            stylist: rootStyle,
            methods: [],
            children: [],
        }

        function toChild(d: TreeData, label: string, stylist?: (v: string) => string) {
            let found = d.children.find(c => c.label === label)
            if (!found) {
                found = {
                    label,
                    stylist,
                    methods: [],
                    children: [],
                }
                d.children.push(found)
            }
            return found
        }

        this.routes.sort((a, b) => a.path > b.path ? 1 : -1).forEach(route => {
            let cur: TreeData = data
            let last = ''
            route.segments.forEach(s => {
                let parts
                switch (s.type) {
                    case EPathSegmentType.STATIC:
                        parts = s.value.split('/')
                        last += parts.shift()
                        for (let i = 0; i < parts.length; i++) {
                            if (last) {
                                cur = toChild(cur, last)
                            }
                            last = '/' + parts[i]
                        }
                        break
                    case EPathSegmentType.VARIABLE: 
                    case EPathSegmentType.WILDCARD:
                        last += `${ paramStyle(s.value) }${ regexStyle(s.regex) }`
                }
            })
            if (last) {
                cur = toChild(cur, last, handlerStyle)
                cur.methods.push(route.method)
            }
        })
        new ProstoTree<TreeData>({
            renderLabel: (node: TreeData, behind: string) => {
                const styledLabel = node.stylist ? node.stylist(node.label) : node.label
                if (node.methods.length) {
                    return styledLabel + '\n' + behind + node.methods.map(m => methodStyle(m)).join('\n' + behind)
                }
                return styledLabel
            },
        }).print(data)
    }
}

function extractOptionsAndHandler<HandlerType = TProstoRouteHandler>(options: TProstoRouteOptions | HandlerType, handler?: HandlerType | undefined) {
    let opts: TProstoRouteOptions = {}
    let func: HandlerType = handler as HandlerType
    if (typeof options === 'function') {
        func = options as HandlerType
    } else {
        opts = options as TProstoRouteOptions
    }
    return { opts, func }
}

function routeSorter(a: TProstoRoute<unknown>, b: TProstoRoute<unknown>): number {
    if (a.isWildcard !== b.isWildcard) {
        return a.isWildcard ? 1 : -1
    }
    const len = b.minLength - a.minLength
    if (len) return len
    for (let i = 0; i < a.lengths.length; i++) {
        // sort routes by length of each static segment
        const len = b.lengths[i] - a.lengths[i]
        if (len) return len
    }
    return 0
}

function consoleError(v: string) {
    console.info(__DYE_RED_BRIGHT__ + banner() + v + __DYE_COLOR_OFF__)
}

function consoleWarn(v: string) {
    console.info(__DYE_YELLOW__ + banner() + v + __DYE_COLOR_OFF__)
}

function consoleInfo(v: string) {
    console.info(__DYE_GREEN__ + __DYE_DIM__ + banner() + v + __DYE_COLOR_OFF__ + __DYE_DIM_OFF__)
}

export interface TProstoRouterPathHandle<ParamsType = TProstoParamsType> {
    /**
     * Path builder for the route
     * @param args - arguments of the path
     * @return string
     */
    getPath: TProstoRouterPathBuilder<ParamsType>

    /**
     * Provides static part of the path (before first var)
     * @returns string
     */
    getStaticPart: () => string

    /**
     * Provides a list of variables names in the path
     * @returns string[]
     */
    getArgs: () => string[]

    /**
     * Regex test the path to match
     * @param path - string path
     * @returns boolean
     */
    test: TProstoRouteMatchFunc<ParamsType>

    /**
     * true if the path is fully static
     */
    isStatic: boolean

    /**
     * true if the path has variables
     */
    isParametric: boolean

    /**
     * true if the path has widlcard(s)
     */
    isWildcard: boolean

    /**
     * a string with generalized path
     */
    generalized: string
}
