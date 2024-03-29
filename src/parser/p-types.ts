export enum EPathSegmentType {
    STATIC,
    VARIABLE,
    REGEX,
    WILDCARD,
}

export interface TParsedSegmentAny { 
    type: EPathSegmentType.VARIABLE | EPathSegmentType.WILDCARD | EPathSegmentType.STATIC
    value: string
}

export interface TParsedSegmentParametric extends TParsedSegmentAny { 
    type: EPathSegmentType.VARIABLE | EPathSegmentType.WILDCARD
    name: string
    regex: string
    optional?: boolean
}

export interface TParsedSegmentStatic extends TParsedSegmentAny { 
    type: EPathSegmentType.STATIC
}

export type TParsedSegment = TParsedSegmentStatic | TParsedSegmentParametric
