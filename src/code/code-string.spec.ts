import CodeString from '.'

describe('code-string', () => {
    it('must generate function', () => {
        const cs = new CodeString<(a: number, b: number) => number>()
        cs.append('// console.log({ a, b })')
        cs.append('return a + b', true)
        cs.prepend(' = a * a', true)
        cs.prepend('a')
        const func = cs.generateFunction('a', 'b')

        expect(typeof func).toEqual('function')
        expect(func(2, 5)).toEqual(9)
        expect(cs.toString()).toMatchInlineSnapshot(`
            "a = a * a
            // console.log({ a, b })
            return a + b"
        `)
    })
})
