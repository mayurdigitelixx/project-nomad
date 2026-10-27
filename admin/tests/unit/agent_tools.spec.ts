import * as assert from 'node:assert/strict'
import { test } from 'node:test'

import { categorize, distanceKm, findPlaces, resolveNear } from '../../app/agent/places.js'
import { articleToText, normalizeArticlePath, parseSearchXml } from '../../app/agent/kiwix.js'

const PINS = [
  { id: 1, name: 'Home', latitude: 51.27504, longitude: 6.61035, color: 'orange', notes: null },
  {
    id: 2,
    name: 'Cabin',
    latitude: 51.22849,
    longitude: 6.68144,
    color: 'orange',
    notes: '+49 1',
  },
  {
    id: 29,
    name: '🆘 Fire station emergency point',
    latitude: 51.27081,
    longitude: 6.62072,
    color: 'purple',
    notes: null,
  },
  {
    id: 44,
    name: '💧 Cemetery taps',
    latitude: 51.2236,
    longitude: 6.6734,
    color: 'blue',
    notes: 'not drinking water',
  },
  {
    id: 12,
    name: '💊 Elefanten-Apotheke',
    latitude: 51.2816,
    longitude: 6.6222,
    color: 'red',
    notes: 'Tel +49 2159 51166',
  },
  { id: 20, name: '🛒 Netto', latitude: 51.278, longitude: 6.603, color: 'green', notes: null },
]

test('categorize reads the emoji first, then keywords, never the colour', () => {
  assert.equal(categorize({ name: '💧 Spring', notes: null }), 'water')
  assert.equal(categorize({ name: '🆘 Crossing X', notes: null }), 'emergency_point')
  assert.equal(categorize({ name: '❤️ Defibrillator (AED)', notes: null }), 'defibrillator')
  assert.equal(categorize({ name: 'St. Mary Hospital', notes: null }), 'hospital')
  assert.equal(categorize({ name: 'Elefanten-Apotheke', notes: null }), 'pharmacy')
  assert.equal(
    categorize({ name: 'Old mill', notes: 'hand pump well, not drinking water' }),
    'water'
  )
  assert.equal(categorize({ name: 'Josi', notes: '+49 1' }), 'other')
})

test('distanceKm matches a known distance (Home to Cabin ~ 7 km)', () => {
  const d = distanceKm([51.27504, 6.61035], [51.22849, 6.68144])
  assert.ok(d > 6.5 && d < 7.5, `got ${d}`)
})

test('resolveNear prefers an exact name and accepts lat,lng', () => {
  assert.equal(resolveNear('home', PINS)?.label, 'Home')
  assert.equal(resolveNear('cab', PINS)?.label, 'Cabin')
  assert.deepEqual(resolveNear('51.1, 6.2', PINS)?.point, [51.1, 6.2])
  assert.equal(resolveNear('Mond', PINS), null)
})

test('findPlaces filters by category, sorts by distance and links the pin', () => {
  const { origin, results } = findPlaces(PINS, {
    near: 'Home',
    category: 'emergency_point',
    radiusKm: 5,
  })
  assert.equal(origin, 'Home')
  assert.equal(results.length, 1)
  assert.equal(results[0].id, 29)
  assert.equal(results[0].map_url, '/maps?marker=29')
  assert.ok(results[0].distance_km! < 1)
})

test('findPlaces never returns the origin itself and respects the radius', () => {
  const near = findPlaces(PINS, { near: 'Home', radiusKm: 1.2 }).results.map((p) => p.id)
  assert.ok(!near.includes(1))
  assert.ok(near.includes(29) && near.includes(20))
  assert.ok(!near.includes(44))
})

test('findPlaces text filter searches notes', () => {
  const r = findPlaces(PINS, { text: 'drinking' }).results
  assert.deepEqual(
    r.map((p) => p.id),
    [44]
  )
})

test('parseSearchXml extracts hits and drops non-article links', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Water purification</title><link>/content/wikipedia_en_all_mini_2026-06/Water_purification</link>
      <description>Boil &lt;b&gt;water&lt;/b&gt; for one minute</description><book><title>Wikipedia</title></book></item>
    <item><title>junk</title><link>/search?x</link><description>x</description><book><title>W</title></book></item>
  </channel></rss>`
  const hits = parseSearchXml(xml)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].book, 'Wikipedia')
  assert.equal(hits[0].snippet, 'Boil water for one minute')
  assert.ok(hits[0].url.endsWith('/content/wikipedia_en_all_mini_2026-06/Water_purification'))
})

test('normalizeArticlePath accepts paths, bare names and full URLs', () => {
  assert.equal(normalizeArticlePath('http://localhost:8090/content/a/B#x'), '/content/a/B')
  assert.equal(normalizeArticlePath('/content/a/B'), '/content/a/B')
  assert.equal(normalizeArticlePath('a/B'), '/content/a/B')
})

test('articleToText keeps headings, list items and table rows', () => {
  const html = `<html><head><title>Boiling</title></head><body>
    <h2>Method</h2><p>Bring to a rolling boil.</p><ul><li>One minute</li></ul>
    <table><tr><th>Altitude</th><th>Time</th></tr><tr><td>&gt;2000 m</td><td>3 min</td></tr></table>
    <script>x()</script></body></html>`
  const { title, text } = articleToText(html)
  assert.equal(title, 'Boiling')
  assert.match(text, /## Method/)
  assert.match(text, /- One minute/)
  assert.match(text, /Altitude \| Time/)
  assert.doesNotMatch(text, /x\(\)/)
})
