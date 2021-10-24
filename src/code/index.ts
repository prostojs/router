export default class CodeString<FuncType = () => unknown> {
    private code = ''

    public append(s: string | string[], newLine = false) {
        this.code += ['', s].flat().join(newLine ? '\n'  : '')
    }

    public prepend(s: string | string[], newLine = false) {
        this.code = [s, ''].flat().join(newLine ? '\n'  : '') + this.code
    }

    generateFunction(...args: string[]): FuncType {
        return new Function(args.join(','), this.code) as unknown as FuncType
    }

    toString() {
        return this.code
    }
}
