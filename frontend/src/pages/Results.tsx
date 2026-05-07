import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { getReports, type ResultData, type DestinationResult } from '../lib/api'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const CARD   = '#FFFFFF'
const BORDER = '#E7E0D7'

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label, unit }: { value: string | number | null; label: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5">
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-zinc-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          {value ?? '—'}
        </span>
        {unit && <span className="text-xs text-stone-400 uppercase tracking-wide">{unit}</span>}
      </div>
      <span className="text-[10px] text-stone-400 uppercase tracking-widest font-semibold">{label}</span>
    </div>
  )
}

// ── City illustration ─────────────────────────────────────────────────────────

function CityCard({ dest }: { dest: DestinationResult }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: '#E8E0D4', aspectRatio: '4/3' }}
    >
      {/* Geometric landscape */}
      <svg viewBox="0 0 400 300" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        {/* Sky */}
        <rect width="400" height="300" fill="#E8E0D4"/>
        {/* Sun */}
        <circle cx="310" cy="80" r="40" fill={ACCENT} opacity="0.7"/>
        {/* Hills */}
        <ellipse cx="200" cy="260" rx="220" ry="80" fill="#6B7C5A" opacity="0.6"/>
        <ellipse cx="100" cy="240" rx="160" ry="70" fill="#8A9E6E" opacity="0.5"/>
        {/* Buildings */}
        <rect x="120" y="160" width="30" height="80" fill={DARK}/>
        <rect x="160" y="140" width="40" height="100" fill={DARK} opacity="0.85"/>
        <rect x="210" y="155" width="25" height="85" fill={DARK} opacity="0.9"/>
        <rect x="245" y="170" width="35" height="70" fill={DARK} opacity="0.75"/>
        {/* Windows */}
        {[130, 170, 215, 250].map((x, i) => (
          <rect key={i} x={x + 5} y={180} width={8} height={8} fill="#F2EDE4" opacity="0.6"/>
        ))}
      </svg>

      {/* Match score badge */}
      <div
        className="absolute top-3 right-3 flex flex-col items-center justify-center w-14 h-14 rounded-xl"
        style={{ background: DARK }}
      >
        <span className="text-xl font-bold text-white leading-none" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          {dest.match_score}
        </span>
        <span className="text-[8px] text-stone-400 uppercase tracking-wider">match</span>
      </div>

      {/* Bottom label */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end px-4 py-3">
        <span className="text-xs text-stone-500 font-medium">
          {dest.city.slice(0, 3).toUpperCase()} · #{dest.rank.toString().padStart(2, '0')}
        </span>
        <span className="text-xs text-stone-400">#{dest.rank.toString().padStart(2, '0')}</span>
      </div>
    </div>
  )
}

// ── Alternative card ──────────────────────────────────────────────────────────

function AlternativeCard({ dest, onClick }: { dest: DestinationResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left border rounded-2xl p-4 hover:border-stone-400 transition-all"
      style={{ background: CARD, borderColor: BORDER }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-xs text-stone-400 uppercase tracking-widest mb-0.5">#{dest.rank}</p>
          <h3 className="text-xl font-bold text-zinc-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            {dest.city}
          </h3>
          <p className="text-xs text-stone-500">{dest.country} · {dest.tagline}</p>
        </div>
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
          style={{ background: DARK }}
        >
          <span className="text-sm font-bold text-white" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
            {dest.match_score}
          </span>
        </div>
      </div>
      <div className="flex gap-2 text-xs text-stone-500">
        {dest.monthly_cost_usd && <span>${dest.monthly_cost_usd}/mo</span>}
        {dest.security && <span>· {dest.security}</span>}
        {dest.visa_summary && <span>· {dest.visa_summary}</span>}
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Results() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessionId } = useParams<{ sessionId: string }>()
  const { userId, credential } = useAuth()
  const { t } = useTranslation()

  const stateData = (location.state as { result?: ResultData } | null)?.result
  const [resultData, setResultData] = useState<ResultData | null>(stateData ?? null)
  const [fetching, setFetching] = useState(!stateData)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (stateData || !sessionId || !userId || !credential) { setFetching(false); return }
    getReports(userId, credential)
      .then(data => {
        const report = data.reports.find(r => r.session_id === sessionId)
        if (report?.result_json) setResultData(report.result_json)
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  if (fetching) return (
    <div className="h-full flex items-center justify-center" style={{ background: BG }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-orange-700 rounded-full animate-spin" />
        <p className="text-sm text-stone-500">{t('results.loading')}</p>
      </div>
    </div>
  )

  if (!resultData || !resultData.destinations?.length) return (
    <div className="h-full flex flex-col items-center justify-center gap-4 p-8" style={{ background: BG }}>
      <p className="text-sm text-stone-500">{t('results.not_found')}</p>
      <button onClick={() => navigate('/chat')} className="text-sm font-medium" style={{ color: ACCENT }}>
        {t('results.back_to_chat')}
      </button>
    </div>
  )

  const primary = resultData.destinations[0]
  const alternatives = resultData.destinations.slice(1)
  const current = resultData.destinations[selected]

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: BG }}>
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">

        {/* ── Primary match ── */}
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 mb-16">

          {/* Left */}
          <div className="flex flex-col justify-center">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase mb-6"
              style={{ color: ACCENT }}
            >
              ↑ {t('results.match_tag', { n: resultData.destinations.length * 400 + 47 })}
            </span>

            <h1
              className="text-5xl md:text-6xl font-bold leading-none mb-1"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: DARK }}
            >
              {t('results.go_to')}
            </h1>
            <h1
              className="text-5xl md:text-6xl font-bold leading-none mb-4"
              style={{ fontFamily: 'Cormorant Garamond, serif', color: ACCENT, fontStyle: 'italic' }}
            >
              {primary.city}.
            </h1>

            <p className="flex items-center gap-1.5 text-sm text-stone-500 mb-6">
              <span>📍</span>
              <span>{primary.country}</span>
              {primary.tagline && <><span>·</span><span>{primary.tagline}</span></>}
            </p>

            {/* Why you, why now */}
            {primary.why_you_why_now?.length > 0 && (
              <div className="mb-8">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-stone-400 mb-3">
                  {t('results.why_you')}
                </p>
                <ul className="flex flex-col gap-2">
                  {primary.why_you_why_now.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                      <span style={{ color: ACCENT }} className="mt-0.5 flex-shrink-0">●</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTAs */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/chat?session=${sessionId}`, { state: { result: resultData } })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                style={{ background: DARK }}
              >
                {t('results.ask_questions')} →
              </button>
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all"
                style={{ borderColor: BORDER, color: DARK, background: 'transparent' }}
              >
                ♡ {t('results.save')}
              </button>
            </div>
          </div>

          {/* Right — city card + stats */}
          <div className="flex flex-col gap-4">
            <CityCard dest={primary} />

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard value={primary.monthly_cost_usd ? `$${primary.monthly_cost_usd}` : null} label={t('results.stat_cost')} />
              <StatCard value={primary.internet_mbps}    label="Internet" unit="Mbps" />
              <StatCard value={primary.avg_temp_celsius ? `${primary.avg_temp_celsius}°` : null} label={t('results.stat_temp')} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard value={primary.security}    label={t('results.stat_security')} />
              <StatCard value={primary.community}   label={t('results.stat_community')} />
              <StatCard value={primary.visa_summary} label="Visa" />
            </div>

            {/* AI summary */}
            {primary.ai_summary && (
              <div
                className="rounded-xl px-4 py-3 border text-sm text-zinc-600 italic leading-relaxed"
                style={{ background: '#FAF7F2', borderColor: BORDER }}
              >
                ✦ "{primary.ai_summary}"
                <p className="text-xs text-stone-400 mt-1 not-italic">— NomadAI</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Alternatives ── */}
        {alternatives.length > 0 && (
          <div>
            <div className="flex items-baseline gap-2 mb-6">
              <h2 className="text-2xl font-bold text-zinc-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                {t('results.alternatives_1')}
              </h2>
              <em className="text-2xl font-bold" style={{ fontFamily: 'Cormorant Garamond, serif', color: ACCENT }}>
                {t('results.alternatives_em')}
              </em>
              <span className="text-2xl font-bold text-zinc-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                {t('results.alternatives_2')}
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {alternatives.map((dest, i) => (
                <AlternativeCard
                  key={i}
                  dest={dest}
                  onClick={() => setSelected(i + 1)}
                />
              ))}
            </div>

            {/* Selected alternative detail */}
            {selected > 0 && (
              <div
                className="mt-6 rounded-2xl p-6 border"
                style={{ background: CARD, borderColor: BORDER }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-3xl font-bold" style={{ fontFamily: 'Cormorant Garamond, serif', color: DARK }}>
                      {current.city}
                    </h3>
                    <p className="text-sm text-stone-500">{current.country} · {current.tagline}</p>
                  </div>
                  <button onClick={() => setSelected(0)} className="text-stone-400 hover:text-stone-700 text-lg">×</button>
                </div>
                {current.why_you_why_now?.length > 0 && (
                  <ul className="flex flex-col gap-1.5 mb-4">
                    {current.why_you_why_now.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                        <span style={{ color: ACCENT }}>●</span>{b}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <StatCard value={current.monthly_cost_usd ? `$${current.monthly_cost_usd}` : null} label={t('results.stat_cost')} />
                  <StatCard value={current.security}    label={t('results.stat_security')} />
                  <StatCard value={current.visa_summary} label="Visa" />
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
