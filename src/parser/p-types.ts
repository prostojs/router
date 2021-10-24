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
    regex: string
}

export interface TParsedSegmentStatic extends TParsedSegmentAny { 
    type: EPathSegmentType.STATIC
}

export type TParsedSegment = TParsedSegmentStatic | TParsedSegmentParametric
