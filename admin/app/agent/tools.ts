import MapMarker from '#models/map_marker'
import { RagService } from '#services/rag_service'
import { listBooks, readArticle, searchLibrary } from './kiwix.js'
import { CATEGORIES, findPlaces, type Place } from './places.js'

/**
 * The chat agent's tools: Ollama-native definitions plus their executors.
 *
 * Every executor returns two views of the same result. `forModel` is compact
 * JSON that goes back into the conversation; `summary`, `links` and `places`
 * are for the step list the user watches. Nothing here writes data: a pin is
 * only *proposed*, and the user's click creates it through the marker API.
 */

export interface StepLink {
  title: string
  url: string
  kind: 'library' | 'map' | 'file'
}

export interface PinProposal {
  name: string
  latitude: number
  longitude: number
  color: string
  notes: string | null
}

export interface ToolOutcome {
  forModel: string
  summary: string
  links?: StepLink[]
  places?: Place[]
  proposal?: PinProposal
}

export interface ToolContext {
  signal: AbortSignal
  ragService: RagService
}

const CATEGORY_KEYS = Object.keys(CATEGORIES)
const PIN_COLORS = ['orange', 'red', 'green', 'blue', 'purple', 'yellow']

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_library',
      description:
        'Full-text search in the offline library (Wikipedia, medical references, survival guides, repair guides, cooking). Use English search terms: most books are English. Returns titles, a snippet and the article path.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search terms, preferably English, 2-6 words' },
          book: {
            type: 'string',
            description: 'Optional book name from list_books to search only that book',
          },
          limit: { type: 'number', description: 'Number of hits, default 8, max 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_article',
      description:
        'Read the text of one library article. Pass the path from a search_library hit. Read the most promising 1-2 hits before you answer.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description:
              'Article path such as /content/wikipedia_en_all_mini_2026-06/Water_purification',
          },
          max_chars: { type: 'number', description: 'Default 6000, max 12000' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_books',
      description:
        'List the books (ZIM archives) in the offline library with their name and topic.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        "Semantic search in the user's own uploaded documents (PDFs, notes). Use when the question is about the user's files.",
      parameters: {
        type: 'object',
        required: ['query'],
        properties: { query: { type: 'string', description: 'What to look for' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_places',
      description:
        "Find pins on the user's offline map: water sources, official emergency points, hospitals, pharmacies, defibrillators, police, fire stations, food, fuel, hardware stores, transport, and places of people the user knows. Sorted by distance from `near`. Use the map_url of each result as a link.",
      parameters: {
        type: 'object',
        properties: {
          near: {
            type: 'string',
            description: 'A pin name, e.g. the user\'s home pin, or "lat,lng"',
          },
          category: {
            type: 'string',
            enum: [...CATEGORY_KEYS, 'any'],
            description: 'Kind of place',
          },
          text: { type: 'string', description: 'Optional word that must appear in name or notes' },
          radius_km: { type: 'number', description: 'Search radius, default 5' },
          limit: { type: 'number', description: 'Max results, default 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_pin',
      description:
        'Suggest a new map pin. This does NOT save it: the user sees a card and decides. Use only when the user asks to remember or mark a place.',
      parameters: {
        type: 'object',
        required: ['name', 'latitude', 'longitude'],
        properties: {
          name: { type: 'string', description: 'Short name, may start with an emoji' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          color: { type: 'string', enum: PIN_COLORS },
          notes: { type: 'string' },
        },
      },
    },
  },
]

const num = (v: unknown, fallback?: number) => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : fallback
}

export async function runTool(
  name: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  switch (name) {
    case 'search_library': {
      const query = String(args.query ?? '').trim()
      if (!query) return { forModel: '{"error":"query is empty"}', summary: 'Empty search' }
      const hits = await searchLibrary(query, {
        book: args.book ? String(args.book) : undefined,
        limit: num(args.limit, 8),
        signal: ctx.signal,
      })
      return {
        forModel: JSON.stringify(
          hits.map(({ title, book, path, snippet }) => ({ title, book, path, snippet }))
        ),
        summary: `${hits.length} hits for “${query}”`,
        links: hits.map((h) => ({
          title: `${h.title} · ${h.book}`,
          url: h.url,
          kind: 'library' as const,
        })),
      }
    }
    case 'read_article': {
      const a = await readArticle(String(args.path ?? ''), {
        maxChars: num(args.max_chars, 6000),
        signal: ctx.signal,
      })
      return {
        forModel: JSON.stringify({
          title: a.title,
          url: a.url,
          truncated: a.truncated,
          text: a.text,
        }),
        summary: `Read: ${a.title}${a.truncated ? ' (shortened)' : ''}`,
        links: [{ title: a.title, url: a.url, kind: 'library' }],
      }
    }
    case 'list_books': {
      const books = await listBooks(ctx.signal)
      return {
        forModel: JSON.stringify(
          books.map((b) => ({
            name: b.name,
            title: b.title,
            summary: b.summary,
            language: b.language,
          }))
        ),
        summary: `${books.length} books in the library`,
      }
    }
    case 'search_knowledge_base': {
      const query = String(args.query ?? '').trim()
      const docs = await ctx.ragService.searchSimilarDocuments(query, 5, 0.3)
      return {
        forModel: JSON.stringify(
          docs.map((d) => ({
            source: d.metadata?.source ?? d.metadata?.title ?? null,
            text: d.text.slice(0, 1200),
          }))
        ),
        summary: `${docs.length} passages in your documents`,
        links: docs
          .filter((d) => d.metadata?.source)
          .map((d) => ({
            title: String(d.metadata?.title ?? d.metadata?.source),
            url: String(d.metadata?.source),
            kind: 'file' as const,
          })),
      }
    }
    case 'find_places': {
      const markers = await MapMarker.query().where('visible', true)
      const { origin, results, unresolvedNear } = findPlaces(
        markers.map((m) => ({
          id: m.id,
          name: m.name,
          latitude: m.latitude,
          longitude: m.longitude,
          color: m.color,
          notes: m.notes,
        })),
        {
          near: args.near ? String(args.near) : undefined,
          category: args.category ? String(args.category) : undefined,
          text: args.text ? String(args.text) : undefined,
          radiusKm: num(args.radius_km, 5),
          limit: num(args.limit, 10),
        }
      )
      const label =
        args.category && CATEGORIES[args.category] ? CATEGORIES[args.category].label : 'places'
      return {
        forModel: JSON.stringify({
          origin,
          note: unresolvedNear
            ? `No pin named "${args.near}" found; distances are missing.`
            : undefined,
          results: results.map(
            ({ name: placeName, category, distance_km, notes, map_url, latitude, longitude }) => ({
              name: placeName,
              category,
              distance_km,
              notes,
              map_url,
              latitude,
              longitude,
            })
          ),
        }),
        summary: `${results.length} ${label}${origin ? ` near ${origin}` : ''}`,
        places: results,
        links: results.map((p) => ({
          title: `${p.name}${p.distance_km !== null ? ` · ${p.distance_km} km` : ''}`,
          url: p.map_url,
          kind: 'map' as const,
        })),
      }
    }
    case 'propose_pin': {
      const lat = num(args.latitude)
      const lng = num(args.longitude)
      if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return { forModel: '{"error":"invalid coordinates"}', summary: 'Invalid coordinates' }
      }
      const proposal: PinProposal = {
        name: String(args.name ?? 'New pin').slice(0, 255),
        latitude: lat,
        longitude: lng,
        color: PIN_COLORS.includes(args.color) ? args.color : 'orange',
        notes: args.notes ? String(args.notes).slice(0, 500) : null,
      }
      return {
        forModel: JSON.stringify({ status: 'shown to the user for confirmation; not saved yet' }),
        summary: `Pin proposed: ${proposal.name}`,
        proposal,
      }
    }
    default:
      return {
        forModel: JSON.stringify({ error: `unknown tool ${name}` }),
        summary: `Unknown tool ${name}`,
      }
  }
}
