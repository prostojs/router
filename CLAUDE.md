# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@prostojs/router` — a high-performance, framework-agnostic URI router for Node.js written in TypeScript. Uses dynamic code generation (`new Function()`) for match functions, comparable in speed to `find-my-way`.

## Commands

- **Build:** `pnpm build` (tsc declarations + Rolldown + rolldown-plugin-dts)
- **Test:** `pnpm test`
- **Test single file:** `npx vitest run src/router/router.spec.ts`
- **Test with coverage:** `pnpm test:cov`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`

## Code Style

- No semicolons (`semi: never`)
- 4-space indentation
- Single quotes, trailing commas in multiline
- T-prefix for types/interfaces (`THttpMethod`, `TProstoRoute`), E-prefix for enums (`EPathSegmentType`)
- Prosto-prefix for exported classes (`ProstoRouter`)
- Spec files co-located with source (e.g., `src/router/router.spec.ts`)

## Architecture

### Route Classification

Every registered route is classified into one of three categories per HTTP method:

1. **Static** (`rootMethod.statics`) — exact string match via hash map, O(1) lookup
2. **Parametric** (`rootMethod.parametrics.byParts[]`) — routes with `:params` but no wildcards/optional params, indexed by segment count, sorted by specificity
3. **Wildcard/Optional** (`rootMethod.wildcards[]`) — routes with `*` or `?` optional params, checked sequentially, sorted by specificity

### Lookup Algorithm (`ProstoRouter.lookup`)

Cache check → sanitize path → static hash lookup → parametric lookup (by segment count) → wildcard fallback → cache result.

### Key Source Modules

- **`src/router/index.ts`** — `ProstoRouter` class: route registration, lookup, sorting, caching
- **`src/router/match-utils.ts`** — `generateFullMatchFunc()` and `generatePathBuilder()`: dynamically generates match/build functions via `CodeString` + `new Function()`
- **`src/parser/index.ts`** — `parsePath()`: tokenizes route strings into `TParsedSegment[]` using `@prostojs/parser`
- **`src/code/index.ts`** — `CodeString`: string builder that produces functions via `new Function(args, code)`
- **`src/router/router.types.ts`** — all TypeScript types and interfaces

### Compile-Time Constants

`__DYE_*__` globals are replaced at build time by Rolldown's `define` option and injected as Vitest defines at test time (see `vitest.config.ts`). They're declared in `src/global.d.ts`.

### Route Handler Generics

`ProstoRouter<T>` is fully generic over its handler type — it stores and returns handlers but never calls them.

## Commit Convention

Enforced by `yorkie` git hook (`scripts/verifyCommit.js`):

```
(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(scope)?: message
```

## Build Outputs

- ESM: `dist/index.mjs`
- CJS: `dist/index.cjs`
- Types: `dist/index.d.ts` (bundled by rolldown-plugin-dts)
