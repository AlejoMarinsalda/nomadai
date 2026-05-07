import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { marked } from '../lib/marked'
import { useAuth } from '../hooks/useAuth'
import { getReports } from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section {
  title: string
  content: string
}

interface Country {
  heading: string
  city: string
  intro: string
  sections: Section[]
}

interface Report {
  session_id: string
  created_at: string
  report_text: string
  destinations: { city: string; country: string }[]
}

// ── Markdown parser ───────────────────────────────────────────────────────────

function cityName(heading: string): string {
  const clean = heading.replace(/^[^A-Za-zÀ-ÿ]+/, '').trim()
  return clean.split(',')[0].trim() || heading
}

function parseReport(markdown: string): Country[] {
  const lines = markdown.split('\n')
  const countries: Country[] = []

  let current: Country | null = null
  let currentSection: Section | null = null
  let buf: string[] = []

  function flushSection() {
    if (!current || !currentSection) return
    currentSection.content = buf.join('\n').replace(/\n?---\s*$/, '').trim()
    current.sections.push(currentSection)
    currentSection = null
    buf = []
  }

  function flushIntro() {
    if (!current) return
    current.intro = buf.join('\n').replace(/\n?---\s*$/, '').trim()
    buf = []
  }

  for (const line of lines) {
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      if (currentSection) flushSection()
      else flushIntro()

      const heading = line.replace(/^##\s+/, '').trim()
      if (/alojarte/i.test(heading)) {
        current = null
        currentSection = null
        buf = []
        continue
      }

      current = { heading, city: cityName(heading), intro: '', sections: [] }
      countries.push(current)
      buf = []
    } else if (/^###\s/.test(line) && current) {
      if (currentSection) flushSection()
      else flushIntro()
      const title = line.replace(/^###\s+/, '').trim()
      currentSection = { title, content: '' }
      buf = []
    } else if (current !== null) {
      buf.push(line)
    }
  }

  if (currentSection) flushSection()
  else flushIntro()

  return countries
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessionId } = useParams<{ sessionId: string }>()
  const { userId, credential } = useAuth()

  const stateReport = (location.state as { report?: Report } | null)?.report

  const [report, setReport] = useState<Report | null>(stateReport ?? null)
  const [fetching, setFetching] = useState(!stateReport)
  const [selected, setSelected] = useState(0)

  // Fetch from API if state wasn't passed (direct URL access / page refresh)
  useEffect(() => {
    if (stateReport) { setFetching(false); return }
    if (!userId || !credential || !sessionId) { setFetching(false); return }
    getReports(userId, credential)
      .then(data => {
        const found = data.reports.find(r => r.session_id === sessionId) ?? null
        setReport(found)
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const countries = useMemo(
    () => (report ? parseReport(report.report_text) : []),
    [report],
  )

  if (fetching) return (
    <div className="h-full flex flex-col gap-3 p-4 max-w-2xl mx-auto w-full">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-16 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (!report) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-4xl">📋</span>
      <p className="text-sm text-zinc-400">No se encontró el reporte.</p>
      <button
        onClick={() => navigate('/history')}
        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        ← Volver al historial
      </button>
    </div>
  )

  const country = countries[selected] ?? null

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 h-12 border-b border-zinc-800/60 bg-zinc-950">
        <button
          onClick={() => navigate('/history')}
          className="text-zinc-400 hover:text-zinc-100 transition-colors text-sm flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Historial
        </button>
        <span className="text-zinc-700">·</span>
        <span className="text-xs text-zinc-500">{formatDate(report.created_at)}</span>
        <div className="ml-auto">
          <button
            onClick={() => navigate(`/chat?session=${report.session_id}`, { state: { report } })}
            className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/50 px-3 py-1 rounded-lg transition-colors"
          >
            Continuar chat →
          </button>
        </div>
      </div>

      {countries.length === 0 ? (
        /* Fallback: show raw markdown if parser found nothing */
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div
            className="max-w-2xl mx-auto px-4 py-5 prose-chat text-sm"
            dangerouslySetInnerHTML={{ __html: marked.parse(report.report_text) as string }}
          />
        </div>
      ) : (
        <>
          {/* Country tabs — horizontal scrollable bar */}
          <div className="flex-shrink-0 border-b border-zinc-800/60 overflow-x-auto">
            <div className="flex gap-1 px-3 py-2.5 min-w-max">
              {countries.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border
                    ${selected === i
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border-transparent'
                    }`}
                >
                  {c.city}
                </button>
              ))}
            </div>
          </div>

          {/* Sections */}
          {country && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-2.5">

                {/* Score / cost intro */}
                {country.intro && (
                  <div
                    className="prose-chat text-sm px-1 pb-1"
                    dangerouslySetInnerHTML={{ __html: marked.parse(country.intro) as string }}
                  />
                )}

                {/* Collapsible sections */}
                {country.sections.map((sec, j) => (
                  <details key={j} className="section-block">
                    <summary className="section-title">{sec.title}</summary>
                    <div
                      className="section-body prose-chat text-sm"
                      dangerouslySetInnerHTML={{ __html: marked.parse(sec.content) as string }}
                    />
                  </details>
                ))}

              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}
