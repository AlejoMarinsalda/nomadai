import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { deleteReport, getReports } from '../lib/api'

interface Report {
  created_at: string
  report_text: string
  destinations: { city: string; country: string }[]
  session_id: string
}

export default function History() {
  const { userId, credential } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !credential) return
    getReports(userId, credential)
      .then(data => setReports(data.reports))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId, credential])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleDelete(e: React.MouseEvent, report: Report) {
    e.stopPropagation()
    if (!userId || !credential) return
    if (!confirm(t('history.delete_confirm'))) return
    setDeleting(report.created_at)
    try {
      await deleteReport(userId, credential, report.created_at)
      setReports(prev => prev.filter(r => r.created_at !== report.created_at))
      window.dispatchEvent(new CustomEvent('nomadai:newreport'))
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
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
        <h2 className="text-lg font-bold text-zinc-100">{t('history.empty_title')}</h2>
        <p className="text-sm text-zinc-500 leading-relaxed">{t('history.empty_desc')}</p>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-300 mb-1">{t('history.title')}</h2>

        {reports.map(report => {
          const key = report.created_at
          const isDeleting = deleting === key

          return (
            <div
              key={key}
              onClick={() => report.session_id && navigate(`/history/${report.session_id}`, { state: { report } })}
              className="group bg-zinc-900 border border-zinc-800 rounded-xl flex items-center cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/50 transition-colors"
            >
              {/* Main content */}
              <div className="flex-1 flex items-center gap-3 px-4 py-3.5 min-w-0">
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
                      <span className="text-xs text-zinc-500">{t('history.no_destinations')}</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{formatDate(report.created_at)}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg"
                     className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0"
                     viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>

              {/* Delete button */}
              <button
                onClick={e => handleDelete(e, report)}
                disabled={isDeleting}
                className="flex-shrink-0 px-3 py-3.5 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                title="Eliminar reporte"
              >
                {isDeleting
                  ? <span className="text-xs">...</span>
                  : <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                }
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
