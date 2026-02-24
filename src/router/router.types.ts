import { TParsedSegment } from '../parser/p-types'

export type THttpMethod =
    | 'GET'
    | 'PUT'
    | 'POST'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'

export type TProstoParamsType = Record<string, string | string[]>

export interface TProstoLookupContext<ParamsType = TProstoParamsType> {
    params: ParamsType
}

export type TProstoRouteHandler = (...args: undefined[]) => void

export interface TProstoRoute<
    HandlerType = TProstoRouteHandler,
    ParamsType = TProstoParamsType,
> {
    method: THttpMethod
    options: TProstoRouteOptions
    path: string
    handlers: HandlerType[]
    isStatic: boolean
    isParametric: boolean
    isOptional: boolean
    isWildcard: boolean
    segments: TParsedSegment[]
    generalized: string
    lengths: number[]
    minLength: number
    firstLength: number
    firstStatic: string
    fullMatch: TProstoRouteMatchFunc<ParamsType>
    pathBuilder: TProstoRouterPathBuilder<ParamsType>
}

export type TProstoRouterPathBuilder<ParamsType = TProstoParamsType> = (
    params?: ParamsType,
) => string

export interface TProstoLookupResult<HandlerType = TProstoRouteHandler> {
    route: TProstoRoute<HandlerType>
    ctx: TProstoLookupContext
}

export interface TProstoParametricRoutes {
    byParts: Map<number, TProstoRoute<unknown, unknown>[]>
    byPartsArray?: TProstoRoute<unknown, unknown>[][]
}

export interface TProstoRouterMethodIndex {
    statics: Record<string, TProstoRoute<unknown, unknown> | undefined>
    parametrics: TProstoParametricRoutes
    wildcards: TProstoRoute<unknown>[]
    compiledBuckets?: (TProstoBucketMatchFunc | undefined)[]
    compiledWildcards?: TProstoBucketMatchFunc
}

export type TProstoRouterMainIndex = {
    [method in THttpMethod]?: TProstoRouterMethodIndex
}

export interface TProstoRoutsRegistry<
    HandlerType = TProstoRouteHandler,
    ParamsType = TProstoParamsType,
> {
    [genRoute: string]: TProstoRoute<HandlerType, ParamsType>
}

export interface TProstoRouteOptions {}

export interface TProstoRouterOptions extends TProstoRouteOptions {
    ignoreTrailingSlash?: boolean
    ignoreCase?: boolean
    cacheLimit?: number
    disableDuplicatePath?: boolean
    silent?: boolean
}

export type TProstoRouteMatchFunc<ParamsType = TProstoParamsType> = (
    path: string,
    params: ParamsType,
    utils: Record<string, unknown>,
) => RegExpMatchArray | null

export type TProstoBucketMatchFunc = (
    path: string,
    params: TProstoParamsType,
) => TProstoRoute<unknown, unknown> | null
