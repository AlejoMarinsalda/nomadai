import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marked } from '../lib/marked'
import { useAuth } from '../hooks/useAuth'
import { deleteProfile, getJobStatus, getProfile, sendMessage, type ResultData } from '../lib/api'

// Wrap every H3 section in a <details><summary> block for collapsible UX.
// Split on <h3>, <h2> AND <hr> so that separators, city headings, and the
// closing paragraph never get swallowed into the last section's body.
function wrapH3Sections(html: string): string {
  return html
    .split(/(?=<h[23]>|<hr\s*\/?>)/i)
    .map(part => {
      const m = part.match(/^<h3>([\s\S]*?)<\/h3>([\s\S]*)$/i)
      if (!m) return part
      return (
        `<details class="section-block">` +
        `<summary class="section-title">${m[1]}</summary>` +
        `<div class="section-body">${m[2]}</div>` +
        `</details>`
      )
    })
    .join('')
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Message =
  | { id: string; role: 'user';      content: string }
  | { id: string; role: 'assistant'; content: string }
  | { id: string; role: 'thinking';  label: string }

// ── Storage helpers ───────────────────────────────────────────────────────────

const SS_CURRENT_SESSION = 'nomadai_chat_session'

function msgsKey(sessionId: string) { return `nomadai_msgs_${sessionId}` }

function loadMessages(sessionId: string | null): Message[] {
  if (!sessionId) return []
  try { return JSON.parse(sessionStorage.getItem(msgsKey(sessionId)) || '[]') } catch { return [] }
}

// ── Chat page ─────────────────────────────────────────────────────────────────

export default function Chat() {
  const { userId, userName, credential, logout } = useAuth()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const sessionParam = searchParams.get('session')

  const LABELS = [
    t('chat.thinking_analyzing'),
    t('chat.thinking_searching'),
    t('chat.thinking_enriching'),
    t('chat.thinking_preparing'),
  ]

  // Seed messages on first mount
  const [messages, setMessages] = useState<Message[]>(() => {
    const cached = loadMessages(sessionParam)
    if (cached.length > 0) return cached
    const s = location.state as { report?: { report_text: string }; result?: ResultData } | null
    if (s?.report && sessionParam) {
      return [{ id: 'initial', role: 'assistant' as const, content: s.report.report_text }]
    }
    if (s?.result && sessionParam) {
      const cities = s.result.destinations.map(d => `**${d.city}**`).join(', ')
      return [{ id: 'initial', role: 'assistant' as const,
        content: `Tengo listo tu análisis de ${cities}. ¿Qué querés saber? Podés preguntarme sobre costos, clima, visas, qué hacer allá, o comparar destinos.` }]
    }
    return []
  })

  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const sessionRef              = useRef<string | null>(sessionParam)
  const prevSessionParam        = useRef(sessionParam)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)

  const [welcomeDone, setWelcomeDone] = useState(
    () => messages.length > 0 || !!sessionParam
  )

  const addMsg    = useCallback((msg: Message) => setMessages(p => [...p, msg]), [])
  const removeMsg = useCallback((id: string)   => setMessages(p => p.filter(m => m.id !== id)), [])
  const updateLabel = useCallback((id: string, label: string) =>
    setMessages(p => p.map(m => m.id === id && m.role === 'thinking' ? { ...m, label } : m)), [])

  // ── Session change ────────────────────────────────────────────────────────
  useEffect(() => {
    const prev = prevSessionParam.current
    prevSessionParam.current = sessionParam
    if (sessionParam === prev) return
    if (sessionParam === sessionRef.current) return

    const cached = loadMessages(sessionParam)
    let next: Message[] = cached

    if (cached.length === 0 && sessionParam) {
      const s = location.state as { report?: { report_text: string }; result?: ResultData } | null
      if (s?.report) {
        next = [{ id: 'initial', role: 'assistant' as const, content: s.report.report_text }]
      } else if (s?.result) {
        const cities = s.result.destinations.map(d => `**${d.city}**`).join(', ')
        next = [{ id: 'initial', role: 'assistant' as const,
          content: `Tengo listo tu análisis de ${cities}. ¿Qué querés saber? Podés preguntarme sobre costos, clima, visas, qué hacer allá, o comparar destinos.` }]
      }
    }

    setMessages(next)
    setLoading(false)
    setInput('')
    sessionRef.current = sessionParam
    setWelcomeDone(next.length > 0 || !!sessionParam)
    inputRef.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam])

  // ── Persist messages ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionRef.current) return
    const toSave = messages.filter(m => m.role !== 'thinking')
    sessionStorage.setItem(msgsKey(sessionRef.current), JSON.stringify(toSave))
  }, [messages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Welcome message ───────────────────────────────────────────────────────
  useEffect(() => {
    if (welcomeDone || !userId || !credential) return
    setWelcomeDone(true)
    const firstName = (userName || '').split(' ')[0]

    getProfile(userId, credential)
      .then(data => {
        if (data.found) {
          addMsg({ id: crypto.randomUUID(), role: 'assistant',
            content: t('chat.welcome_back', { name: firstName }) })
        } else {
          // Sin perfil → onboarding visual
          navigate('/onboarding', { replace: true })
        }
      })
      .catch(err => { if (err.message === 'UNAUTHORIZED') logout() })
  }, [welcomeDone, userId, credential, userName, addMsg, logout, t, navigate])

  // ── Job polling ───────────────────────────────────────────────────────────

  async function pollJob(jobId: string, thinkingId: string, labels: string[]) {
    const started = Date.now()
    let idx = 0
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setInterval(async () => {
        idx = (idx + 1) % labels.length
        updateLabel(thinkingId, labels[idx])
        if (Date.now() - started > 360_000) { clearInterval(timer); reject(new Error('Timeout')); return }
        try {
          const data = await getJobStatus(jobId)
          if (data.status === 'done' || data.status === 'error') { clearInterval(timer); resolve(data) }
        } catch { /* ignore transient errors */ }
      }, 3000)
    })
  }

  // ── Auto-intro when arriving from Results ────────────────────────────────

  const introSent = useRef(false)
  useEffect(() => {
    if (introSent.current || !sessionParam || !userId || !credential) return
    const s = location.state as { result?: { destinations: { city: string }[] } } | null
    if (!s?.result?.destinations?.length) return
    introSent.current = true
    const cities = s.result.destinations.map(d => d.city).join(', ')
    const introMsg = t('chat.intro_from_results', { cities })
    // slight delay so the component is fully mounted
    setTimeout(() => send(introMsg), 300)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, credential, sessionParam])

  // ── Send message ──────────────────────────────────────────────────────────

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading || !userId || !credential) return
    if (!overrideText) setInput('')
    setLoading(true)

    const labels = LABELS
    const thinkingId = crypto.randomUUID()
    addMsg({ id: crypto.randomUUID(), role: 'user', content: text })
    addMsg({ id: thinkingId, role: 'thinking', label: labels[0] })

    let jobSessionId: string | null = null

    try {
      const { job_id, session_id } = await sendMessage(text, sessionRef.current, credential)
      jobSessionId = session_id
      sessionRef.current = session_id
      sessionStorage.setItem(SS_CURRENT_SESSION, session_id)
      if (!sessionParam) {
        setSearchParams({ session: session_id }, { replace: true })
      }
      const data = await pollJob(job_id, thinkingId, labels)
      removeMsg(thinkingId)

      // v2: structured result → navigate to Results page
      if (data.result_data) {
        if (data.final_report) window.dispatchEvent(new CustomEvent('nomadai:newreport'))
        navigate(`/results/${jobSessionId}`, { state: { result: data.result_data } })
        setLoading(false)
        return
      }

      const reply = (data.final_report || data.reply || t('chat.error_processing')) as string

      if (sessionRef.current !== jobSessionId) {
        const prior = loadMessages(jobSessionId)
        sessionStorage.setItem(
          msgsKey(jobSessionId),
          JSON.stringify([...prior, { id: crypto.randomUUID(), role: 'assistant' as const, content: reply }]),
        )
        if (data.final_report) window.dispatchEvent(new CustomEvent('nomadai:newreport'))
        setLoading(false)
        return
      }

      addMsg({ id: crypto.randomUUID(), role: 'assistant', content: reply })
      if (data.final_report) {
        window.dispatchEvent(new CustomEvent('nomadai:newreport'))
      }
    } catch (err: unknown) {
      removeMsg(thinkingId)
      if (jobSessionId && sessionRef.current !== jobSessionId) {
        setLoading(false)
        return
      }
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout()
      } else {
        addMsg({ id: crypto.randomUUID(), role: 'assistant', content: t('chat.error_api') })
      }
    }

    setLoading(false)
    inputRef.current?.focus()
  }

  // ── Reset profile ─────────────────────────────────────────────────────────

  async function handleReset() {
    if (!userId || !credential) return
    if (!confirm(t('chat.reset_confirm'))) return
    await deleteProfile(userId, credential).catch(() => {})
    if (sessionRef.current) sessionStorage.removeItem(msgsKey(sessionRef.current))
    sessionRef.current = null
    sessionStorage.removeItem(SS_CURRENT_SESSION)
    setMessages([])
    setSearchParams({}, { replace: true })
    addMsg({ id: crypto.randomUUID(), role: 'assistant', content: t('chat.reset_done') })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-3">

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3 opacity-40">
              <span className="text-4xl">💬</span>
              <p className="text-sm text-zinc-500">{t('chat.empty')}</p>
            </div>
          )}

          {messages.map(msg => {
            if (msg.role === 'user') return (
              <div key={msg.id} className="flex justify-end bubble-in">
                <div className="max-w-[72%] bg-blue-700 text-white px-4 py-2.5 rounded-2xl rounded-br-[4px] text-sm leading-relaxed">
                  {msg.content}
                </div>
              </div>
            )

            if (msg.role === 'thinking') return (
              <div key={msg.id} className="flex justify-start bubble-in">
                <div className="bg-zinc-900 border border-zinc-800 px-4 py-3 rounded-2xl rounded-bl-[4px] flex items-center gap-2.5">
                  <div className="flex gap-1">
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </div>
                  <span className="text-xs text-zinc-500">{msg.label}</span>
                </div>
              </div>
            )

            return (
              <div key={msg.id} className="flex justify-start bubble-in w-full">
                <div
                  className="w-full bg-zinc-900 border border-zinc-800 px-5 py-4 rounded-2xl rounded-bl-[4px] text-sm prose-chat"
                  dangerouslySetInnerHTML={{ __html: wrapH3Sections(marked.parse(msg.content) as string) }}
                />
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-col gap-2">
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder={t('chat.placeholder')}
              className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 resize-none outline-none max-h-40 leading-relaxed transition-all"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed hover:opacity-85 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #10b981, #6366f1)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleReset}
              className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
            >
              {t('chat.reset_btn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
