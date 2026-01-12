# Task Completion Checklist

Before marking a task complete:

## Code Quality
- [ ] TypeScript compiles without errors (`pnpm check`)
- [ ] All tests pass (`pnpm test`)
- [ ] No lint errors (`pnpm lint`)
- [ ] Code formatted (`pnpm format`)

## Security (for auth-related changes)
- [ ] Timing-safe comparisons for secrets
- [ ] Input validation with Zod strict schemas
- [ ] No sensitive data in logs/errors
- [ ] Token hashing before storage

## Documentation
- [ ] JSDoc on public functions
- [ ] Update README if API changed
- [ ] Update docs/ if significant change

## Testing
- [ ] Unit tests for new functions
- [ ] Integration tests for flows
- [ ] Edge cases covered
