function safeDecode(f: (s: string) => string, v: string): string {
    try {
        return f(v)
    } catch {
        return v
    }
}

export function safeDecodeURIComponent(
    uri: string | undefined,
): string | undefined {
    if (!uri || uri.indexOf('%') < 0) return uri
    return safeDecode(decodeURIComponent, uri)
}

export function safeDecodeURI(uri: string): string {
    if (!uri || uri.indexOf('%') < 0) return uri
    return safeDecode(decodeURI, uri)
}
