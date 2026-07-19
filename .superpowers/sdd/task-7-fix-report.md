# Task 7 animation-probe stabilization

## Reproduction reference

The reviewer reported that `tests/lab.spec.ts` held the mouse for exactly 100 ms while the muzzle animation has a 60 ms frame. Under `--repeat-each=3`, the right-facing test failed 2 of 3 attempts: it could release before the retained canvas probe observed a muzzle-flash draw.

## Fix

The right-facing fire test now keeps the mouse down while a bounded 1,000 ms `expect.poll` waits for the retained animation probe to record `/muzzle-flash.png`. A `finally` block releases the mouse for both success and assertion failure. All existing right-mirror, firing, reload, and soul assertions remain unchanged.

## Stress evidence

```text
bun run test:e2e --grep 'draws right-facing fire reload' --repeat-each=3 --workers=3
3 passed (12.9s)
```

## Full verification

```text
bun run test:e2e
11 passed

bun test
126 pass, 0 fail

bun run build
tsc --noEmit && vite build: passed

git diff --check
no output
```
