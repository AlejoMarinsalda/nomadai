import { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { useAuth } from '../hooks/useAuth'
import { deleteProfile, getJobStatus, getProfile, sendMessage } from '../lib/api'

// ── Marked setup ─────────────────────────────────────────────────────────────

marked.use({
  renderer: {
    link(href: string, title: string | null | undefined, text: string) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`
    },
  },
})

// ── Types ─────────────────────────────────────────────────────────────────────

type Message =
  | { id: string; role: 'user';      content: string }
  | { id: string; role: 'assistant'; content: string }
  | { id: string; role: 'thinking';  label: string }

const LABELS = [
  'Analizando tu perfil',
  'Buscando destinos',
  'Enriqueciendo resultados',
  'Preparando tu reporte',
]

// ── Chat page ─────────────────────────────────────────────────────────────────

export default function Chat() {
  const { userId, userName, credential, logout } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const sessionRef  = useRef<string | null>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const initialized = useRef(false)

  const addMsg = useCallback((msg: Message) => setMessages(p => [...p, msg]), [])
  const removeMsg = useCallback((id: string) => setMessages(p => p.filter(m => m.id !== id)), [])
  const updateLabel = useCallback((id: string, label: string) =>
    setMessages(p => p.map(m => m.id === id && m.role === 'thinking' ? { ...m, label } : m)), [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Welcome message on mount
  useEffect(() => {
    if (initialized.current || !userId || !credential) return
    initialized.current = true
    const firstName = (userName || '').split(' ')[0]

    getProfile(userId, credential)
      .then(data => {
        if (data.found) {
          addMsg({ id: crypto.randomUUID(), role: 'assistant',
            content: `¡Bienvenido de vuelta, **${firstName}**! 🎉 Ya tengo tu perfil guardado. ¿Querés explorar nuevos destinos o tenés alguna pregunta?` })
        } else {
          addMsg({ id: crypto.randomUUID(), role: 'assistant',
            content: `¡Hola, **${firstName}**! 👋 Soy **NomadAI**. Te ayudo a encontrar tu próximo destino como nómada digital.\n\nContame sobre vos: ¿qué hobbies tenés, cuál es tu presupuesto mensual, desde qué zona horaria trabajás y cuál es tu nacionalidad?` })
        }
      })
      .catch(err => { if (err.message === 'UNAUTHORIZED') logout() })
  }, [userId, credential, userName, addMsg, logout])

  async function pollJob(jobId: string, thinkingId: string) {
    const started = Date.now()
    let idx = 0
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setInterval(async () => {
        idx = (idx + 1) % LABELS.length
        updateLabel(thinkingId, LABELS[idx])
        if (Date.now() - started > 360_000) { clearInterval(timer); reject(new Error('Timeout')); return }
        try {
          const data = await getJobStatus(jobId)
          if (data.status === 'done' || data.status === 'error') { clearInterval(timer); resolve(data) }
        } catch { /* ignore transient errors */ }
      }, 3000)
    })
  }

  async function send() {
    const text = input.trim()
    if (!text || loading || !userId || !credential) return
    setInput('')
    setLoading(true)

    const thinkingId = crypto.randomUUID()
    addMsg({ id: crypto.randomUUID(), role: 'user', content: text })
    addMsg({ id: thinkingId, role: 'thinking', label: LABELS[0] })

    try {
      const { job_id, session_id } = await sendMessage(text, sessionRef.current, credential)
      sessionRef.current = session_id
      const data = await pollJob(job_id, thinkingId)
      removeMsg(thinkingId)
      const reply = (data.final_report || data.reply || '⚠️ Error procesando la solicitud.') as string
      addMsg({ id: crypto.randomUUID(), role: 'assistant', content: reply })
    } catch (err: unknown) {
      removeMsg(thinkingId)
      if (err instanceof Error && err.message === 'UNAUTHORIZED') {
        logout()
      } else {
        addMsg({ id: crypto.randomUUID(), role: 'assistant', content: '⚠️ Error conectando con la API.' })
      }
    }

    setLoading(false)
    inputRef.current?.focus()
  }

  async function handleReset() {
    if (!userId || !credential) return
    if (!confirm('¿Borrar tu perfil guardado? La próxima vez vas a tener que completarlo de nuevo.')) return
    await deleteProfile(userId, credential).catch(() => {})
    sessionRef.current = null
    setMessages([])
    addMsg({ id: crypto.randomUUID(), role: 'assistant', content: 'Perfil borrado. Contame de nuevo sobre vos para encontrar tu próximo destino.' })
  }

  return (
    <div className="flex flex-col h-full">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-3">

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3 opacity-40">
              <span className="text-4xl">💬</span>
              <p className="text-sm text-zinc-500">Iniciá la conversación para encontrar tu próximo destino</p>
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

            // assistant
            return (
              <div key={msg.id} className="flex justify-start bubble-in w-full">
                <div
                  className="w-full bg-zinc-900 border border-zinc-800 px-5 py-4 rounded-2xl rounded-bl-[4px] text-sm prose-chat"
                  dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) as string }}
                />
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input + reset */}
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
              placeholder="Contame sobre vos... hobbies, presupuesto, zona horaria..."
              className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 resize-none outline-none max-h-40 leading-relaxed transition-all"
            />
            <button
              onClick={send}
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
              ↺ Reset perfil
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
