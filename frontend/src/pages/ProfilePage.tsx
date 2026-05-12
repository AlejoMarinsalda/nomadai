import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { getProfile, patchProfile } from '../lib/api'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'
const CARD   = '#FFFFFF'
const MUTED  = '#9E9186'

// ── Language options ───────────────────────────────────────────────────────────
const LANGUAGES = [
  { id: 'English',    flag: '🇬🇧' }, { id: 'Español',    flag: '🇪🇸' },
  { id: 'Português',  flag: '🇧🇷' }, { id: 'Français',   flag: '🇫🇷' },
  { id: 'Deutsch',    flag: '🇩🇪' }, { id: 'Italiano',   flag: '🇮🇹' },
  { id: 'Japanese',   flag: '🇯🇵' }, { id: 'Mandarin',   flag: '🇨🇳' },
]

function extractLang(goals: string[]): string {
  const m = goals.find(g => g.startsWith('Learn '))
  return m ? m.replace('Learn ', '') : ''
}
function regularGoals(goals: string[]): string[] {
  return goals.filter(g => !g.startsWith('Learn '))
}
function toList(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

interface Profile {
  hobbies: string[]
  budget_usd_monthly: number | null
  work_timezone: string | null
  nationality: string | null
  goals: string[]
  preferred_climate: string | null
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
      style={{ background: BG, border: `1px solid ${BORDER}`, color: DARK }}
    >
      {label}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: MUTED }}>{label}</span>
      <div>{children}</div>
    </div>
  )
}

function EmptyVal({ text }: { text: string }) {
  return <span className="text-sm italic" style={{ color: MUTED }}>{text}</span>
}

function EditInput({ label, value, onChange, placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: MUTED }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          color: DARK,
        }}
        onFocus={e => e.currentTarget.style.borderColor = ACCENT}
        onBlur={e => e.currentTarget.style.borderColor = BORDER}
      />
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { userId, userName, userPicture, credential } = useAuth()
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(false)
  const [saving, setSaving]     = useState(false)

  const [hobbies, setHobbies]       = useState('')
  const [goals, setGoals]           = useState('')
  const [targetLang, setTargetLang] = useState('')
  const [budget, setBudget]         = useState('')
  const [timezone, setTimezone]     = useState('')
  const [nationality, setNationality] = useState('')
  const [climate, setClimate]       = useState('')

  useEffect(() => {
    if (!userId || !credential) return
    getProfile(userId, credential)
      .then(data => { if (data.found) setProfile(data.profile) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId, credential])

  function startEdit() {
    if (!profile) return
    setHobbies(profile.hobbies.join(', '))
    setGoals(regularGoals(profile.goals).join(', '))
    setTargetLang(extractLang(profile.goals))
    setBudget(profile.budget_usd_monthly?.toString() ?? '')
    setTimezone(profile.work_timezone ?? '')
    setNationality(profile.nationality ?? '')
    setClimate(profile.preferred_climate ?? '')
    setEditing(true)
  }

  async function handleSave() {
    if (!userId || !credential) return
    setSaving(true)
    try {
      const allGoals = [...toList(goals), ...(targetLang ? [`Learn ${targetLang}`] : [])]
      const data = await patchProfile(userId, credential, {
        hobbies: toList(hobbies),
        goals: allGoals,
        budget_usd_monthly: budget ? parseInt(budget) : null,
        work_timezone: timezone || null,
        nationality: nationality || null,
        preferred_climate: climate || null,
      })
      setProfile(data.profile)
      setEditing(false)
    } catch {
      alert(t('profile.error_save'))
    } finally {
      setSaving(false)
    }
  }

  const initials = (userName || '?')[0].toUpperCase()
  const lang = profile ? extractLang(profile.goals) : ''
  const langInfo = LANGUAGES.find(l => l.id === lang)

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: BG }}>
      <div className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* ── User card ── */}
        <div
          className="flex items-center gap-4 px-5 py-5 rounded-2xl"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          {userPicture
            ? <img src={userPicture} alt="avatar" className="w-14 h-14 rounded-full object-cover flex-shrink-0" style={{ border: `2px solid ${BORDER}` }} />
            : (
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
                style={{ background: BG, border: `2px solid ${BORDER}`, color: DARK }}
              >
                {initials}
              </div>
            )
          }
          <div className="min-w-0">
            <p className="font-bold text-lg leading-tight truncate" style={{ fontFamily: 'Cormorant Garamond, serif', color: DARK }}>
              {userName || 'Nómada'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>{t('profile.nomad_label')}</p>
          </div>
        </div>

        {/* ── Profile content ── */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: CARD, border: `1px solid ${BORDER}` }} />
            ))}
          </div>
        ) : profile ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
          >
            {/* Header with edit button */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <span
                className="text-xs font-semibold tracking-widest uppercase"
                style={{ color: MUTED }}
              >
                {t('profile.title')}
              </span>
              {!editing && (
                <button
                  onClick={startEdit}
                  className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                  style={{ color: ACCENT, border: `1px solid ${BORDER}` }}
                  onMouseEnter={e => { e.currentTarget.style.background = BG }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {t('profile.edit')} ✎
                </button>
              )}
            </div>

            <div className="px-5 pb-5">
              {editing ? (
                /* ── Edit mode ── */
                <div className="flex flex-col gap-4 pt-3">
                  <EditInput label={t('profile.field_hobbies')}     value={hobbies}     onChange={setHobbies}     placeholder="Surf, Poker, Yoga..." />
                  <EditInput label={t('profile.field_goals')}       value={goals}       onChange={setGoals}       placeholder="Low cost of living, Nomad community..." />

                  {/* Language selector */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: MUTED }}>{t('profile.field_language')}</span>
                    <div className="flex flex-wrap gap-2">
                      {LANGUAGES.map(l => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setTargetLang(targetLang === l.id ? '' : l.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                          style={{
                            background:  targetLang === l.id ? ACCENT : CARD,
                            borderColor: targetLang === l.id ? ACCENT : BORDER,
                            color:       targetLang === l.id ? 'white' : DARK,
                          }}
                        >
                          {l.flag} {l.id}
                        </button>
                      ))}
                    </div>
                  </div>

                  <EditInput label={t('profile.field_budget')}      value={budget}      onChange={setBudget}      placeholder="2500" />
                  <EditInput label={t('profile.field_timezone')}    value={timezone}    onChange={setTimezone}    placeholder="UTC-3" />
                  <EditInput label={t('profile.field_nationality')} value={nationality} onChange={setNationality} placeholder="Argentina" />
                  <EditInput label={t('profile.field_climate')}     value={climate}     onChange={setClimate}     placeholder="Tropical, Mediterranean" />

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40"
                      style={{ background: DARK }}
                    >
                      {saving ? t('profile.saving') : t('profile.save')}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={{ border: `1px solid ${BORDER}`, color: MUTED }}
                    >
                      {t('profile.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <div className="divide-y" style={{ borderColor: BORDER }}>
                  <Row label={t('profile.field_hobbies')}>
                    {profile.hobbies.length > 0
                      ? <div className="flex flex-wrap gap-1.5">{profile.hobbies.map(h => <Tag key={h} label={h} />)}</div>
                      : <EmptyVal text={t('profile.not_specified')} />
                    }
                  </Row>

                  <Row label={t('profile.field_goals')}>
                    {regularGoals(profile.goals).length > 0
                      ? <div className="flex flex-wrap gap-1.5">{regularGoals(profile.goals).map(g => <Tag key={g} label={g} />)}</div>
                      : <EmptyVal text={t('profile.not_specified')} />
                    }
                  </Row>

                  {lang && (
                    <Row label={t('profile.field_language')}>
                      <span className="text-sm font-medium" style={{ color: DARK }}>
                        {langInfo?.flag} {lang}
                      </span>
                    </Row>
                  )}

                  <Row label={t('profile.field_budget_label')}>
                    {profile.budget_usd_monthly
                      ? <span className="text-sm font-semibold" style={{ color: DARK, fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem' }}>
                          ${profile.budget_usd_monthly.toLocaleString()} <span className="text-xs font-normal" style={{ color: MUTED }}>USD / month</span>
                        </span>
                      : <EmptyVal text={t('profile.not_specified')} />
                    }
                  </Row>

                  <Row label={t('profile.field_timezone')}>
                    {profile.work_timezone
                      ? <span className="text-sm font-medium" style={{ color: DARK }}>{profile.work_timezone}</span>
                      : <EmptyVal text={t('profile.not_specified')} />
                    }
                  </Row>

                  <Row label={t('profile.field_nationality')}>
                    {profile.nationality
                      ? <span className="text-sm font-medium" style={{ color: DARK }}>{profile.nationality}</span>
                      : <EmptyVal text={t('profile.not_specified')} />
                    }
                  </Row>

                  <Row label={t('profile.field_climate')}>
                    {profile.preferred_climate
                      ? <span className="text-sm font-medium" style={{ color: DARK }}>{profile.preferred_climate}</span>
                      : <EmptyVal text={t('profile.not_specified')} />
                    }
                  </Row>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── No profile ── */
          <div
            className="flex flex-col items-center justify-center py-16 text-center rounded-2xl gap-4"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
          >
            <span className="text-3xl">🧭</span>
            <p className="text-sm max-w-xs leading-relaxed" style={{ color: MUTED }}>
              {t('profile.empty_desc')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
