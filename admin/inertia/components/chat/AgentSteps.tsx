import { useMemo, useState } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import {
  IconAlertTriangle,
  IconBook,
  IconBooks,
  IconCheck,
  IconFileText,
  IconMapPin,
  IconMapPinPlus,
  IconSearch,
} from '@tabler/icons-react'
import api from '~/lib/api'
import MarkerPin from '../maps/MarkerPin'
import type { AgentPlaceView, AgentStepView } from '../../../types/chat'

/**
 * What the chat agent did behind an answer: one line per tool call, live while
 * it runs, with the hits as links; a small map for places; and a card for pin
 * proposals, which only becomes a pin when the user clicks.
 */

const TOOL_LABEL: Record<string, { icon: typeof IconSearch; verb: string }> = {
  search_library: { icon: IconSearch, verb: 'Searching the library' },
  read_article: { icon: IconBook, verb: 'Reading' },
  list_books: { icon: IconBooks, verb: 'Listing the books' },
  search_knowledge_base: { icon: IconFileText, verb: 'Searching your documents' },
  find_places: { icon: IconMapPin, verb: 'Looking up map pins' },
  propose_pin: { icon: IconMapPinPlus, verb: 'Proposing a pin' },
}

function argText(step: AgentStepView): string {
  const a = step.args as Record<string, any>
  if (step.tool === 'search_library' || step.tool === 'search_knowledge_base') return a.query ? `“${a.query}”` : ''
  if (step.tool === 'read_article') return String(a.path ?? '').split('/').pop()?.replace(/_/g, ' ') ?? ''
  if (step.tool === 'find_places') return [a.category, a.text, a.near && `near ${a.near}`].filter(Boolean).join(' · ')
  return ''
}

// MapComponent removes the pmtiles protocol when the full map unmounts, so the
// mini map registers it again before it renders; addProtocol just overwrites.
const ensurePmtiles = () => maplibregl.addProtocol('pmtiles', new Protocol().tile)

function MiniMap({ places }: { places: AgentPlaceView[] }) {
  useState(ensurePmtiles)
  const bounds = useMemo(() => {
    const lats = places.map((p) => p.latitude)
    const lngs = places.map((p) => p.longitude)
    return [
      [Math.min(...lngs) - 0.004, Math.min(...lats) - 0.003],
      [Math.max(...lngs) + 0.004, Math.max(...lats) + 0.003],
    ] as [[number, number], [number, number]]
  }, [places])
  return (
    <div className="mt-2 h-56 w-full overflow-hidden rounded-md border border-border-subtle">
      <Map
        mapLib={maplibregl}
        mapStyle={`${window.location.protocol}//${window.location.host}/api/maps/styles`}
        initialViewState={{ bounds, fitBoundsOptions: { padding: 28, maxZoom: 15 } }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {places.map((p) => (
          <Marker key={p.id} longitude={p.longitude} latitude={p.latitude} anchor="bottom">
            <a href={p.map_url} target="_blank" rel="noopener noreferrer" title={p.name}>
              <MarkerPin color={p.color} />
            </a>
          </Marker>
        ))}
      </Map>
    </div>
  )
}

function PinProposalCard({ proposal }: { proposal: NonNullable<AgentStepView['proposal']> }) {
  const [state, setState] = useState<'open' | 'saving' | 'saved' | 'dismissed' | 'error'>('open')
  const [savedId, setSavedId] = useState<number | null>(null)
  if (state === 'dismissed') return <div className="mt-2 text-xs text-text-muted">Pin dismissed.</div>
  return (
    <div className="mt-2 rounded-md border border-desert-green/40 bg-surface-primary px-3 py-2 text-xs">
      <div className="font-medium">{proposal.name}</div>
      <div className="text-text-muted">
        {proposal.latitude.toFixed(5)}, {proposal.longitude.toFixed(5)}
        {proposal.notes ? ` · ${proposal.notes}` : ''}
      </div>
      {state === 'saved' ? (
        <div className="mt-1 text-desert-green">
          Saved.{' '}
          <a className="underline" href={`/maps?marker=${savedId}`} target="_blank" rel="noopener noreferrer">
            Show on map
          </a>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={state === 'saving'}
            onClick={async () => {
              setState('saving')
              const m = await api.createMapMarker({
                name: proposal.name,
                latitude: proposal.latitude,
                longitude: proposal.longitude,
                color: proposal.color,
                notes: proposal.notes,
              })
              if (m) {
                setSavedId(m.id)
                setState('saved')
              } else setState('error')
            }}
            className="rounded bg-desert-green px-2 py-1 font-medium text-white hover:bg-desert-green/90"
          >
            {state === 'saving' ? 'Saving…' : 'Save pin'}
          </button>
          <button
            type="button"
            onClick={() => setState('dismissed')}
            className="rounded border border-border-default px-2 py-1 hover:bg-surface-secondary"
          >
            Dismiss
          </button>
          {state === 'error' && <span className="self-center text-red-600">Could not save the pin.</span>}
        </div>
      )}
    </div>
  )
}

export default function AgentSteps({ steps, running }: { steps: AgentStepView[]; running?: boolean }) {
  const places = useMemo(() => {
    const seen: Record<number, AgentPlaceView> = {}
    for (const s of steps) for (const p of s.places ?? []) seen[p.id] = p
    return Object.values(seen)
  }, [steps])
  const proposals = steps.filter((s) => s.proposal)
  if (steps.length === 0 && !running) return null
  return (
    <div className="mb-3">
      <details open={running} className="rounded border border-border-subtle bg-surface-primary/60 text-xs">
        <summary className="cursor-pointer select-none px-3 py-2 font-medium text-text-muted hover:text-text-primary">
          {running ? 'Working…' : `${steps.length} step${steps.length === 1 ? '' : 's'}`}
        </summary>
        <ol className="space-y-2 border-t border-border-subtle px-3 py-2">
          {steps.map((step) => {
            const meta = TOOL_LABEL[step.tool] ?? { icon: IconSearch, verb: step.tool }
            const Icon = meta.icon
            return (
              <li key={step.id}>
                {step.note && <div className="mb-0.5 italic text-text-muted">{step.note}</div>}
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0">
                    {step.status === 'running' ? (
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-desert-green border-t-transparent" />
                    ) : step.status === 'error' ? (
                      <IconAlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    ) : (
                      <IconCheck className="h-3.5 w-3.5 text-desert-green" />
                    )}
                  </span>
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                  <div className="min-w-0">
                    <div>
                      <span className="font-medium">{meta.verb}</span>
                      {argText(step) && <span className="text-text-secondary"> {argText(step)}</span>}
                      {step.summary && <span className="text-text-muted"> → {step.summary}</span>}
                      {step.ms !== undefined && <span className="text-text-muted"> ({(step.ms / 1000).toFixed(1)} s)</span>}
                    </div>
                    {step.links && step.links.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {step.links.slice(0, 8).map((l) => (
                          <li key={l.url} className="truncate">
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-desert-green underline hover:text-desert-green/80"
                            >
                              {l.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </details>
      {places.length > 0 && <MiniMap places={places} />}
      {proposals.map((s) => (
        <PinProposalCard key={s.id} proposal={s.proposal!} />
      ))}
    </div>
  )
}
