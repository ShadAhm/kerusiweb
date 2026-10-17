# Contributing

Thanks for looking. This is a small project with one rule that matters more
than the rest, so it goes first.

## The one rule: core, or a binding?

> If a second binding would need to write this code again, it belongs in
> `@kerusiweb/core`.

A new colour rule, a new geometry rule, a new validator check, a new seat shape,
a new price resolution: **core**. A new component input, a new template branch,
a new `effect` or `useMemo`: **the binding**.

[docs/architecture.md](docs/architecture.md) is the full contract: what core
may and may not import, what a binding is allowed to add, and what a third
binding would have to supply. Read it before adding code.

Two consequences worth stating plainly:

- **Core imports no framework and touches no DOM.** Not Angular, not React, not
  RxJS. `grep -rniE "@angular|rxjs|from .react" projects/core/src` must come
  back empty, and core's tests run under `vitest` with `environment: 'node'`.
- **A change to rendering behaviour lands in core and is asserted in both
  bindings.** `projects/react/src/kerusi-seatmap.spec.tsx` runs the Angular
  component spec's assertions against React-rendered DOM: for the same
  documents the two bindings emit byte-identical SVG. A PR that breaks this
  needs to say why.

No binding is the default one. If you add a capability to Angular that React
could have, either add it to both or say in the PR why it cannot cross.

## Getting set up

```bash
npm install
npm run build:core     # every binding resolves core through the workspace, so this comes first
```

Then run whichever demo you're working against. Both run against **source**,
so a change in core or in a binding hot-reloads:

```bash
npm run start:angular  # http://localhost:4200
npm run start:react    # Vite
```

Both demos render the same venue documents from `projects/demo-scenarios/`, so
a rendering change should be visible in both. That is usually the fastest way
to notice you have only half-implemented something.

## Before you open a PR

```bash
npm run test:ci        # core + both bindings + both demos
npm run build:angular  # ng-packagr, which is stricter than the demo build
npm run build:react
npx prettier --check .
```

There is no bare `npm start` / `npm test` / `npm run build`. Every script names
its framework.

## Working on the format itself

The [Kerusi Seat Map & Availability Format](https://github.com/ShadAhm/kerusi)
is a separate repository. Questions or proposals about what the _format_ should
say belong there. This repository is a consumer of it: what belongs here is how
a conformant document is rendered, validated and interacted with.

If a change affects conformance, update
[docs/kerusi-conformance.md](docs/kerusi-conformance.md) in the same PR, and
cite the section of the standard (`§4.3.1`, and so on) in the code comment and
the changelog entry. The existing entries show the house style.

## Commits and changelog

Add a `CHANGELOG.md` entry under `## [Unreleased]` for anything a consumer
would notice. Match the existing tone: say what changed and why it changed,
not just which files moved.

## Releasing

Pushing a version tag publishes all three packages to npm, through
[`.github/workflows/publish.yml`](.github/workflows/publish.yml).

1. **Open a release PR** that:
   - bumps `version` in `projects/core`, `projects/angular` and `projects/react`
     `package.json` to the new version;
   - raises the bindings' `peerDependencies["@kerusiweb/core"]` to `^` that
     version;
   - moves the `## [Unreleased]` entries in `CHANGELOG.md` under a dated
     `## [x.y.z] - YYYY-MM-DD` heading, and adds its release link at the bottom.
2. **Merge it**, then tag the merge commit and push the tag:

   ```bash
   git checkout master
   git pull
   git tag v2.4.0
   git push origin v2.4.0
   ```

The workflow then:

- stops at once if the tag does not match all three package versions, or a
  binding's peer range does not match the tag, so a mistyped tag publishes
  nothing;
- runs `npm run test:ci` and builds every package;
- publishes core first, then Angular and React, each with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements);
- skips any package whose version is already on npm, so if a run fails part-way,
  re-running it from the Actions tab finishes the job.

Watch it under **Actions → Publish to npm**. npm can take a few minutes to list
a new version after it is published.

### One-time setup

The workflow publishes with a repository secret named `NPM_TOKEN`:

1. On [npmjs.com](https://www.npmjs.com/), go to **Access Tokens → Generate New
   Token → Granular Access Token**. Give it **Read and write** permission for the
   `@kerusiweb` scope (or the three packages). If your npm account requires 2FA
   to publish, also tick **Bypass two-factor authentication**, since a
   workflow cannot answer a 2FA prompt.
2. On GitHub, go to **Settings → Secrets and variables → Actions → New
   repository secret**, name it `NPM_TOKEN`, and paste the token.

Granular tokens expire. When the token runs out, the publish step fails with a
401, and you need to generate a new one and update the secret.
