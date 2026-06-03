# GitHub Pages deployment

This app can publish the FRU arrow simulator as a static GitHub Pages site.

## What gets deployed

- `/fru-arrow/` is the public simulator route.
- Static assets are served from `public/fru-arrow/`.
- The workflow builds the site into `out/` and deploys that folder to GitHub Pages.

## Setup

1. Create a GitHub repository and push this `collab-whiteboard` project to `main` or `master`.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push a commit, or run the `Deploy FRU arrow simulator` workflow manually.

For a normal project repository, the workflow automatically serves the site under:

```text
https://<username>.github.io/<repository-name>/fru-arrow/
```

For a user or organization Pages repository named `<username>.github.io`, it serves under:

```text
https://<username>.github.io/fru-arrow/
```

## Local static export check

```bash
npm run typecheck
node scripts/test-fru-arrow-mechanic.mjs
npm run build:pages
```

The static site output is written to `out/`.

## Custom base path

If you need a fixed path, set `NEXT_PUBLIC_BASE_PATH` before building:

```bash
NEXT_PUBLIC_BASE_PATH=/my-path npm run build:pages
```
