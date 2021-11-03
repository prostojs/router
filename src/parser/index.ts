import { 
    GenericNode,
    GenericRecursiveNode,
    GenericRootNode,
    ProstoParserNodeContext,
    TGenericNodeOptions,
    TProstoParserHoistOptions,
} from '@prostojs/parser'

import { 
    EPathSegmentType,
    TParsedSegment,
    TParsedSegmentParametric,
} from '..'

export function parsePath(expr: string): TParsedSegment[] {
    const parsed = parser.parse(expr)
    return parsed.content.map(c => (c as ProstoParserNodeContext<TParsedSegment>).getCustomData()) as TParsedSegment[]
}

class ParametricNodeWithRegex extends GenericNode<TParsedSegmentParametric> {
    constructor(options: TGenericNodeOptions<TParsedSegmentParametric>, rgNode: GenericNode) {
        super(options)

        const hoistRegex: TProstoParserHoistOptions<TParsedSegmentParametric> = {
            as: 'regex',
            node: regexNode,
            onConflict: 'overwrite',
            removeChildFromContent: true,
            deep: 1,
            map: ({ content }) => content.join('').replace(/^\(\^/, '(').replace(/\$\)$/, ')'),
        }

        this.mapContent('value', content => content.shift())
            .popsAtEOFSource(true)
            .addRecognizes(rgNode)
            .addPopsAfterNode(rgNode)
            .addHoistChildren(hoistRegex)
    }
}

const regexNode = new GenericRecursiveNode<TParsedSegment>({
    label: 'RegEx',
    tokens: ['(', ')'],
    backSlash: 'ignore-ignore',
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
    tokenOptions: 'omit-eject',
    backSlash: 'ignore-',
}, regexNode).initCustomData(() => ({ type: EPathSegmentType.VARIABLE, value: '', regex: '([^\\/]*)' }))

const wildcardNode = new ParametricNodeWithRegex({
    label: 'Wildcard',
    tokens: ['*', /[^*\()]/],
    tokenOptions: '-eject',
}, regexNode).initCustomData(() => ({ type: EPathSegmentType.WILDCARD, value: '*', regex: '(.*)' }))

const staticNode = new GenericNode<TParsedSegment>({
    label: 'Static',
    tokens: [/[^:\*]/, /[:\*]/],
    backSlash: '-ignore',
    tokenOptions: '-eject',
}).initCustomData(() => ({ type: EPathSegmentType.STATIC, value: '' }))
    .mapContent('value', content => content.splice(0).join('').replace(/\\:/g, ':'))
    .popsAtEOFSource(true)

const parser = new GenericRootNode()
    .addRecognizes(staticNode, paramNode, wildcardNode)
