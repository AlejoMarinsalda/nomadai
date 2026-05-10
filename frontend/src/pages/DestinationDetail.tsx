import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from '../lib/marked'
import { useAuth } from '../hooks/useAuth'
import { getReports, type ResultData, type DestinationResult } from '../lib/api'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'
const CARD   = '#FFFFFF'
const MUTED  = '#9E9186'

// ── Month labels ───────────────────────────────────────────────────────────────
const ALL_MONTHS    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ALL_MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Map any Spanish month abbreviation to English (for display when lang=en)
const ES_TO_EN: Record<string, string> = {
  ene:'Jan', feb:'Feb', mar:'Mar', abr:'Apr', may:'May', jun:'Jun',
  jul:'Jul', ago:'Aug', sep:'Sep', oct:'Oct', nov:'Nov', dic:'Dec',
}

function localizeMonths(months: string[], lang: string): string[] {
  if (lang.startsWith('en')) {
    return months.map(m => ES_TO_EN[m.toLowerCase()] ?? m)
  }
  return months
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function SectionTitle({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: MUTED }}>{icon}</span>
      <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: MUTED }}>{label}</span>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`} style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      {children}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DestinationDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessionId, rank } = useParams<{ sessionId: string; rank: string }>()
  const { userId, credential } = useAuth()
  const { t, i18n } = useTranslation()

  const stateData = (location.state as { result?: ResultData } | null)?.result
  const [resultData, setResultData] = useState<ResultData | null>(stateData ?? null)
  const [fetching, setFetching] = useState(!stateData)

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

  const dest: DestinationResult | null =
    resultData?.destinations.find(d => d.rank === Number(rank)) ??
    resultData?.destinations[0] ??
    null

  const months = i18n.language.startsWith('en') ? ALL_MONTHS : ALL_MONTHS_ES

  const [originCity, setOriginCity] = useState<string>(
    () => localStorage.getItem('nomadai_origin_city') ?? ''
  )
  function handleOriginChange(val: string) {
    setOriginCity(val)
    localStorage.setItem('nomadai_origin_city', val)
  }

  function slugify(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s,]+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  // IATA codes for common nomad cities and origin cities
  const IATA: Record<string, string> = {
    // LATAM
    'buenos aires': 'EZE', 'bogota': 'BOG', 'bogotá': 'BOG', 'medellin': 'MDE', 'medellín': 'MDE',
    'cartagena': 'CTG', 'cali': 'CLO', 'lima': 'LIM', 'santiago': 'SCL', 'montevideo': 'MVD',
    'mexico city': 'MEX', 'ciudad de mexico': 'MEX', 'guadalajara': 'GDL', 'cancun': 'CUN',
    'cancún': 'CUN', 'oaxaca': 'OAX', 'merida': 'MID', 'mérida': 'MID', 'playa del carmen': 'CUN',
    'sao paulo': 'GRU', 'são paulo': 'GRU', 'rio de janeiro': 'GIG', 'florianopolis': 'FLN',
    'florianópolis': 'FLN', 'recife': 'REC', 'quito': 'UIO', 'caracas': 'CCS',
    // Europa
    'lisbon': 'LIS', 'lisboa': 'LIS', 'porto': 'OPO', 'madrid': 'MAD', 'barcelona': 'BCN',
    'valencia': 'VLC', 'seville': 'SVQ', 'sevilla': 'SVQ', 'malaga': 'AGP', 'málaga': 'AGP',
    'berlin': 'BER', 'berlín': 'BER', 'amsterdam': 'AMS', 'paris': 'CDG', 'rome': 'FCO',
    'roma': 'FCO', 'milan': 'MXP', 'milán': 'MXP', 'athens': 'ATH', 'atenas': 'ATH',
    'prague': 'PRG', 'praga': 'PRG', 'budapest': 'BUD', 'warsaw': 'WAW', 'varsovia': 'WAW',
    'vienna': 'VIE', 'viena': 'VIE', 'zurich': 'ZRH', 'zürich': 'ZRH', 'london': 'LHR',
    'londres': 'LHR', 'dublin': 'DUB', 'dublín': 'DUB', 'tallinn': 'TLL', 'riga': 'RIX',
    'vilnius': 'VNO', 'sofia': 'SOF', 'bucharest': 'OTP', 'bucarest': 'OTP',
    'split': 'SPU', 'dubrovnik': 'DBV', 'zagreb': 'ZAG', 'istanbul': 'IST',
    'tbilisi': 'TBS', 'yerevan': 'EVN', 'tashkent': 'TAS',
    // Asia
    'bangkok': 'BKK', 'chiang mai': 'CNX', 'phuket': 'HKT', 'bali': 'DPS', 'ubud': 'DPS',
    'denpasar': 'DPS', 'kuala lumpur': 'KUL', 'singapore': 'SIN', 'singapur': 'SIN',
    'tokyo': 'NRT', 'tokio': 'NRT', 'osaka': 'KIX', 'seoul': 'ICN', 'seul': 'ICN',
    'taipei': 'TPE', 'hong kong': 'HKG', 'ho chi minh': 'SGN', 'hanoi': 'HAN',
    'phnom penh': 'PNH', 'kathmandu': 'KTM', 'mumbai': 'BOM', 'bangalore': 'BLR',
    'bengaluru': 'BLR', 'goa': 'GOI', 'delhi': 'DEL', 'nueva delhi': 'DEL',
    // Africa & Medio Oriente
    'dubai': 'DXB', 'abu dhabi': 'AUH', 'cape town': 'CPT', 'ciudad del cabo': 'CPT',
    'nairobi': 'NBO', 'marrakech': 'RAK', 'marrakesh': 'RAK', 'cairo': 'CAI', 'el cairo': 'CAI',
    // Otros
    'new york': 'JFK', 'nueva york': 'JFK', 'miami': 'MIA', 'los angeles': 'LAX',
    'toronto': 'YYZ', 'montreal': 'YUL', 'sydney': 'SYD', 'melbourne': 'MEL',
  }

  function getIATA(city: string): string | null {
    return IATA[city.toLowerCase().trim()] ?? null
  }

  function flightLinks(origin: string) {
    const destSlug  = slugify(dest!.city)
    const destIATA  = getIATA(dest!.city)
    const origIATA  = origin.trim() ? getIATA(origin) : null
    const origSlug  = slugify(origin)
    const hasOrigin = !!origin.trim()
    const route     = `${origin} → ${dest!.city}`

    // Kayak: usa IATA si los tiene para ambos, si no usa Momondo como fallback
    const kayakLink = (() => {
      if (hasOrigin && origIATA && destIATA) {
        return { label: 'Kayak', url: `https://www.kayak.com/flights/${origIATA}-${destIATA}`, sub: route, emoji: '🛶' }
      }
      if (!hasOrigin && destIATA) {
        return { label: 'Kayak', url: `https://www.kayak.com/flights/anywhere-${destIATA}`, sub: t('destination.flights_to', { city: dest!.city }), emoji: '🛶' }
      }
      // Fallback a Momondo cuando no hay IATA
      return hasOrigin
        ? { label: 'Momondo', url: `https://www.momondo.com/flight-search/${encodeURIComponent(origin)}/${encodeURIComponent(dest!.city)}`, sub: route, emoji: '🔍' }
        : { label: 'Momondo', url: `https://www.momondo.com/flight-search/Anywhere/${encodeURIComponent(dest!.city)}`, sub: t('destination.flights_to', { city: dest!.city }), emoji: '🔍' }
    })()

    if (hasOrigin) {
      return [
        {
          label: 'Google Flights',
          url: `https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(dest!.city)}`,
          sub: route, emoji: '🌐',
        },
        {
          label: 'Kiwi.com',
          url: `https://www.kiwi.com/en/search/results/${origSlug}/${destSlug}`,
          sub: route, emoji: '🥝',
        },
        kayakLink,
      ]
    }
    return [
      {
        label: 'Google Flights',
        url: `https://www.google.com/travel/flights?q=flights+to+${encodeURIComponent(dest!.city)}+${encodeURIComponent(dest!.country)}`,
        sub: t('destination.flights_to', { city: dest!.city }), emoji: '🌐',
      },
      {
        label: 'Kiwi.com',
        url: `https://www.kiwi.com/en/search/results/anywhere/${destSlug}`,
        sub: t('destination.flights_to', { city: dest!.city }), emoji: '🥝',
      },
      kayakLink,
    ]
  }

  if (fetching) return (
    <div className="h-full flex items-center justify-center" style={{ background: BG }}>
      <div className="w-8 h-8 border-2 border-stone-300 border-t-orange-700 rounded-full animate-spin" />
    </div>
  )

  if (!dest) return (
    <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: BG }}>
      <p className="text-sm" style={{ color: MUTED }}>{t('destination.not_found')}</p>
      <button onClick={() => navigate(-1)} className="text-sm" style={{ color: ACCENT }}>← {t('destination.back')}</button>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: BG }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 sticky top-0 z-10" style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <button
          onClick={() => navigate(`/results/${sessionId}`, { state: { result: resultData } })}
          className="text-sm flex items-center gap-1.5 transition-colors"
          style={{ color: MUTED }}
          onMouseEnter={e => e.currentTarget.style.color = DARK}
          onMouseLeave={e => e.currentTarget.style.color = MUTED}
        >
          ← {t('destination.back')}
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">✈️</span>
          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', fontWeight: 700, color: DARK }}>
            nomad<em style={{ color: ACCENT }}>ai</em>
          </span>
        </div>
        <div style={{ width: 80 }} />
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* ── Hero ── */}
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase mb-4 block" style={{ color: ACCENT }}>
            ↑ {t('destination.match_tag', { score: dest.match_score })}
          </span>

          <div className="flex items-start justify-between gap-6 mb-4">
            <h1 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '5rem', fontWeight: 700, lineHeight: 1, color: ACCENT, letterSpacing: '-0.02em' }}>
              {dest.city}.
            </h1>
            {/* Circular match score */}
            <div className="flex flex-col items-center flex-shrink-0 mt-2">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ border: `3px solid ${ACCENT}`, background: 'transparent' }}
              >
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2rem', fontWeight: 700, color: DARK }}>
                  {dest.match_score}
                </span>
              </div>
              <span className="text-[9px] font-semibold tracking-widest uppercase mt-1" style={{ color: MUTED }}>
                MATCH SCORE
              </span>
            </div>
          </div>

          <p className="text-sm mb-5" style={{ color: MUTED }}>
            📍 {dest.country}{dest.tagline ? ` · ${dest.tagline}` : ''}
          </p>

          {/* AI Quote */}
          {dest.ai_summary && (
            <div className="rounded-xl px-5 py-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-sm leading-relaxed italic" style={{ color: DARK }}>
                ✦ "{dest.ai_summary}"
              </p>
              <p className="text-xs mt-2 font-semibold tracking-widest" style={{ color: MUTED }}>— NOMADAI</p>
            </div>
          )}
        </div>

        {/* ── Cost + Climate ── */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Cost */}
          <Card>
            <SectionTitle icon="💰" label={t('destination.monthly_cost')} />
            <div className="mb-4">
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.5rem', fontWeight: 700, color: DARK }}>
                ${dest.monthly_cost_usd?.toLocaleString() ?? '—'}
              </span>
              <span className="text-sm ml-1" style={{ color: MUTED }}>/mo</span>
            </div>
            {/* Approximate cost breakdown */}
            {dest.monthly_cost_usd && (() => {
              const total = dest.monthly_cost_usd
              const items = [
                { label: t('destination.cost_housing'),    pct: 0.45, color: ACCENT },
                { label: t('destination.cost_food'),       pct: 0.22, color: '#E8936A' },
                { label: t('destination.cost_coworking'),  pct: 0.12, color: '#7B8FA1' },
                { label: t('destination.cost_transport'),  pct: 0.08, color: '#C8BFB2' },
                { label: t('destination.cost_leisure'),    pct: 0.13, color: DARK },
              ]
              return (
                <div className="flex flex-col gap-2.5">
                  {items.map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-xs w-24 flex-shrink-0" style={{ color: MUTED }}>{item.label}</span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#F0EBE2' }}>
                        <div className="h-full rounded-full" style={{ width: `${item.pct * 100}%`, background: item.color }} />
                      </div>
                      <span className="text-xs font-semibold w-14 text-right" style={{ color: DARK }}>
                        ${Math.round(total * item.pct).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </Card>

          {/* Climate */}
          <Card>
            <SectionTitle icon="☀️" label={t('destination.climate')} />
            {dest.avg_temp_celsius && (
              <div className="mb-4">
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.5rem', fontWeight: 700, color: DARK }}>
                  {dest.avg_temp_celsius}°
                </span>
                <span className="text-sm ml-1" style={{ color: MUTED }}>avg</span>
              </div>
            )}
            {/* Month bars */}
            <div className="flex gap-1 items-end mb-2" style={{ height: 48 }}>
              {months.map((m, i) => {
                // Normalize stored months (may be ES or EN) to match display language
                const stored_best  = localizeMonths(dest.climate.best_months, i18n.language)
                const stored_avoid = localizeMonths(dest.climate.avoid_months, i18n.language)
                const isBest  = stored_best.some(bm => bm.toLowerCase().startsWith(m.toLowerCase().slice(0, 3)))
                const isAvoid = stored_avoid.some(am => am.toLowerCase().startsWith(m.toLowerCase().slice(0, 3)))
                const height  = isBest ? 48 : isAvoid ? 16 : 32
                return (
                  <div key={m} className="flex flex-col items-center gap-1 flex-1">
                    <div
                      className="w-full rounded-sm"
                      style={{ height, background: isBest ? ACCENT : isAvoid ? '#E7E0D7' : '#C8BFB2' }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-1">
              {months.map(m => (
                <span key={m} className="flex-1 text-center" style={{ fontSize: '8px', color: MUTED }}>{m[0]}</span>
              ))}
            </div>
            {dest.climate.best_months.length > 0 && (
              <p className="text-xs mt-3" style={{ color: DARK }}>
                {t('destination.best_months')}: <strong>{localizeMonths(dest.climate.best_months, i18n.language).join(', ')}</strong>
              </p>
            )}
          </Card>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('destination.internet'), value: dest.internet_mbps ? `${dest.internet_mbps} Mbps` : '—' },
            { label: t('destination.security'), value: dest.security || '—' },
            { label: t('destination.community'), value: dest.community || '—' },
          ].map(stat => (
            <Card key={stat.label} className="text-center">
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.4rem', fontWeight: 700, color: DARK }}>{stat.value}</p>
              <p className="text-[10px] font-semibold tracking-widest uppercase mt-1" style={{ color: MUTED }}>{stat.label}</p>
            </Card>
          ))}
        </div>

        {/* ── Why you + Visa ── */}
        <div className="grid md:grid-cols-2 gap-4">

          {/* Why you */}
          <Card>
            <SectionTitle icon="❤️" label={t('destination.why_you')} />
            <ul className="flex flex-col gap-2">
              {dest.match_reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#3C3530' }}>
                  <span style={{ color: ACCENT }} className="flex-shrink-0 mt-0.5">●</span>
                  {r}
                </li>
              ))}
            </ul>
            {dest.why_you_why_now?.length > 0 && (
              <ul className="flex flex-col gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                {dest.why_you_why_now.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#3C3530' }}>
                    <span style={{ color: DARK }} className="flex-shrink-0 mt-0.5">→</span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Visa */}
          <Card>
            <SectionTitle icon="🛂" label={t('destination.visa')} />

            {/* Visa required badge */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  background: dest.visa.required === false ? '#DCFCE7' : '#FEF9C3',
                  color:      dest.visa.required === false ? '#166534' : '#854D0E',
                }}
              >
                {dest.visa.required === false ? '✅ ' + t('destination.visa_not_required') : '🛂 ' + t('destination.visa_required')}
              </span>
            </div>

            {/* Visa type + days */}
            <div className="flex flex-col gap-1 mb-4">
              {dest.visa.type && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: MUTED }}>{t('destination.visa_type')}</span>
                  <span className="text-sm font-semibold" style={{ color: DARK }}>{dest.visa.type}</span>
                </div>
              )}
              {dest.visa.max_stay_days && (
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: MUTED }}>{t('destination.visa_duration')}</span>
                  <span className="text-sm font-semibold" style={{ color: DARK }}>{dest.visa.max_stay_days} {t('destination.visa_days')}</span>
                </div>
              )}
            </div>

            {/* Requirements */}
            {dest.visa.requirements?.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: MUTED }}>{t('destination.visa_requirements')}</p>
                <ul className="flex flex-col gap-1.5">
                  {dest.visa.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#3C3530' }}>
                      <span style={{ color: ACCENT }}>✓</span>{r}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        {/* ── Flights ── */}
        <div>
          <SectionTitle icon="✈️" label={t('destination.flights')} />

          {/* Origin input */}
          <div className="flex items-center gap-3 mb-3 px-4 py-3 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <span className="text-sm flex-shrink-0" style={{ color: MUTED }}>✈️ {t('destination.from')}</span>
            <input
              type="text"
              value={originCity}
              onChange={e => handleOriginChange(e.target.value)}
              placeholder={t('destination.origin_placeholder')}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: DARK }}
            />
            {originCity && (
              <button onClick={() => handleOriginChange('')} className="text-xs flex-shrink-0" style={{ color: MUTED }}>✕</button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {flightLinks(originCity).map(link => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = '#EDE6DA' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = CARD }}
              >
                <span className="text-2xl flex-shrink-0">{link.emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: DARK }}>{link.label}</p>
                  <p className="text-xs truncate" style={{ color: MUTED }}>{link.sub}</p>
                </div>
                <span className="ml-auto text-xs flex-shrink-0" style={{ color: ACCENT }}>→</span>
              </a>
            ))}
          </div>
        </div>

        {/* ── YouTube videos ── */}
        {dest.youtube_links?.length > 0 && (
          <div>
            <SectionTitle icon="🎬" label={t('destination.videos')} />
            <div className="flex flex-col gap-3">
              {dest.youtube_links.map((url, i) => {
                const ytId = getYouTubeId(url)
                if (!ytId) return null
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 rounded-xl p-3 transition-all"
                    style={{ background: CARD, border: `1px solid ${BORDER}` }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = '#EDE6DA' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = CARD }}
                  >
                    <div className="relative flex-shrink-0 rounded-lg overflow-hidden" style={{ width: 130, height: 73, background: BORDER }}>
                      <img
                        src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                        alt="thumbnail"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                        <span className="text-white text-xl">▶</span>
                      </div>
                    </div>
                    <span className="text-sm" style={{ color: DARK }}>{t('destination.watch_video')} {i + 1}</span>
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Accommodation ── */}
        {dest.accommodation_links?.length > 0 && (
          <div>
            <SectionTitle icon="🏠" label={t('destination.accommodation')} />
            <div className="flex flex-col gap-2">
              {dest.accommodation_links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, color: DARK }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = DARK }}
                >
                  <span>{link.label}</span>
                  <span className="text-xs" style={{ color: MUTED }}>→</span>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
