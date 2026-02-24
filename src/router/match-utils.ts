import { TProstoParamsType, TProstoRouterPathBuilder } from '..'
import CodeString from '../code'
import { EPathSegmentType, TParsedSegment, TParsedSegmentParametric } from '../parser/p-types'
import { escapeRegex } from '../utils/regex'
import { TProstoBucketMatchFunc, TProstoRoute, TProstoRouteMatchFunc } from './router.types'

export function generateFullMatchRegex(
    segments: TParsedSegment[],
    nonCapturing = false,
): string {
    let regex = ''
    let optional = false
    segments.forEach((segment) => {
        switch (segment.type) {
            case EPathSegmentType.STATIC:
                if (optional) {
                    if (['-', '/'].includes(segment.value)) {
                        regex += escapeRegex(segment.value) + '?'
                    } else {
                        throw new Error(
                            `Static route segment "${segment.value}" is not allowed after optional parameters.`,
                        )
                    }
                } else {
                    regex += escapeRegex(segment.value)
                }
                break
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                if (optional && !segment.optional)
                    throw new Error(
                        'Obligatory route parameters are not allowed after optional parameters. Use "?" to mark it as an optional route parameter.',
                    )
                if (segment.optional && !optional) {
                    if (regex.endsWith('/')) {
                        regex += '?'
                    }
                }
                regex += nonCapturing
                    ? segment.regex.replace(/^\(/, '(?:')
                    : segment.regex
                if (segment.optional) {
                    optional = true
                    regex += '?'
                }
        }
    })
    return regex
}

export function generateFullMatchFunc<ParamsType = TProstoParamsType>(
    segments: TParsedSegment[],
    ignoreCase = false,
): TProstoRouteMatchFunc<ParamsType> {
    const str = new CodeString<TProstoRouteMatchFunc<ParamsType>>()
    const regex = generateFullMatchRegex(segments)
    let index = 0
    const obj: Record<string, number[]> = {}
    segments.forEach((segment) => {
        switch (segment.type) {
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                index++
                obj[segment.value] = obj[segment.value] || []
                obj[segment.value].push(index)
        }
    })
    Object.keys(obj).forEach((key) => {
        str.append(
            obj[key].length > 1
                ? `\tparams['${key}'] = [${obj[key].map((i) => `utils.safeDecodeURIComponent(a[${i}])`).join(', ')}]`
                : `\tparams['${key}'] = utils.safeDecodeURIComponent(a[${obj[key][0]}])`,
            true,
        )
    })
    str.prepend(
        [
            `const a = path.match(/^${regex}$/${ignoreCase ? 'i' : ''})`,
            'if (a) {',
        ],
        true,
    )
    str.append(['}', 'return a'], true)
    return str.generateFunction('path', 'params', 'utils')
}

export function generatePathBuilder<ParamsType = TProstoParamsType>(
    segments: TParsedSegment[],
): TProstoRouterPathBuilder<ParamsType> {
    const str = new CodeString<TProstoRouterPathBuilder<ParamsType>>()
    const obj: Record<string, number> = {}
    const index: Record<string, number> = {}
    segments.forEach((segment) => {
        switch (segment.type) {
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                obj[segment.value] = obj[segment.value] || 0
                obj[segment.value]++
                index[segment.value] = 0
        }
    })
    str.append('return `')
    segments.forEach((segment) => {
        switch (segment.type) {
            case EPathSegmentType.STATIC:
                str.append(segment.value.replace(/`/g, '\\`'))
                break
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                if (obj[segment.value] > 1) {
                    str.append(
                        "${ params['" +
                            segment.value +
                            `'][${index[segment.value]}] }`,
                    )
                    index[segment.value]++
                } else {
                    str.append("${ params['" + segment.value + "'] }")
                }
        }
    })
    str.append('`')

    return str.generateFunction('params')
}

export function compileBucketMatcher(
    routes: TProstoRoute<unknown, unknown>[],
    ignoreCase: boolean,
): TProstoBucketMatchFunc {
    if (routes.length === 0) {
        return () => null
    }

    const regexParts: string[] = []
    const routeEntries: Array<{
        routeIndex: number
        delimiterGroupIndex: number
        paramMappings: Array<{ name: string; groupIndices: number[] }>
    }> = []

    let groupOffset = 1 // match[0] is full match, groups start at 1

    for (let ri = 0; ri < routes.length; ri++) {
        const route = routes[ri]
        const routeRegex = generateFullMatchRegex(route.segments)

        // Build param name → capture group index mapping
        const byName: Record<string, number[]> = {}
        let localIndex = 0
        for (const seg of route.segments) {
            if (
                seg.type === EPathSegmentType.VARIABLE ||
                seg.type === EPathSegmentType.WILDCARD
            ) {
                const name = (seg as TParsedSegmentParametric).value
                if (!byName[name]) byName[name] = []
                byName[name].push(groupOffset + localIndex)
                localIndex++
            }
        }

        const paramMappings: Array<{ name: string; groupIndices: number[] }> =
            []
        for (const name of Object.keys(byName)) {
            paramMappings.push({ name, groupIndices: byName[name] })
        }

        // Each route: (?:routeRegex)() where () is the empty delimiter group
        regexParts.push(`(?:${routeRegex})()`)
        const delimiterGroupIndex = groupOffset + localIndex
        routeEntries.push({
            routeIndex: ri,
            delimiterGroupIndex,
            paramMappings,
        })
        groupOffset = delimiterGroupIndex + 1
    }

    let masterRegex: RegExp
    try {
        masterRegex = new RegExp(
            `^(?:${regexParts.join('|')})$`,
            ignoreCase ? 'i' : '',
        )
    } catch {
        // Master regex too large (e.g. too many capture groups) — fall back
        // to matching each route's regex individually. Slower but always works.
        return compileIndividualMatchers(routes, ignoreCase)
    }

    // Build per-handler functions: delimiterIndex → (m, params) => route
    // Each handler extracts params from the match and returns the route
    const maxDelimiter = routeEntries[routeEntries.length - 1].delimiterGroupIndex
    const handlers: (((m: RegExpExecArray, params: TProstoParamsType) => TProstoRoute<unknown, unknown>) | undefined)[] =
        new Array(maxDelimiter + 1)

    for (const entry of routeEntries) {
        let hBody = ''
        for (const mapping of entry.paramMappings) {
            if (mapping.groupIndices.length === 1) {
                hBody += `params['${mapping.name}'] = m[${mapping.groupIndices[0]}]\n`
            } else {
                const parts = mapping.groupIndices
                    .map((gi) => `m[${gi}]`)
                    .join(', ')
                hBody += `params['${mapping.name}'] = [${parts}]\n`
            }
        }
        hBody += `return route\n`
        const hFactory = new Function(
            'route',
            `return function(m, params) {\n${hBody}}`,
        ) as (route: TProstoRoute<unknown, unknown>) => (m: RegExpExecArray, params: TProstoParamsType) => TProstoRoute<unknown, unknown>
        handlers[entry.delimiterGroupIndex] = hFactory(routes[entry.routeIndex])
    }

    // Main matcher: single indexOf("", 1) to find which route matched
    return function (path: string, params: TProstoParamsType) {
        const m = masterRegex.exec(path)
        if (!m) return null
        const idx = m.indexOf('', 1)
        const handler = handlers[idx]
        return handler ? handler(m, params) : null
    }
}

/**
 * Fallback: each route gets its own pre-compiled regex + param extractor.
 * Used when the master regex fails to compile (too many capture groups, etc).
 */
export function compileIndividualMatchers(
    routes: TProstoRoute<unknown, unknown>[],
    ignoreCase: boolean,
): TProstoBucketMatchFunc {
    const matchers: Array<{
        regex: RegExp
        route: TProstoRoute<unknown, unknown>
        extract: (m: RegExpExecArray, params: TProstoParamsType) => void
    }> = []

    for (const route of routes) {
        const routeRegex = generateFullMatchRegex(route.segments)
        const regex = new RegExp(
            `^${routeRegex}$`,
            ignoreCase ? 'i' : '',
        )

        const byName: Record<string, number[]> = {}
        let groupIdx = 0
        for (const seg of route.segments) {
            if (
                seg.type === EPathSegmentType.VARIABLE ||
                seg.type === EPathSegmentType.WILDCARD
            ) {
                const name = (seg as TParsedSegmentParametric).value
                if (!byName[name]) byName[name] = []
                groupIdx++
                byName[name].push(groupIdx)
            }
        }

        let hBody = ''
        for (const name of Object.keys(byName)) {
            const indices = byName[name]
            if (indices.length === 1) {
                hBody += `params['${name}'] = m[${indices[0]}]\n`
            } else {
                hBody += `params['${name}'] = [${indices.map((gi) => `m[${gi}]`).join(', ')}]\n`
            }
        }
        const extractFn = new Function(
            'm', 'params',
            hBody,
        ) as (m: RegExpExecArray, params: TProstoParamsType) => void

        matchers.push({ regex, route, extract: extractFn })
    }

    return function (path: string, params: TProstoParamsType) {
        for (let i = 0; i < matchers.length; i++) {
            const m = matchers[i].regex.exec(path)
            if (m) {
                matchers[i].extract(m, params)
                return matchers[i].route
            }
        }
        return null
    }
}

