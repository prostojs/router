export function countOfSlashes(s: string): number {
    let last = 0
    let count = 0
    let index = s.indexOf('/')
    last = index + 1
    while (index >= 0) {
        count++
        index = s.indexOf('/', last)
        last = index + 1
    }
    return count
}
