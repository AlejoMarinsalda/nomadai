import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { deleteReport, getReports, type ResultData } from '../lib/api'

const BG     = '#F2EDE4'
const ACCENT = '#C84B1A'
const DARK   = '#1C1917'
const BORDER = '#E7E0D7'
const CARD   = '#FFFFFF'
const MUTED  = '#9E9186'

interface Report {
  created_at: string
  report_text: string
  destinations: { city: string; country: string }[]
  session_id: string
  result_json: ResultData | null
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
      .then(data => setReports(data.reports as Report[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId, credential])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function handleClick(report: Report) {
    if (!report.session_id) return
    if (report.result_json) {
      navigate(`/results/${report.session_id}`, { state: { result: report.result_json } })
    } else {
      navigate(`/history/${report.session_id}`, { state: { report } })
    }
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
    } catch { /* silent */ } finally {
      setDeleting(null)
    }
  }

  if (loading) return (
    <div className="h-full p-4 max-w-2xl mx-auto w-full flex flex-col gap-3" style={{ background: BG }}>
      {[1,2,3].map(i => (
        <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: CARD, border: `1px solid ${BORDER}` }} />
      ))}
    </div>
  )

  if (reports.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center" style={{ background: BG }}>
      <div className="max-w-sm flex flex-col items-center gap-4">
        <span className="text-4xl">🧭</span>
        <h2 className="text-lg font-bold" style={{ fontFamily: 'Cormorant Garamond, serif', color: DARK }}>
          {t('history.empty_title')}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{t('history.empty_desc')}</p>
        <button
          onClick={() => navigate('/onboarding')}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
          style={{ background: ACCENT }}
        >
          {t('layout.new_search')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" style={{ background: BG }}>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">

        <h2
          className="text-2xl font-bold mb-1"
          style={{ fontFamily: 'Cormorant Garamond, serif', color: DARK }}
        >
          {t('history.title')}
        </h2>

        {reports.map(report => {
          const key = report.created_at
          const isDeleting = deleting === key
          const hasResult = !!report.result_json

          return (
            <div
              key={key}
              onClick={() => handleClick(report)}
              className="group flex items-center rounded-xl cursor-pointer transition-all"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = DARK }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER }}
            >
              {/* Icon */}
              <div
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ml-4"
                style={{ background: BG }}
              >
                <span className="text-base">🧭</span>
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col gap-1 px-4 py-3.5 min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  {report.destinations.length > 0
                    ? report.destinations.map(d => (
                        <span
                          key={d.city}
                          className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                          style={{ background: BG, border: `1px solid ${BORDER}`, color: DARK }}
                        >
                          {d.city}
                        </span>
                      ))
                    : <span className="text-xs" style={{ color: MUTED }}>{t('history.no_destinations')}</span>
                  }
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs" style={{ color: MUTED }}>{formatDate(report.created_at)}</p>
                  {hasResult && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: '#FEF3EE', color: ACCENT, border: `1px solid #FDDCCC` }}
                    >
                      AI Report
                    </span>
                  )}
                </div>
              </div>

              {/* Chevron */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 flex-shrink-0 transition-colors"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: MUTED, marginRight: '0.5rem' }}
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>

              {/* Delete */}
              <button
                onClick={e => handleDelete(e, report)}
                disabled={isDeleting}
                className="flex-shrink-0 px-3 py-3.5 transition-colors disabled:opacity-40"
                style={{ color: MUTED }}
                title="Eliminar reporte"
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                onMouseLeave={e => e.currentTarget.style.color = MUTED}
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
