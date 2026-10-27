import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// ts-exec 1.5.1 assumes loader source is a Buffer. Async Node loader hooks can
// return Uint8Array instead, whose toString() produces numbers rather than UTF-8.
// Remove this patch once ts-exec decodes byte-array source itself.
const packageRoot = new URL('../node_modules/@poppinss/ts-exec/', import.meta.url)
const manifest = new URL('package.json', packageRoot)

// Production installs omit this development dependency.
if (existsSync(manifest)) {
  const { version } = JSON.parse(readFileSync(manifest, 'utf8'))
  if (version !== '1.5.1') {
    throw new Error('Review the ts-exec source-decoding patch before updating ts-exec')
  }

  const entrypoint = new URL('build/index.js', packageRoot)
  const source = readFileSync(entrypoint, 'utf8')
  const original = 'transformSync(source.toString(), {'
  const patched =
    'transformSync(typeof source === "string" ? source : Buffer.from(source).toString("utf8"), {'

  if (source.includes(original) && source.split(original).length === 2) {
    writeFileSync(entrypoint, source.replace(original, patched))
  } else if (!source.includes(patched)) {
    throw new Error('Unexpected ts-exec loader source; review the source-decoding patch')
  }
}
