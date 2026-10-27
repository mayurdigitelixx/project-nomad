import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const directory = mkdtempSync(join(tmpdir(), 'typescript-loader-'))

try {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(
    join(directory, 'fixture.ts'),
    'export enum Status { Ready = "ready" }; export const label: string = "café"'
  )

  // Model the async loader hooks used by development tooling. Their source
  // crosses a worker boundary and arrives at ts-exec as Uint8Array, not Buffer.
  const hook = `
    export async function load(url, context, nextLoad) {
      const result = await nextLoad(url, context)
      if (url.endsWith('/fixture.ts')) {
        return { ...result, source: Uint8Array.from(Buffer.from(result.source)) }
      }
      return result
    }
  `
  const fixture = pathToFileURL(join(directory, 'fixture.js')).href
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      '@poppinss/ts-exec',
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { register } from 'node:module'
        register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(hook)}`)})
        const fixture = await import(${JSON.stringify(fixture)})
        assert.equal(fixture.Status.Ready, 'ready')
        assert.equal(fixture.label, 'café')
      `,
    ],
    { cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 15000 }
  )

  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  console.log('TypeScript loader: async-hook byte source and UTF-8 exports pass')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
