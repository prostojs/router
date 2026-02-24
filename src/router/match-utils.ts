import { TProstoParamsType, TProstoRouterPathBuilder } from '..'
import CodeString from '../code'
import { EPathSegmentType, TParsedSegment, TParsedSegmentParametric } from '../parser/p-types'
import { safeDecodeURIComponent } from '../utils/decode'
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

    const masterRegex = new RegExp(
        `^(?:${regexParts.join('|')})$`,
        ignoreCase ? 'i' : '',
    )

    // Generate function body — references `regex`, `routes`, `decode` from closure
    let body = ''
    body += 'const m = regex.exec(path)\n'
    body += 'if (!m) return null\n'

    for (const entry of routeEntries) {
        body += `if (m[${entry.delimiterGroupIndex}] !== undefined) {\n`
        for (const mapping of entry.paramMappings) {
            if (mapping.groupIndices.length === 1) {
                body += `\tparams['${mapping.name}'] = decode(m[${mapping.groupIndices[0]}])\n`
            } else {
                const parts = mapping.groupIndices
                    .map((gi) => `decode(m[${gi}])`)
                    .join(', ')
                body += `\tparams['${mapping.name}'] = [${parts}]\n`
            }
        }
        body += `\treturn routes[${entry.routeIndex}]\n`
        body += '}\n'
    }

    body += 'return null\n'

    // Factory captures `regex`, `routes`, `decode` in closure — no .bind()
    const factory = new Function(
        'regex',
        'routes',
        'decode',
        `return function(path, params) {\n${body}}`,
    ) as (
        regex: RegExp,
        routes: TProstoRoute<unknown, unknown>[],
        decode: typeof safeDecodeURIComponent,
    ) => TProstoBucketMatchFunc

    return factory(masterRegex, routes, safeDecodeURIComponent)
}
