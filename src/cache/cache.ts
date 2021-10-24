import { TProstoCacheOptions } from './cache.types'

export class ProstoCache<DataType = unknown> {
    protected data: Record<string, DataType> = {}

    protected index: string[] = []

    constructor(protected options: TProstoCacheOptions) { }

    set(key: string, value: DataType) {
        if (!this.options.limit) return
        const oldVal = this.data[key]
        this.data[key] = value
        if (!oldVal) {
            setTimeout(() => {
                this.index.unshift(key)
                const toRemove = this.index.slice(this.options.limit)
                toRemove.forEach(key => delete this.data[key])
                this.index.slice(0, this.options.limit)
            }, 1)
        }
    }

    get(key: string): DataType | undefined {
        if (!this.options.limit) return
        return this.data[key]
    }

    clean() {
        this.data = {}
        this.index = []
    }
}
