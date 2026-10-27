# Admin runtime migration

Requires Node.js 24+. Upgrades AdonisJS 7, Inertia 3 and Vite 8.

## Compatibility

- Keep the existing `APP_KEY` and persistent storage; the legacy encryption
  driver preserves encrypted data.
- Inertia shared props move to middleware, with assistant-name cache invalidation
  handled by a separate service. The client entrypoint is `inertia/app.tsx`.
- Vite deduplicates React. MapLibre 6 uses an explicit worker URL and requires
  WebGL 2. stream-json 3 uses Node stream adapters.
- Native install-script approvals are version-pinned; review them on upgrades.
  Tesseract's optional postinstall remains disabled.
- Backend builds exclude tests that cross the frontend TypeScript project boundary.
  Run tests separately.
- `npm ci` patches ts-exec 1.5.1 to decode byte-array source from async loader
  hooks as UTF-8. Review and remove this patch when upgrading to a fixed loader.

## Verification

From `admin/`, with the normal build prerequisites and a test environment:

```sh
npm ci
npm run build
npm run test:typescript
npm run test:dependencies
npm test -- unit
npm audit --omit=dev
npm audit
```

Build, migrations, seeding, HTTP/shared props, map rendering, navigation and chat
checks passed. Both npm audits reported zero advisories. Source tests passed
650 plain tests and 77/81 framework tests, including the new cache regression;
the same four failures occur on the pre-migration baseline. The loader regression
checks async-hook byte decoding and UTF-8 exports.

Additional platform and upstream CI validation remain outstanding.
