import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getProfile } from '../lib/api'

interface Profile {
  hobbies: string[]
  budget_usd_monthly: number | null
  work_timezone: string | null
  nationality: string | null
  goals: string[]
  preferred_climate: string | null
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-300 min-h-[38px]">
        {value || <span className="text-zinc-600 italic">No especificado</span>}
      </div>
    </div>
  )
}

function Tags({ label, items }: { label: string; items: string[] }) {
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

export default function ProfilePage() {
  const { userId, userName, userPicture, credential } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId || !credential) return
    getProfile(userId, credential)
      .then(data => { if (data.found) setProfile(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId, credential])

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

        {/* Profile data */}
        {loading ? (
          <div className="flex flex-col gap-3 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-14 bg-zinc-900 border border-zinc-800 rounded-lg" />)}
          </div>
        ) : profile ? (
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-zinc-300">Tu perfil de nómada</h3>
            <Tags  label="Hobbies"       items={profile.hobbies} />
            <Tags  label="Objetivos"     items={profile.goals} />
            <Field label="Presupuesto"   value={profile.budget_usd_monthly ? `$${profile.budget_usd_monthly} USD / mes` : null} />
            <Field label="Zona horaria"  value={profile.work_timezone} />
            <Field label="Nacionalidad"  value={profile.nationality} />
            <Field label="Clima preferido" value={profile.preferred_climate} />

            <p className="text-xs text-zinc-600 mt-1">
              Tu perfil se arma automáticamente a través de la conversación con NomadAI.
              La edición manual estará disponible próximamente.
            </p>
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
