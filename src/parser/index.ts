import { Node, ParseError, parse } from '@prostojs/parser'
import type { MatchContext, MatchResult, ParsedNode } from '@prostojs/parser'

import {
    EPathSegmentType,
    TParsedSegment,
    TParsedSegmentParametric,
} from './p-types'

export function parsePath(expr: string): TParsedSegment[] {
    let root
    try {
        root = parse(parser, expr)
    } catch (error) {
        if (error instanceof ParseError) {
            throw new ParseError(
                `Invalid route path "${expr}": ${error.message}`,
                error.source,
                error.offset,
            )
        }
        throw error
    }
    return root.content.map((c) =>
        typeof c === 'string' ? c : { ...c.data },
    ) as TParsedSegment[]
}

// token prefix: not escaped (preceded by an even number of backslashes)
const NOT_ESCAPED = /(?<=(?:^|[^\\])(?:\\\\)*)/.source
const NEVER = /(?!)/
const REGEX_START = new RegExp(NOT_ESCAPED + /\((?:\?:)?/.source)
// right after its regex group a param closes, consuming an optional "?"
const AFTER_REGEX = /(?<optional>\?)?/y
const AFTER_REGEX_NO_MARKER = /(?:)/y

function hasRegex(node: ParsedNode): boolean {
    const last = node.content[node.content.length - 1]
    return last !== undefined && typeof last !== 'string'
}

const regexNode: Node = new Node({
    name: 'RegEx',
    start: {
        // a param takes a single regex group
        token: ({ node }) => (hasRegex(node) ? NEVER : REGEX_START),
        omit: true,
    },
    end: new RegExp(NOT_ESCAPED + /\)/.source),
})
    .onOpen((node, match) => {
        // nested groups are made non-capturing
        const nested = node.parent?.node === regexNode && match!.text === '('
        node.content.push(nested ? '(?:' : match!.text)
    })
    .onChild((child, node) => {
        node.content[node.content.length - 1] = child.content.join('')
    })
regexNode.recognize(regexNode)

function afterRegex({ node }: MatchContext) {
    if (!hasRegex(node)) return NEVER
    const name = node.content[0]
    return typeof name === 'string' && name.endsWith('?')
        ? AFTER_REGEX_NO_MARKER
        : AFTER_REGEX
}

function closeParametric(
    node: ParsedNode<TParsedSegmentParametric>,
    match: MatchResult | null,
) {
    const data = node.data
    let name = ''
    for (const c of node.content) {
        if (typeof c === 'string') {
            name += c
        } else {
            data.regex = c.content
                .join('')
                .replace(/^\(\^/, '(')
                .replace(/\$\)$/, ')')
        }
    }
    data.name = name
    if (data.type === EPathSegmentType.VARIABLE) {
        data.value = name || (undefined as unknown as string)
    }
    if (name.endsWith('?')) {
        data.name = name.slice(0, -1)
        data.value = data.name
        data.optional = true
    } else if (match?.groups?.optional) {
        data.optional = true
    }
}

const paramNode = new Node<TParsedSegmentParametric>({
    name: 'Parameter',
    start: { token: new RegExp(NOT_ESCAPED + ':'), omit: true },
    end: [
        { token: /[/-]/, eject: true },
        { token: afterRegex, omit: true },
    ],
    recognizes: [regexNode],
    eofClose: true,
    data: {
        type: EPathSegmentType.VARIABLE,
        value: '',
        regex: '([^\\/]*)',
        name: '',
    },
}).onClose(closeParametric)

const wildcardNode = new Node<TParsedSegmentParametric>({
    name: 'Wildcard',
    start: '*',
    end: [
        { token: /(?<optional>\?)/, omit: true },
        { token: /[^*()?]/, eject: true },
        { token: afterRegex, omit: true },
    ],
    recognizes: [regexNode],
    eofClose: true,
    data: {
        type: EPathSegmentType.WILDCARD,
        value: '*',
        regex: '(.*)',
        name: '',
    },
}).onClose(closeParametric)

const staticNode = new Node<TParsedSegment>({
    name: 'Static',
    start: /[^:*]/,
    end: { token: new RegExp(NOT_ESCAPED + /[:*]/.source), eject: true },
    eofClose: true,
    data: { type: EPathSegmentType.STATIC, value: '' },
}).onClose((node) => {
    node.data.value = node.content.join('').replace(/\\:/g, ':')
})

const parser = new Node({
    recognizes: [staticNode, paramNode, wildcardNode],
})
