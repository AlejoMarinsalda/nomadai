import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { useAuth } from '../hooks/useAuth'
import { getReports } from '../lib/api'

interface Report {
  created_at: string
  report_text: string
  destinations: { city: string; country: string }[]
}

export default function History() {
  const { userId, credential } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !credential) return
    getReports(userId, credential)
      .then(data => setReports(data.reports))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId, credential])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) return (
    <div className="h-full flex flex-col gap-3 p-4 max-w-2xl mx-auto w-full">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (reports.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-sm flex flex-col items-center gap-4">
        <span className="text-4xl">📋</span>
        <h2 className="text-lg font-bold text-zinc-100">Sin reportes todavía</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">
          Cuando NomadAI genere tu primera recomendación de destinos, va a aparecer acá guardada automáticamente.
        </p>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-300 mb-1">Tus reportes de destinos</h2>

        {reports.map(report => {
          const key = report.created_at
          const isOpen = expanded === key

          return (
            <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0 text-base">
                  🗺️
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {report.destinations.map(d => (
                      <span key={d.city} className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">
                        {d.city}
                      </span>
                    ))}
                    {report.destinations.length === 0 && (
                      <span className="text-xs text-zinc-500">Sin destinos</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{formatDate(report.created_at)}</p>
                </div>
                <span className={`text-zinc-500 text-xs transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>

              {isOpen && (
                <div
                  className="border-t border-zinc-800 px-5 py-4 text-sm prose-chat"
                  dangerouslySetInnerHTML={{ __html: marked.parse(report.report_text) as string }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
