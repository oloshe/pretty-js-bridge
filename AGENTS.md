# Repository maintenance rules

## Examples must track code changes

- Any change to a public type, registration option, runtime behavior, transport, native message shape, callback behavior, lifecycle behavior, package entry, or build format must update the affected files under `examples/` in the same change.
- Every newly supported public feature must have at least one TypeScript usage example and a matching Markdown tutorial.
- When an existing feature changes, update both the example's `example.ts` and its `README.md`; do not leave examples describing obsolete behavior.
- Keep the coverage table in `examples/README.md` synchronized with the example folders.
- Before finishing a code change, run `pnpm typecheck:examples` and `pnpm check`.
