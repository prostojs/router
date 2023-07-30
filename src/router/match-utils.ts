import { TProstoParamsType, TProstoRouterPathBuilder } from '..'
import CodeString from '../code'
import { EPathSegmentType, TParsedSegment } from '../parser/p-types'
import { escapeRegex } from '../utils/regex'
import { TProstoRouteMatchFunc } from './router.types'

export function generateFullMatchRegex(segments: TParsedSegment[], nonCapturing = false): string {
    let regex = ''
    let optional = false
    segments.forEach(segment => {
        switch (segment.type) {
            case EPathSegmentType.STATIC:
                if (optional) {
                    if (['-', '/'].includes(segment.value)) {
                        regex += escapeRegex(segment.value) + '?'
                    } else {
                        throw new Error(`Static route segment "${ segment.value }" is not allowed after optional parameters.`)
                    }
                } else {
                    regex += escapeRegex(segment.value)
                }
                break
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                if (optional && !segment.optional) throw new Error('Obligatory route parameters are not allowed after optional parameters. Use "?" to mark it as an optional route parameter.')
                if (segment.optional && !optional) {
                    if (regex.endsWith('/')) {
                        regex += '?'
                    }
                }
                regex += nonCapturing ? segment.regex.replace(/^\(/, '(?:') : segment.regex
                if (segment.optional) {
                    optional = true
                    regex += '?'
                }
        }
    })
    return regex
}

export function generateFullMatchFunc<ParamsType = TProstoParamsType>(segments: TParsedSegment[], ignoreCase = false): TProstoRouteMatchFunc<ParamsType> {
    const str = new CodeString<TProstoRouteMatchFunc<ParamsType>>()
    const regex = generateFullMatchRegex(segments)
    let index = 0
    const obj: Record<string, number[]> = {}
    segments.forEach(segment => {
        switch (segment.type) {
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                index++
                obj[segment.value] = obj[segment.value] || []
                obj[segment.value].push(index)
        }
    })
    Object.keys(obj).forEach(key => {
        str.append(
            obj[key].length > 1
                ? `\tparams['${key}'] = [${ obj[key].map(i => `utils.safeDecodeURIComponent(a[${i}])`).join(', ') }]`
                : `\tparams['${key}'] = utils.safeDecodeURIComponent(a[${obj[key][0]}])`,
            true
        )
    })
    str.prepend([`const a = path.match(/^${regex}$/${ignoreCase ? 'i' : ''})`, 'if (a) {'], true)
    str.append(['}', 'return a'], true)
    return str.generateFunction('path', 'params', 'utils')
}

export function generatePathBuilder<ParamsType = TProstoParamsType>(segments: TParsedSegment[]): TProstoRouterPathBuilder<ParamsType> {
    const str = new CodeString<TProstoRouterPathBuilder<ParamsType>>()
    const obj: Record<string, number> = {}
    const index: Record<string, number> = {}
    segments.forEach(segment => {
        switch (segment.type) {
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                obj[segment.value] = obj[segment.value] || 0
                obj[segment.value]++
                index[segment.value] = 0
        }
    })
    str.append('return `')
    segments.forEach(segment => {
        switch (segment.type) {
            case EPathSegmentType.STATIC:
                str.append(segment.value.replace(/`/g, '\\`'))
                break
            case EPathSegmentType.VARIABLE:
            case EPathSegmentType.WILDCARD:
                if (obj[segment.value] > 1) {
                    str.append('${ params[\'' + segment.value + `\'][${ index[segment.value] }] }`)
                    index[segment.value]++
                } else {
                    str.append('${ params[\'' + segment.value + '\'] }')
                }
        }
    })
    str.append('`')

    return str.generateFunction('params')
}
