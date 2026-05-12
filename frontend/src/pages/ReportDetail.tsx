import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from '../lib/marked'
import { useAuth } from '../hooks/useAuth'
import { getReports } from '../lib/api'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'
const CARD   = '#FFFFFF'
const MUTED  = '#9E9186'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section { title: string; content: string }
interface Country { heading: string; city: string; intro: string; sections: Section[] }
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
    currentSection = null; buf = []
  }
  function flushIntro() {
    if (!current) return
    current.intro = buf.join('\n').replace(/\n?---\s*$/, '').trim()
    buf = []
  }

  for (const line of lines) {
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      if (currentSection) flushSection(); else flushIntro()
      const heading = line.replace(/^##\s+/, '').trim()
      if (/alojarte/i.test(heading)) { current = null; currentSection = null; buf = []; continue }
      current = { heading, city: cityName(heading), intro: '', sections: [] }
      countries.push(current); buf = []
    } else if (/^###\s/.test(line) && current) {
      if (currentSection) flushSection(); else flushIntro()
      currentSection = { title: line.replace(/^###\s+/, '').trim(), content: '' }; buf = []
    } else if (current !== null) { buf.push(line) }
  }
  if (currentSection) flushSection(); else flushIntro()
  return countries
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
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
  const { t } = useTranslation()

  const stateReport = (location.state as { report?: Report } | null)?.report
  const [report, setReport] = useState<Report | null>(stateReport ?? null)
  const [fetching, setFetching] = useState(!stateReport)
  const [selected, setSelected] = useState(0)

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

  const countries = useMemo(() => (report ? parseReport(report.report_text) : []), [report])

  if (fetching) return (
    <div className="h-full p-4 max-w-2xl mx-auto w-full flex flex-col gap-3" style={{ background: BG }}>
      {[1,2,3].map(i => (
        <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: CARD, border: `1px solid ${BORDER}` }} />
      ))}
    </div>
  )

  if (!report) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: BG }}>
      <span className="text-4xl">📋</span>
      <p className="text-sm" style={{ color: MUTED }}>{t('report.not_found')}</p>
      <button
        onClick={() => navigate('/history')}
        className="text-sm font-medium transition-colors"
        style={{ color: ACCENT }}
      >
        {t('report.back_link')}
      </button>
    </div>
  )

  const country = countries[selected] ?? null

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: BG }}>

      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-5 h-12"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: MUTED }}
          onMouseEnter={e => e.currentTarget.style.color = DARK}
          onMouseLeave={e => e.currentTarget.style.color = MUTED}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          {t('report.back_btn')}
        </button>

        <span style={{ color: BORDER }}>·</span>
        <span className="text-xs" style={{ color: MUTED }}>{formatDate(report.created_at)}</span>

        <div className="ml-auto">
          <button
            onClick={() => navigate(`/chat?session=${report.session_id}`, { state: { report } })}
            className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
            style={{ color: ACCENT, border: `1px solid ${BORDER}` }}
            onMouseEnter={e => { e.currentTarget.style.background = CARD }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {t('report.continue_chat')} →
          </button>
        </div>
      </div>

      {countries.length === 0 ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div
            className="max-w-2xl mx-auto px-5 py-6 prose-chat text-sm"
            dangerouslySetInnerHTML={{ __html: marked.parse(report.report_text) as string }}
          />
        </div>
      ) : (
        <>
          {/* ── City tabs ── */}
          <div
            className="flex-shrink-0 overflow-x-auto"
            style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}
          >
            <div className="flex gap-1 px-4 py-2 min-w-max">
              {countries.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                  style={{
                    background:  selected === i ? DARK : 'transparent',
                    color:       selected === i ? '#FFFFFF' : MUTED,
                    border:      `1px solid ${selected === i ? DARK : 'transparent'}`,
                  }}
                  onMouseEnter={e => { if (selected !== i) { e.currentTarget.style.background = CARD; e.currentTarget.style.color = DARK } }}
                  onMouseLeave={e => { if (selected !== i) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED } }}
                >
                  {c.city}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ── */}
          {country && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-2.5">

                {country.intro && (
                  <div
                    className="prose-chat text-sm pb-2"
                    dangerouslySetInnerHTML={{ __html: marked.parse(country.intro) as string }}
                  />
                )}

                {country.sections.map((sec, j) => (
                  <details
                    key={j}
                    className="rounded-xl overflow-hidden"
                    style={{ background: CARD, border: `1px solid ${BORDER}` }}
                  >
                    <summary
                      className="flex items-center justify-between px-4 py-3 text-sm font-semibold cursor-pointer select-none"
                      style={{ color: DARK }}
                    >
                      {sec.title}
                      <span className="text-xs ml-2 flex-shrink-0" style={{ color: MUTED }}>▸</span>
                    </summary>
                    <div
                      className="px-4 pb-4 prose-chat text-sm"
                      style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '0.75rem' }}
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
