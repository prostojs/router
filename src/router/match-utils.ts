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
 * Minimum number of routes a sub-bucket split must save (vs. one master regex
 * over the whole bucket) before it pays for the key extraction + Map lookup.
 */
const SUB_BUCKET_MIN_GAIN = 3

/**
 * Number of complete literal path segments a route starts with
 * (`/api/v1/:id` → 2, `/api/v1-:id` → 1, `/:id` → 0).
 */
function leadingLiteralSegments(route: TProstoRoute<unknown, unknown>): number {
    const first = route.segments[0]
    if (!first || first.type !== EPathSegmentType.STATIC) return 0
    const v = first.value
    if (v.charCodeAt(0) !== 47) return 0
    let count = 0
    for (let i = 1; i < v.length; i++) {
        if (v.charCodeAt(i) === 47) count++
    }
    return count
}

/**
 * Hash of the first `depth` segments of `path` (chars between the leading
 * slash and the `depth`-th following slash), or `undefined` when the path has
 * fewer segments. Computed in one charCode pass: no slicing, no string hashing.
 *
 * Soundness: a route can only match a path whose literal prefix is equal (or,
 * under ignoreCase, regex-case-insensitively equal) to the route's, so equal
 * prefixes must give equal hashes. Collisions merely merge candidate sets.
 * Under ignoreCase ASCII letters are folded and every non-ASCII char hashes
 * the same: the non-unicode `i` flag never maps non-ASCII to ASCII, so this
 * never separates two strings the regex treats as equal.
 */
function prefixHash(
    path: string,
    depth: number,
    ignoreCase: boolean,
): number | undefined {
    let h = 0
    let seen = 0
    for (let i = 1; i < path.length; i++) {
        let c = path.charCodeAt(i)
        if (c === 47 && ++seen === depth) return h
        if (ignoreCase) {
            if (c >= 97 && c <= 122) c -= 32
            else if (c > 127) c = 0
        }
        h = (Math.imul(h, 31) + c) & 0x3fffffff // stay in Smi range
    }
    return undefined
}

/**
 * Compiles a slash-count bucket of parametric routes.
 *
 * Instead of one alternation regex over every route of the bucket (exec cost
 * grows with the total number of capture groups), routes are split by their
 * first `D` literal path segments (hashed, see prefixHash) into sub-buckets
 * kept in a Map. A route with fewer than `D` leading literal segments
 * ("shallow") can match any key, so it is added to every sub-bucket and to
 * the fallback used for unknown keys.
 * Each sub-bucket keeps the bucket's priority order, and the only routes it
 * omits are those whose literal prefix differs from the path's — they cannot
 * match — so the first matching route is the same as with a single regex.
 *
 * When no split saves at least SUB_BUCKET_MIN_GAIN routes per lookup the
 * bucket is compiled as one regex (D = 0, previous behaviour).
 */
export function compileSubBucketedMatcher(
    routes: TProstoRoute<unknown, unknown>[],
    ignoreCase: boolean,
): TProstoBucketMatchFunc {
    const depths = routes.map(leadingLiteralSegments)
    let maxDepth = 0
    for (const d of depths) if (d > maxDepth) maxDepth = d

    // pick D minimising the largest sub-bucket (ties → smaller D: cheaper key)
    let bestDepth = 0
    let bestSize = routes.length
    for (let depth = 1; depth <= maxDepth; depth++) {
        const counts = new Map<number, number>()
        let shallow = 0
        for (let i = 0; i < routes.length; i++) {
            if (depths[i] < depth) {
                shallow++
                continue
            }
            const key = prefixHash(
                routes[i].segments[0].value,
                depth,
                ignoreCase,
            )!
            counts.set(key, (counts.get(key) || 0) + 1)
        }
        let largest = 0
        for (const c of counts.values()) if (c > largest) largest = c
        if (largest + shallow < bestSize) {
            bestSize = largest + shallow
            bestDepth = depth
        }
    }

    if (bestDepth === 0 || routes.length - bestSize < SUB_BUCKET_MIN_GAIN) {
        return compileBucketMatcher(routes, ignoreCase)
    }

    const depth = bestDepth
    const groups = new Map<number, TProstoRoute<unknown, unknown>[]>()
    const shallowRoutes: TProstoRoute<unknown, unknown>[] = []
    for (let i = 0; i < routes.length; i++) {
        if (depths[i] < depth) {
            // shallow: candidate for every key, appended in priority order
            shallowRoutes.push(routes[i])
            for (const group of groups.values()) group.push(routes[i])
            continue
        }
        const key = prefixHash(routes[i].segments[0].value, depth, ignoreCase)!
        let group = groups.get(key)
        if (!group) {
            // shallow routes seen so far precede this route in priority order
            group = shallowRoutes.slice()
            groups.set(key, group)
        }
        group.push(routes[i])
    }

    const matchers = new Map<number, TProstoBucketMatchFunc>()
    for (const [key, group] of groups) {
        matchers.set(key, compileBucketMatcher(group, ignoreCase))
    }
    const fallback =
        shallowRoutes.length > 0
            ? compileBucketMatcher(shallowRoutes, ignoreCase)
            : undefined

    return function (path: string, params: TProstoParamsType) {
        // an `undefined` key (path shallower than `depth`) is never in the Map
        const matcher =
            matchers.get(prefixHash(path, depth, ignoreCase)!) || fallback
        return matcher ? matcher(path, params) : null
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

