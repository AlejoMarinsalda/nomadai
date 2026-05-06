import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getProfile, patchProfile } from '../lib/api'

interface Profile {
  hobbies: string[]
  budget_usd_monthly: number | null
  work_timezone: string | null
  nationality: string | null
  goals: string[]
  preferred_climate: string | null
}

function TagsView({ label, items = [] }: { label: string; items?: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap gap-1.5 min-h-[34px]">
        {items.length > 0
          ? items.map(item => (
              <span key={item} className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded-full">
                {item}
              </span>
            ))
          : <span className="text-sm text-zinc-600 italic self-center">No especificado</span>
        }
      </div>
    </div>
  )
}

function FieldView({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 min-h-[38px]">
        {value || <span className="text-zinc-600 italic">No especificado</span>}
      </div>
    </div>
  )
}

function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-zinc-900 border border-zinc-700 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none transition-all"
      />
    </div>
  )
}

function TagsInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Separados por coma"
        className="bg-zinc-900 border border-zinc-700 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none transition-all placeholder-zinc-600"
      />
    </div>
  )
}

function toList(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean)
}

export default function ProfilePage() {
  const { userId, userName, userPicture, credential } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // edit form state
  const [hobbies, setHobbies] = useState('')
  const [goals, setGoals] = useState('')
  const [budget, setBudget] = useState('')
  const [timezone, setTimezone] = useState('')
  const [nationality, setNationality] = useState('')
  const [climate, setClimate] = useState('')

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
    setGoals(profile.goals.join(', '))
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
      const data = await patchProfile(userId, credential, {
        hobbies: toList(hobbies),
        goals: toList(goals),
        budget_usd_monthly: budget ? parseInt(budget) : null,
        work_timezone: timezone || null,
        nationality: nationality || null,
        preferred_climate: climate || null,
      })
      setProfile(data.profile)
      setEditing(false)
    } catch {
      alert('Error al guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">

        {/* User card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
          {userPicture
            ? <img src={userPicture} alt="avatar" className="w-14 h-14 rounded-full border-2 border-zinc-700 object-cover" />
            : <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-xl text-zinc-400 font-medium">
                {(userName || '?')[0].toUpperCase()}
              </div>
          }
          <div>
            <p className="font-semibold text-zinc-100">{userName}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Nómada digital</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-14 bg-zinc-900 border border-zinc-800 rounded-lg" />)}
          </div>
        ) : profile ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-300">Tu perfil de nómada</h3>
              {!editing && (
                <button onClick={startEdit} className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">
                  Editar
                </button>
              )}
            </div>

            {editing ? (
              <>
                <TagsInput label="Hobbies" value={hobbies} onChange={setHobbies} />
                <TagsInput label="Objetivos" value={goals} onChange={setGoals} />
                <FieldInput label="Presupuesto mensual (USD)" value={budget} onChange={setBudget} />
                <FieldInput label="Zona horaria" value={timezone} onChange={setTimezone} />
                <FieldInput label="Nacionalidad" value={nationality} onChange={setNationality} />
                <FieldInput label="Clima preferido" value={climate} onChange={setClimate} />

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #10b981, #6366f1)' }}
                  >
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-700 hover:border-zinc-500 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <TagsView  label="Hobbies"         items={profile.hobbies} />
                <TagsView  label="Objetivos"        items={profile.goals} />
                <FieldView label="Presupuesto"      value={profile.budget_usd_monthly ? `$${profile.budget_usd_monthly} USD / mes` : null} />
                <FieldView label="Zona horaria"     value={profile.work_timezone} />
                <FieldView label="Nacionalidad"     value={profile.nationality} />
                <FieldView label="Clima preferido"  value={profile.preferred_climate} />
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <span className="text-3xl">👤</span>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              Todavía no tenés un perfil guardado. Iniciá una conversación en el chat y NomadAI va a ir armando tu perfil automáticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
