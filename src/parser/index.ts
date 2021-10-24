import { TConsoleInterface } from '@prostojs/dye'
import { ProstoParser, TProstoParserContext } from '@prostojs/parser'
import { EPathSegmentType, TParsedSegment } from '..'

enum ENode {
    STATIC,
    PARAM,
    REGEX,
    WILDCARD,
}

const negativeLookBehindEscapingSlash = /[^\\][\\](\\\\)*$/

export function createParser(logger?: TConsoleInterface): (expr: string) => TParsedSegment[] {
    const parser = new ProstoParser({
        rootNode: ENode.STATIC,
        logger,
        nodes: [
            {
                id: ENode.STATIC,
                label: 'Static',
                recognizes: [ENode.PARAM, ENode.WILDCARD],
            },
            {
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
                        id: ENode.REGEX,
                        removeFromContent: true,
                        deep: 1,
                        map: ({ _content }) => _content.join('').replace(/\$\)$/, ')'),
                    },
                ],
                mapContent: {
                    key: (content) => content.shift(),
                },
                popsAtEOFSource: true,
                popsAfterNode: ENode.REGEX,
                recognizes: [ENode.REGEX],
            },
            {
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
                onMatch({ here, parent, context, jump }) {
                    if (parent?.id === ENode.REGEX) {
                        if (!here.startsWith('?:')) {
                            context._content[0] += '?:'
                        }
                    } else {
                        if (here.startsWith('^')) {
                            jump(1)
                        }
                    }
                },
            },
            {
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
                        id: ENode.REGEX,
                        removeFromContent: true,
                        deep: 1,
                        map: ({ _content }) => _content.join('').replace(/\$\)$/, ')'),
                    },
                ],
                mapContent: {
                    key: (content) => content.shift(),
                },
                popsAtEOFSource: true,
                popsAfterNode: ENode.REGEX,
                recognizes: [ENode.REGEX],
            },
        ],
    })
    
    return function parsePath(expr: string): TParsedSegment[] {
        const parsed: TProstoParserContext = parser.parse(expr)
        return parsed._content.filter(c => typeof c !== 'number').map(c => {
            if (typeof c === 'string') {
                return {
                    type: EPathSegmentType.STATIC,
                    value: c.replace(/\\:/g, ':'),
                }
            } else if (typeof c === 'object') {
                switch (c._nodeId) {
                    case ENode.PARAM: return {
                        type: EPathSegmentType.VARIABLE,
                        value: c.key as string,
                        regex: c.regex as string || '([^\\/]*)',
                    }
                    case ENode.WILDCARD: return {
                        type: EPathSegmentType.WILDCARD,
                        value: c.key as string || '*',
                        regex: c.regex as string || '(.*)',
                    }
                }
            }
        }) as TParsedSegment[] 
    }
}
