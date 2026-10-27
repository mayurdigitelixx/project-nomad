import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)

const proxyaddr = require('proxy-addr')
assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.7', 0), false)
assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3', 0), true)
console.log('PASS proxy trust rejects unrelated IPv4 clients')

const { parserStream } = await import('stream-json')
const { pick } = await import('stream-json/filters/pick.js')
const { streamArray } = await import('stream-json/streamers/stream-array.js')
const expected = [
  { id: 1, text: 'Café' },
  { id: 2, nested: { ok: true } },
]
const json = JSON.stringify({ results: expected })
const rows = []
await pipeline(
  Readable.from([...json].map((c) => c)),
  parserStream(),
  pick.asStream({ filter: 'results' }),
  streamArray.asStream(),
  new Writable({
    objectMode: true,
    write(row, encoding, done) {
      rows.push(row.value)
      done()
    },
  })
)
assert.deepEqual(rows, expected)
console.log('PASS streamed data import preserves records across chunk boundaries')

const tar = await import('tar')
const temporary = await mkdtemp(join(tmpdir(), 'nomad-security-'))
try {
  await mkdir(join(temporary, 'input'))
  await mkdir(join(temporary, 'output'))
  await writeFile(join(temporary, 'input', 'sample.json'), json)
  await tar.c({ cwd: join(temporary, 'input'), file: join(temporary, 'sample.tar') }, [
    'sample.json',
  ])
  await tar.x({ cwd: join(temporary, 'output'), file: join(temporary, 'sample.tar') })
  assert.equal(await readFile(join(temporary, 'output', 'sample.json'), 'utf8'), json)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
console.log('PASS patched archive creation and extraction')

const { default: sharp } = await import('sharp')
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } })
  .png()
  .toBuffer()
assert.equal((await sharp(png).metadata()).width, 2)
console.log('PASS native image processing')

const { default: Database } = await import('better-sqlite3')
const db = new Database(':memory:')
try {
  assert.equal(db.prepare('select 42 as answer').get().answer, 42)
} finally {
  db.close()
}
console.log('PASS native SQLite')

const zim = await import('@openzim/libzim')
assert.ok(Object.keys(zim).length)
console.log('PASS native ZIM library loads')

const { faker } = await import('@faker-js/faker')
assert.ok(faker.helpers.fake('{{person.firstName}}').length)
console.log('PASS patched Faker helper')
