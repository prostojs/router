import { 
    BasicNode,
    ProstoParserNodeContext,
    TBasicNodeOptions,
    TProstoParserHoistOptions,
} from '@prostojs/parser'

import { 
    EPathSegmentType,
    TParsedSegment,
    TParsedSegmentParametric,
} from '..'

export function parsePath(expr: string): TParsedSegment[] {
    return parser.parse(expr).extractCustomDataTree<TParsedSegment[]>()
}

class ParametricNodeWithRegex extends BasicNode<TParsedSegmentParametric> {
    constructor(options: TBasicNodeOptions<TParsedSegmentParametric>, rgNode: BasicNode) {
        super(options)

        const hoistRegex: TProstoParserHoistOptions<TParsedSegmentParametric> = {
            as: 'regex',
            node: regexNode,
            onConflict: 'overwrite',
            removeChildFromContent: true,
            deep: 1,
            mapRule: ({ content }) => content.join('').replace(/^\(\^/, '(').replace(/\$\)$/, ')'),
        }

        this.mapContent('value', content => content.shift())
            .popsAtEOFSource(true)
            .addRecognizes(rgNode)
            .addPopsAfterNode(rgNode)
            .addHoistChildren(hoistRegex)
    }
}

const regexNode = new BasicNode<TParsedSegment>({
    label: 'RegEx',
    tokens: ['(', ')'],
    backSlash: 'ignore-ignore',
    recursive: true,
}).onMatch(({ parserContext, context }) => {
    if (parserContext.fromStack()?.node === context.node) {
        if (!parserContext.here.startsWith('?:')) {
            context.content[0] += '?:'
        }
    }
})

const paramNode = new ParametricNodeWithRegex({
    label: 'Parameter',
    tokens: [':', /[\/\-]/],
    tokenOE: 'omit-eject',
    backSlash: 'ignore-',
}, regexNode).initCustomData(() => ({ type: EPathSegmentType.VARIABLE, value: '', regex: '([^\\/]*)' }))

const wildcardNode = new ParametricNodeWithRegex({
    label: 'Wildcard',
    tokens: ['*', /[^*\()]/],
    tokenOE: '-eject',
}, regexNode).initCustomData(() => ({ type: EPathSegmentType.WILDCARD, value: '*', regex: '(.*)' }))

const staticNode = new BasicNode<TParsedSegment>({
    label: 'Static',
    tokens: [/[^:\*]/, /[:\*]/],
    backSlash: '-ignore',
    tokenOE: '-eject',
}).initCustomData(() => ({ type: EPathSegmentType.STATIC, value: '' }))
    .mapContent('value', content => content.splice(0).join('').replace(/\\:/g, ':'))
    .popsAtEOFSource(true)

const parser = new BasicNode({}).addRecognizes(staticNode, paramNode, wildcardNode)
