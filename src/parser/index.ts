import { ProstoParser, ProstoParseNode } from '@prostojs/parser'
import { EPathSegmentType, TParsedSegment } from '..'

enum ENode {
    STATIC,
    PARAM,
    REGEX,
    WILDCARD,
}

const negativeLookBehindEscapingSlash = /[^\\][\\](\\\\)*$/

interface TCustomContext {
    key: string
    regex: string
}

const rootNode = new ProstoParseNode({
    id: ENode.STATIC,
    label: 'Static',
    recognizes: [ENode.PARAM, ENode.WILDCARD],
})

export function createParser(): (expr: string) => TParsedSegment[] {
    const parser = new ProstoParser({
        rootNode,
        nodes: [
            new ProstoParseNode<TCustomContext>({
                id: ENode.PARAM,
                label: 'Parameter',
                startsWith: {
                    token: ':',
                    negativeLookBehind: negativeLookBehindEscapingSlash,
                    omit: true,
                },
                endsWith: {
                    token: ['/', '-'],
                    eject: true,
                },
                hoistChildren: [
                    {
                        as: 'regex',
                        node: ENode.REGEX,
                        removeFromContent: true,
                        deep: 1,
                        map: ({ content }) => content.join('').replace(/\$\)$/, ')'),
                    },
                ],
                mapContent: {
                    key: (content) => content.shift(),
                },
                popsAtEOFSource: true,
                popsAfterNode: ENode.REGEX,
                recognizes: [ENode.REGEX],
            }),
            new ProstoParseNode({
                id: ENode.REGEX,
                label: 'RegEx',
                startsWith: {
                    token: '(',
                    negativeLookBehind: negativeLookBehindEscapingSlash,
                },
                endsWith: {
                    token: ')',
                    negativeLookBehind: negativeLookBehindEscapingSlash,
                },
                mergeWith: [
                    {
                        parent: ENode.REGEX,
                        join: true,
                    },
                ],
                recognizes: [ENode.REGEX],
                onMatch({ rootContext, context }) {
                    if (rootContext.fromStack()?.node.id === ENode.REGEX) {
                        if (!rootContext.here.startsWith('?:')) {
                            context.content[0] += '?:'
                        }
                    } else {
                        if (rootContext.here.startsWith('^')) {
                            rootContext.jump(1)
                        }
                    }
                },
            }),
            new ProstoParseNode<TCustomContext>({
                id: ENode.WILDCARD,
                label: 'Wildcard',
                startsWith: {
                    token: '*',
                },
                endsWith: {
                    token: /[^*]/,
                    eject: true,
                },
                hoistChildren: [
                    {
                        as: 'regex',
                        node: ENode.REGEX,
                        removeFromContent: true,
                        deep: 1,
                        map: ({ content }) => content.join('').replace(/\$\)$/, ')'),
                    },
                ],
                mapContent: {
                    key: (content) => content.shift(),
                },
                popsAtEOFSource: true,
                popsAfterNode: ENode.REGEX,
                recognizes: [ENode.REGEX],
            }),
        ],
    })
    
    return function parsePath(expr: string): TParsedSegment[] {
        const parsed = parser.parse(expr)
        return parsed.content.filter(c => typeof c !== 'number').map(c => {
            if (typeof c === 'string') {
                return {
                    type: EPathSegmentType.STATIC,
                    value: c.replace(/\\:/g, ':'),
                }
            } else if (typeof c === 'object') {
                const data = c.getCustomData<TCustomContext>()
                switch (c.node.id) {
                    case ENode.PARAM: return {
                        type: EPathSegmentType.VARIABLE,
                        value: data.key,
                        regex: data.regex || '([^\\/]*)',
                    }
                    case ENode.WILDCARD: return {
                        type: EPathSegmentType.WILDCARD,
                        value: data.key || '*',
                        regex: data.regex || '(.*)',
                    }
                }
            }
        }) as TParsedSegment[] 
    }
}
