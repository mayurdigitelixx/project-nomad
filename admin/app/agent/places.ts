/**
 * Geometry and categorisation for the agent's map tools. Pure functions, so
 * they are unit-tested without a database.
 *
 * Markers carry no category field, so a pin's category is read from its name
 * and notes: a leading emoji first (the most deliberate signal), then keywords
 * in English and a few common languages. Colour is not used: every pin starts
 * out orange, so it says nothing about what the place is.
 */

export interface PlaceInput {
  id: number
  name: string
  latitude: number
  longitude: number
  color: string
  notes: string | null
}

export interface Place extends PlaceInput {
  category: string
  distance_km: number | null
  map_url: string
}

export const CATEGORIES: Record<string, { label: string; emoji: string[]; words: string[] }> = {
  water: {
    label: 'water sources',
    emoji: ['💧', '🚰'],
    words: [
      'water',
      'well',
      'spring',
      'fountain',
      'refill',
      'wasser',
      'brunnen',
      'quelle',
      'eau',
      'agua',
    ],
  },
  emergency_point: {
    label: 'emergency points',
    emoji: ['🆘'],
    words: [
      'emergency point',
      'shelter',
      'assembly point',
      'notanlaufstelle',
      'notfall-infopunkt',
      'infopunkt',
      'sammelplatz',
    ],
  },
  hospital: {
    label: 'hospitals',
    emoji: ['🏥'],
    words: ['hospital', 'clinic', 'emergency room', 'krankenhaus', 'klinik', 'hospital', 'hôpital'],
  },
  pharmacy: {
    label: 'pharmacies',
    emoji: ['💊'],
    words: ['pharmacy', 'chemist', 'apotheke', 'pharmacie', 'farmacia'],
  },
  defibrillator: {
    label: 'defibrillators',
    emoji: ['❤️', '❤'],
    words: ['defibrillator', 'aed', 'defi'],
  },
  police: { label: 'police', emoji: ['👮', '🚓'], words: ['police', 'polizei', 'sheriff'] },
  fire_station: {
    label: 'fire stations',
    emoji: ['🚒'],
    words: ['fire station', 'fire dept', 'feuerwehr', 'feuerwache', 'pompiers'],
  },
  food: {
    label: 'food',
    emoji: ['🛒', '🥚', '🥛', '🍞'],
    words: [
      'supermarket',
      'grocery',
      'farm shop',
      'market',
      'supermarkt',
      'hofladen',
      'bäcker',
      'bakery',
    ],
  },
  fuel: { label: 'fuel', emoji: ['⛽'], words: ['fuel', 'gas station', 'petrol', 'tankstelle'] },
  hardware: {
    label: 'hardware stores',
    emoji: ['🔧', '🔨'],
    words: ['hardware', 'home improvement', 'baumarkt'],
  },
  transport: {
    label: 'transport',
    emoji: ['🚆', '🚉', '🚌'],
    words: ['station', 'bahnhof', 'bus stop'],
  },
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export function categorize(p: Pick<PlaceInput, 'name' | 'notes'>): string {
  for (const [key, c] of Object.entries(CATEGORIES)) {
    if (c.emoji.some((e) => p.name.includes(e))) return key
  }
  const text = ` ${norm(`${p.name} ${p.notes ?? ''}`)} `
  for (const [key, c] of Object.entries(CATEGORIES)) {
    if (c.words.some((w) => text.includes(` ${norm(w)}`))) return key
  }
  return 'other'
}

export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/**
 * Resolves `near` to a coordinate: "lat,lng", or a pin whose name matches.
 * An exact (normalised) name wins over a substring, so "Base" never resolves
 * to some "Baseball" pin.
 */
export function resolveNear(
  near: string | undefined,
  places: PlaceInput[]
): { point: [number, number]; label: string } | null {
  if (!near || !near.trim()) return null
  const m = near.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (m) return { point: [Number(m[1]), Number(m[2])], label: `${m[1]},${m[2]}` }
  const q = norm(near)
  const exact = places.find((p) => norm(p.name) === q)
  const partial = exact ?? places.find((p) => norm(p.name).includes(q))
  return partial ? { point: [partial.latitude, partial.longitude], label: partial.name } : null
}

export function findPlaces(
  places: PlaceInput[],
  opts: { near?: string; category?: string; text?: string; radiusKm?: number; limit?: number }
): { origin: string | null; results: Place[]; unresolvedNear: boolean } {
  const origin = resolveNear(opts.near, places)
  const text = opts.text ? norm(opts.text) : ''
  const radius = opts.radiusKm ?? 5
  const results = places
    .map((p) => ({
      ...p,
      category: categorize(p),
      distance_km: origin
        ? Math.round(distanceKm(origin.point, [p.latitude, p.longitude]) * 100) / 100
        : null,
      map_url: `/maps?marker=${p.id}`,
    }))
    .filter((p) => !opts.category || opts.category === 'any' || p.category === opts.category)
    .filter((p) => !text || norm(`${p.name} ${p.notes ?? ''}`).includes(text))
    .filter((p) => !origin || p.name !== origin.label)
    .filter((p) => p.distance_km === null || p.distance_km <= radius)
    .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    .slice(0, Math.min(opts.limit ?? 10, 30))
  return { origin: origin?.label ?? null, results, unresolvedNear: !!opts.near && !origin }
}
