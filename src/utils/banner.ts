let lastSec = 0
let lastBanner = ''

export function banner(): string {
    const now = Date.now()
    const sec = (now / 1000) | 0
    if (sec === lastSec) return lastBanner
    lastSec = sec
    lastBanner = `[prostojs/router][${new Date(now)
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}z$/i, '')}] `
    return lastBanner
}
