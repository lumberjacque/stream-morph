# Contributing

Use Node 22.12 or newer. Install dependencies with `npm ci`, then run `npm run verify` before opening a pull request.
Use `npm run format` for formatting and `npm run test` for focused test runs.

Keep public APIs documented, browser imports free of DOM side effects, runtime
dependencies absent unless justified, and per-frame measurement work bounded.
Preserve DOM identity and cleanup on destruction. Add a regression test for a
behavior change and explain the user-visible problem in the pull request.

Provider transport, rich Markdown and the Astro website live outside this package.
Discuss additions to the public API before changing that boundary.
