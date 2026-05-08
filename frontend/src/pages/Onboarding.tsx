import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { getJobStatus, patchProfile, sendMessage } from '../lib/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const BUDGET_STEPS = [800, 1200, 1500, 2000, 2500, 3500, 5000, 6000]

const CLIMATE_OPTIONS = [
  { id: 'tropical',      icon: '🌴', label: 'Tropical',      range: '25–32°C' },
  { id: 'mediterranean', icon: '🌊', label: 'Mediterranean', range: '18–28°C' },
  { id: 'cool',          icon: '❄️', label: 'Cool',          range: '10–18°C' },
  { id: 'any',           icon: '🌍', label: "I'm flexible",  range: '' },
]

const HOBBY_OPTIONS = [
  { id: 'surf',        emoji: '🏄', label: 'Surf' },
  { id: 'hiking',      emoji: '🥾', label: 'Hiking' },
  { id: 'yoga',        emoji: '🧘', label: 'Yoga' },
  { id: 'coffee',      emoji: '☕', label: 'Specialty coffee' },
  { id: 'nightlife',   emoji: '🎉', label: 'Nightlife' },
  { id: 'coworking',   emoji: '💻', label: 'Coworking' },
  { id: 'poker',       emoji: '🃏', label: 'Poker' },
  { id: 'cycling',     emoji: '🚴', label: 'Cycling' },
  { id: 'photography', emoji: '📷', label: 'Photography' },
  { id: 'music',       emoji: '🎸', label: 'Music' },
  { id: 'art',         emoji: '🎨', label: 'Art' },
  { id: 'diving',      emoji: '🤿', label: 'Diving' },
  { id: 'fitness',     emoji: '💪', label: 'Fitness' },
  { id: 'cooking',     emoji: '👨‍🍳', label: 'Cooking' },
  { id: 'football',    emoji: '⚽', label: 'Football' },
  { id: 'reading',     emoji: '📚', label: 'Reading' },
]

const GOAL_OPTIONS = [
  { id: 'low_cost',   emoji: '💰', label: 'Low cost of living' },
  { id: 'community',  emoji: '🤝', label: 'Nomad community' },
  { id: 'language',   emoji: '🗣️', label: 'Learn a language' },
  { id: 'weather',    emoji: '☀️', label: 'Great weather' },
  { id: 'nature',     emoji: '🌿', label: 'Nature & outdoors' },
  { id: 'nightlife',  emoji: '🌙', label: 'Nightlife' },
  { id: 'safety',     emoji: '🛡️', label: 'Safety & stability' },
  { id: 'transport',  emoji: '🚇', label: 'Good public transport' },
]

const TIMEZONES = [
  'UTC-8 (Los Angeles)', 'UTC-7 (Denver)', 'UTC-6 (Chicago)',
  'UTC-5 (New York)', 'UTC-4 (Santiago)', 'UTC-3 (Buenos Aires)',
  'UTC-1 (Azores)', 'UTC+0 (London)', 'UTC+1 (Madrid)',
  'UTC+2 (Cairo)', 'UTC+3 (Dubai)', 'UTC+5:30 (Mumbai)',
  'UTC+7 (Bangkok)', 'UTC+8 (Singapore)', 'UTC+9 (Tokyo)',
  'UTC+10 (Sydney)',
]

const TOTAL_STEPS = 5

// ── Styles ─────────────────────────────────────────────────────────────────────

const ACCENT = '#C84B1A'
const BG     = '#F2EDE4'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all duration-300"
          style={{ width: i < step ? 28 : 16, background: i < step ? ACCENT : '#C8BFB2' }}
        />
      ))}
    </div>
  )
}

function StepLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <span className="text-xs font-semibold tracking-widest" style={{ color: '#9E9186' }}>{n}</span>
      <span className="text-sm font-semibold text-zinc-800">{label}</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()
  const { userId, credential } = useAuth()
  const { t, i18n } = useTranslation()

  const [step, setStepp]              = useState(1)
  const [saving, setSaving]           = useState(false)
  const [pollingLabel, setPollingLabel] = useState('')

  // Form state
  const [timezone, setTimezone]       = useState(TIMEZONES[5])   // UTC-3 default
  const [nationality, setNationality] = useState('')
  const [budgetIdx, setBudgetIdx]     = useState(4)               // $2500 default
  const [climates, setClimates]       = useState<string[]>([])    // multi-select
  const [hobbies, setHobbies]         = useState<string[]>([])
  const [customHobbies, setCustomHobbies] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [goals, setGoals]             = useState<string[]>([])

  const budget = BUDGET_STEPS[budgetIdx]

  function setStep(n: number | ((s: number) => number)) { setStepp(n) }

  function toggleClimate(id: string) {
    setClimates(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function toggleHobby(id: string) {
    setHobbies(prev => prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id])
  }

  function addCustomHobby() {
    const val = customInput.trim()
    if (!val || customHobbies.map(h => h.toLowerCase()).includes(val.toLowerCase())) return
    setCustomHobbies(prev => [...prev, val])
    setCustomInput('')
  }

  function removeCustomHobby(val: string) {
    setCustomHobbies(prev => prev.filter(h => h !== val))
  }

  function toggleGoal(id: string) {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep(s => Math.max(s - 1, 1)) }

  async function finish() {
    if (!userId || !credential) return
    setSaving(true)
    try {
      const tzCode = timezone.split(' ')[0]
      const hobbyLabels = [
        ...HOBBY_OPTIONS.filter(h => hobbies.includes(h.id)).map(h => h.label),
        ...customHobbies,
      ]
      const goalLabels   = GOAL_OPTIONS.filter(g => goals.includes(g.id)).map(g => g.label)
      const climateLabel = CLIMATE_OPTIONS.filter(c => climates.includes(c.id)).map(c => c.label).join(', ')

      await patchProfile(userId, credential, {
        hobbies:            hobbyLabels,
        goals:              goalLabels,
        budget_usd_monthly: budget === 6000 ? 8000 : budget,
        work_timezone:      tzCode,
        nationality:        nationality || 'Not specified',
        preferred_climate:  climateLabel || 'Any',
      })

      const triggerMsg = t('onboarding.trigger_message')
      const { job_id, session_id } = await sendMessage(triggerMsg, null, credential, i18n.language)

      // Poll the job here — navigate to Results when done
      const POLL_LABELS = [
        t('chat.thinking_analyzing'),
        t('chat.thinking_searching'),
        t('chat.thinking_enriching'),
        t('chat.thinking_preparing'),
      ]
      let idx = 0
      setPollingLabel(POLL_LABELS[0])

      const started = Date.now()
      await new Promise<void>((resolve, reject) => {
        const timer = setInterval(async () => {
          idx = (idx + 1) % POLL_LABELS.length
          setPollingLabel(POLL_LABELS[idx])
          if (Date.now() - started > 360_000) { clearInterval(timer); reject(new Error('Timeout')); return }
          try {
            const data = await getJobStatus(job_id)
            if (data.status === 'done' || data.status === 'error') {
              clearInterval(timer)
              if (data.result_data) {
                window.dispatchEvent(new CustomEvent('nomadai:newreport'))
                navigate(`/results/${session_id}`, { replace: true, state: { result: data.result_data } })
              } else {
                // Fallback: no result_data, go to chat
                navigate(`/chat?session=${session_id}`, { replace: true })
              }
              resolve()
            }
          } catch { /* ignore transient */ }
        }, 3000)
      })
    } catch {
      setSaving(false)
      setPollingLabel('')
    }
  }

  // ── All hobby labels for confirm step ─────────────────────────────────────
  const allHobbyLabels = [
    ...HOBBY_OPTIONS.filter(h => hobbies.includes(h.id)).map(h => h.label),
    ...customHobbies,
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-dvh flex flex-col overflow-hidden relative" style={{ background: BG }}>

      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-2">
          <span className="text-base">✈️</span>
          <span className="font-bold text-zinc-900" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem' }}>
            nomad<em style={{ color: ACCENT }}>ai</em>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ProgressBar step={step} />
          {step < TOTAL_STEPS && (
            <button onClick={next} className="text-xs font-medium" style={{ color: '#9E9186' }}>
              {t('onboarding.skip')} {step}/{TOTAL_STEPS}
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">

          {/* Headline */}
          <div className="mb-10">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: ACCENT }}>
              ↑ {t('onboarding.tag')}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight text-zinc-900 mb-3" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
              {t('onboarding.headline_1')}{' '}
              <em style={{ color: ACCENT }}>{t('onboarding.headline_em')}</em>
              {' '}{t('onboarding.headline_2')}
            </h1>
            <p className="text-sm text-zinc-500 max-w-md leading-relaxed">{t('onboarding.subtitle')}</p>
          </div>

          {/* ── Step 1: Timezone + Nationality ── */}
          {step === 1 && (
            <div className="flex flex-col gap-8">
              <div>
                <StepLabel n="01" label={t('onboarding.timezone_label')} />
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-zinc-800 outline-none focus:border-stone-400 transition-colors"
                >
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <StepLabel n="02" label={t('onboarding.nationality_label')} />
                <input
                  type="text"
                  value={nationality}
                  onChange={e => setNationality(e.target.value)}
                  placeholder={t('onboarding.nationality_placeholder')}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm text-zinc-800 outline-none focus:border-stone-400 transition-colors placeholder-stone-400"
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Budget + Climate ── */}
          {step === 2 && (
            <div className="flex flex-col gap-10">
              {/* Budget */}
              <div>
                <StepLabel n="01" label={t('onboarding.budget_label')} />
                <div className="bg-white rounded-2xl p-6 border border-stone-200">
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-zinc-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                      ${budget === 6000 ? '6,000+' : budget.toLocaleString()}
                    </span>
                    <span className="text-sm text-zinc-400 ml-1">/mo</span>
                  </div>
                  <input
                    type="range" min={0} max={BUDGET_STEPS.length - 1}
                    value={budgetIdx} onChange={e => setBudgetIdx(Number(e.target.value))}
                    className="w-full accent-orange-700 cursor-pointer"
                  />
                  <div className="flex justify-between mt-2">
                    {['$800', 'backpacker', '$2,500', '$6,000+', 'luxury'].map(l => (
                      <span key={l} className="text-xs text-stone-400">{l}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Climate — multi-select */}
              <div>
                <StepLabel n="02" label={t('onboarding.climate_label')} />
                <p className="text-xs text-stone-400 mb-3">{t('onboarding.multi_select')}</p>
                <div className="grid grid-cols-2 gap-3">
                  {CLIMATE_OPTIONS.map(opt => {
                    const selected = climates.includes(opt.id)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleClimate(opt.id)}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all"
                        style={{
                          background:  selected ? DARK  : 'white',
                          borderColor: selected ? DARK  : BORDER,
                          color:       selected ? 'white' : DARK,
                        }}
                      >
                        <span className="text-xl">{opt.icon}</span>
                        <div>
                          <div className="text-sm font-semibold">{opt.label}</div>
                          {opt.range && <div className="text-xs opacity-60">{opt.range}</div>}
                        </div>
                        {selected && (
                          <span className="ml-auto text-xs" style={{ color: ACCENT }}>✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Hobbies ── */}
          {step === 3 && (
            <div>
              <StepLabel n="01" label={t('onboarding.hobbies_label')} />
              <p className="text-xs text-stone-400 mb-4">{t('onboarding.multi_select')}</p>

              {/* Preset hobbies */}
              <div className="flex flex-wrap gap-2 mb-6">
                {HOBBY_OPTIONS.map(opt => {
                  const selected = hobbies.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleHobby(opt.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all"
                      style={{
                        background:  selected ? DARK : 'white',
                        borderColor: selected ? DARK : BORDER,
                        color:       selected ? 'white' : '#3C3530',
                      }}
                    >
                      <span>{opt.emoji}</span>
                      {opt.label}
                    </button>
                  )
                })}

                {/* Custom hobbies as removable tags */}
                {customHobbies.map(h => (
                  <button
                    key={h}
                    onClick={() => removeCustomHobby(h)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all"
                    style={{ background: ACCENT, borderColor: ACCENT, color: 'white' }}
                  >
                    ✦ {h}
                    <span className="opacity-70">×</span>
                  </button>
                ))}
              </div>

              {/* Add custom hobby */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomHobby() } }}
                  placeholder={t('onboarding.hobby_placeholder')}
                  className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-zinc-800 outline-none focus:border-stone-400 transition-colors placeholder-stone-400"
                />
                <button
                  onClick={addCustomHobby}
                  disabled={!customInput.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30"
                  style={{ background: DARK }}
                >
                  + {t('onboarding.hobby_add')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Goals ── */}
          {step === 4 && (
            <div>
              <StepLabel n="01" label={t('onboarding.goals_label')} />
              <p className="text-xs text-stone-400 mb-4">{t('onboarding.multi_select')}</p>
              <div className="grid grid-cols-2 gap-3">
                {GOAL_OPTIONS.map(opt => {
                  const selected = goals.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggleGoal(opt.id)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm font-medium transition-all"
                      style={{
                        background:  selected ? DARK : 'white',
                        borderColor: selected ? DARK : BORDER,
                        color:       selected ? 'white' : '#3C3530',
                      }}
                    >
                      <span className="text-lg">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 5: Confirm ── */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <StepLabel n="01" label={t('onboarding.confirm_label')} />
              <div className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                {[
                  { label: t('onboarding.confirm_timezone'),    value: timezone.split(' ')[0] },
                  { label: t('onboarding.confirm_nationality'), value: nationality || '—' },
                  { label: t('onboarding.confirm_budget'),      value: `$${budget === 6000 ? '6,000+' : budget.toLocaleString()} /mo` },
                  { label: t('onboarding.confirm_climate'),     value: CLIMATE_OPTIONS.filter(c => climates.includes(c.id)).map(c => c.label).join(', ') || '—' },
                  { label: t('onboarding.confirm_hobbies'),     value: allHobbyLabels.join(', ') || '—' },
                  { label: t('onboarding.confirm_goals'),       value: GOAL_OPTIONS.filter(g => goals.includes(g.id)).map(g => g.label).join(', ') || '—' },
                ].map(row => (
                  <div key={row.label} className="flex gap-4 px-5 py-3">
                    <span className="text-xs text-stone-400 w-24 flex-shrink-0 pt-0.5">{row.label}</span>
                    <span className="text-sm text-zinc-800 font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-t" style={{ background: BG, borderColor: BORDER }}>
        <button
          onClick={back}
          disabled={step === 1 || saving}
          className="text-sm font-medium text-stone-400 hover:text-stone-700 transition-colors disabled:opacity-0"
        >
          ← {t('onboarding.back')}
        </button>

        {step < TOTAL_STEPS ? (
          <button
            onClick={next}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
            style={{ background: DARK }}
          >
            {t('onboarding.next')} →
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {saving ? t('onboarding.finding') : t('onboarding.find_btn')}
          </button>
        )}
      </div>

      {/* Polling overlay */}
      {saving && pollingLabel && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-50"
          style={{ background: BG }}
        >
          <div className="w-12 h-12 border-2 border-stone-300 border-t-orange-700 rounded-full animate-spin" />
          <div className="text-center">
            <p
              className="text-3xl font-bold text-zinc-900 mb-2"
              style={{ fontFamily: 'Cormorant Garamond, serif' }}
            >
              {t('onboarding.searching_title')}
            </p>
            <p className="text-sm text-stone-500">{pollingLabel}...</p>
          </div>
        </div>
      )}
    </div>
  )
}
