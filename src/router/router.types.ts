import { EProstoLogLevel } from '@prostojs/logger'
import { TParsedSegment } from '../parser/p-types'
import { TConsoleInterface } from '@prostojs/dye'

export type THttpMethod = 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export type TProstoParamsType = Record<string, string | string[]>

export interface TProstoLookupContext<ParamsType = TProstoParamsType> {
    params: ParamsType
}

export type TProstoRouteHandler = (...args: undefined[]) => void

export interface TProstoRoute<HandlerType = TProstoRouteHandler, ParamsType = TProstoParamsType> {
    options: TProstoRouteOptions
    path: string
    handlers: HandlerType[]
    isStatic: boolean
    isParametric: boolean
    isWildcard: boolean
    segments: TParsedSegment[]
    generalized: string
    lengths: number[]
    minLength: number,
    firstLength: number,
    firstStatic: string,
    fullMatch: TProstoRouteMatchFunc<ParamsType>
    pathBuilder: TProstoRouterPathBuilder<ParamsType>
}

export type TProstoRouterPathBuilder<ParamsType = TProstoParamsType> = (params?: ParamsType) => string

export interface TProstoLookupResult<HandlerType = TProstoRouteHandler> {
    route: TProstoRoute<HandlerType>
    ctx: TProstoLookupContext
}

export interface TProstoParametricRoutes {
    byParts: TProstoRoute<unknown, unknown>[][]
}

export interface TProstoRouterMethodIndex {
    statics: Record<string, TProstoRoute<unknown, unknown> | undefined>
    parametrics: TProstoParametricRoutes
    wildcards: TProstoRoute<unknown>[]
}

export type TProstoRouterMainIndex = {
    [method in THttpMethod]?: TProstoRouterMethodIndex;
}

export interface TProstoRoutsRegistry<HandlerType = TProstoRouteHandler, ParamsType = TProstoParamsType> {
    [genRoute: string]: TProstoRoute<HandlerType, ParamsType>
}

export interface TProstoRouteOptions {

}

export interface TProstoRouterOptions extends TProstoRouteOptions {
    ignoreTrailingSlash?: boolean
    ignoreCase?: boolean
    cacheLimit?: number
    disableDuplicatePath?: boolean
    logger: TConsoleInterface
    logLevel: EProstoLogLevel
}

export type TProstoRouteMatchFunc<ParamsType = TProstoParamsType> = (path: string, params: ParamsType, utils: Record<string, unknown>) => string[] | false
