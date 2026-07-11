import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppProvider'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { mdToHtml } from '@/lib/markdown'

type Msg = {
  id: string
  sender: 'visitor' | 'agent'
  agent_name?: string | null
  body: string
  created_at: string
}

const STORE_KEY = 'bilago_chat'

function fmtTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    )
  } catch {
    return ''
  }
}

function load(): { id: string; token: string } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as { id: string; token: string }) : null
  } catch {
    return null
  }
}

/**
 * Flydende Maria live-chat. Virker for anonyme besøgende (marketing) OG
 * indloggede kunder. Al backend går via edge functions (chat-*); Maria svarer,
 * og kunden kan tilkalde et menneske.
 */
export function ChatWidget() {
  const { user, profile } = useApp()
  const location = useLocation()
  const defaultEmail = user?.email ?? ''
  const defaultName = profile?.full_name ?? ''
  const known = !!defaultEmail

  const [open, setOpen] = useState(false)
  const [conv, setConv] = useState<{ id: string; token: string } | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Venter vi på et Maria-svar? (Maria genereres i baggrunden efter afsendelse.)
  const [awaitingReply, setAwaitingReply] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [wantsHuman, setWantsHuman] = useState(false)
  const [confirmingHuman, setConfirmingHuman] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [online, setOnline] = useState(true)
  const [offlineMessage, setOfflineMessage] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Hold formular-defaults i sync når brugeren logger ind mens widgeten er mountet.
  useEffect(() => {
    if (defaultEmail) setEmail(defaultEmail)
    if (defaultName) setName(defaultName)
  }, [defaultEmail, defaultName])

  // Åbn automatisk hvis man kommer fra en push-notifikation (?chat=1), og fjern
  // parameteren igen så et refresh ikke genåbner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('chat') === '1') {
      setOpen(true)
      params.delete('chat')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  // Andre dele af appen (fx menuen) kan åbne chatten via en event.
  useEffect(() => {
    function openChat() {
      setOpen(true)
    }
    window.addEventListener('bilago:open-chat', openChat)
    return () => window.removeEventListener('bilago:open-chat', openChat)
  }, [])

  const refetch = useCallback(async (c: { id: string; token: string }) => {
    const { data, error } = await supabase.functions.invoke('chat-history', {
      body: { id: c.id, token: c.token },
    })
    if (error || !data) return
    const d = data as { messages?: Msg[]; aiEnabled?: boolean; wantsHuman?: boolean }
    const msgs = d.messages ?? []
    setMessages(msgs)
    if (typeof d.aiEnabled === 'boolean') setAiEnabled(d.aiEnabled)
    if (typeof d.wantsHuman === 'boolean') setWantsHuman(d.wantsHuman)
    // Et agent-svar (Maria eller medarbejder) er landet → stop "Maria skriver …".
    if (msgs.length && msgs[msgs.length - 1].sender === 'agent') setAwaitingReply(false)
  }, [])

  // Init ved åbning
  useEffect(() => {
    if (!open || conv) return
    const existing = load()
    if (existing) {
      setConv(existing)
      void refetch(existing)
    }
  }, [open, conv, refetch])

  // Online-status ved åbning
  useEffect(() => {
    if (!open) return
    void supabase.functions
      .invoke('chat-config', { body: {} })
      .then(({ data }) => {
        if (data && typeof data === 'object') {
          const d = data as { online?: boolean; offlineMessage?: string }
          setOnline(!!d.online)
          setOfflineMessage(d.offlineMessage || '')
        }
      })
      .catch(() => {})
  }, [open])

  // Poll mens åben. Hurtigere (1,5s) mens vi venter på Marias svar, ellers 5s.
  useEffect(() => {
    if (!open || !conv) return
    const t = setInterval(() => void refetch(conv), awaitingReply ? 1500 : 5000)
    return () => clearInterval(t)
  }, [open, conv, refetch, awaitingReply])

  // Sikkerheds-timeout så "Maria skriver …" ikke hænger hvis noget fejler.
  useEffect(() => {
    if (!awaitingReply) return
    const t = setTimeout(() => setAwaitingReply(false), 25000)
    return () => clearTimeout(t)
  }, [awaitingReply])

  // Broadcast-kanal for øjeblikkelig opdatering når en agent svarer.
  useEffect(() => {
    if (!conv) return
    const ch = supabase.channel(`chat-${conv.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'ping' }, () => void refetch(conv))
    ch.subscribe()
    channelRef.current = ch
    return () => {
      void supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [conv, refetch])

  // Følg med til bunden ved nye beskeder / mens Maria skriver
  const lastIdRef = useRef<string | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const lastId = messages[messages.length - 1]?.id ?? null
    const isNew = lastId !== lastIdRef.current
    lastIdRef.current = lastId
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNew || nearBottom || sending) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, sending])

  async function escalate() {
    if (!conv || escalating) return
    setEscalating(true)
    setConfirmingHuman(false)
    setWantsHuman(true)
    try {
      await supabase.functions.invoke('chat-escalate', {
        body: { id: conv.id, token: conv.token },
      })
      await refetch(conv)
    } finally {
      setEscalating(false)
    }
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    if (!conv) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        setEmailError('Indtast en gyldig e-mail, så vi kan svare dig.')
        return
      }
      setEmailError(null)
    }
    setSending(true)
    try {
      let c = conv
      if (!c) {
        const { data, error } = await supabase.functions.invoke('chat-start', {
          body: { name, email: email.trim() },
        })
        if (error || !data) return
        const d = data as { id: string; token: string }
        c = { id: d.id, token: d.token }
        localStorage.setItem(STORE_KEY, JSON.stringify(c))
        setConv(c)
      }
      setText('')
      // Optimistisk visning
      setMessages((m) => [
        ...m,
        { id: `tmp-${m.length}`, sender: 'visitor', body, created_at: new Date().toISOString() },
      ])
      const { data } = await supabase.functions.invoke('chat-send', {
        body: { id: c.id, token: c.token, body },
      })
      // Viser om Maria svarer (så vi kan vise "Maria skriver …" + polle hurtigere).
      setAwaitingReply(!!(data as { answering?: boolean } | null)?.answering)
      channelRef.current?.send({ type: 'broadcast', event: 'ping', payload: {} })
      await refetch(c)
    } finally {
      setSending(false)
    }
  }

  if (!isSupabaseConfigured) return null
  // Skjul på platform-staff-området og på login/opret-siderne.
  const hiddenOn = ['/platform', '/login', '/signup']
  if (hiddenOn.some((p) => location.pathname.startsWith(p))) return null

  const renderMsg = (m: Msg) => {
    const isVisitor = m.sender === 'visitor'
    return (
      <div key={m.id} className={`flex flex-col ${isVisitor ? 'items-end' : 'items-start'}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
            isVisitor ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
          }`}
        >
          {m.sender === 'agent' && m.agent_name ? (
            <div className="mb-0.5 text-[11px] font-semibold text-indigo-600">
              {m.agent_name.includes('@') ? 'Support' : m.agent_name}
            </div>
          ) : null}
          {m.sender === 'agent' ? (
            <div
              className="chat-md space-y-1.5 [&_a]:text-indigo-600 [&_code]:rounded [&_code]:bg-slate-200 [&_code]:px-1"
              dangerouslySetInnerHTML={{ __html: mdToHtml(m.body) }}
            />
          ) : (
            <span className="whitespace-pre-wrap">{m.body}</span>
          )}
        </div>
        <div className="mt-0.5 px-1 text-[11px] text-slate-400">{fmtTime(m.created_at)}</div>
      </div>
    )
  }

  return (
    <>
      {/* Flydende knap — skjules når panelet er åbent (panelet har sin egen luk-knap). */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          aria-label="Åbn chat"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-[60] grid h-12 w-12 place-items-center rounded-full bg-indigo-600 text-white shadow-md transition hover:bg-indigo-700 md:bottom-5 md:right-5 md:h-14 md:w-14"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      ) : null}

      {open ? (
        // Mobil: fuldskærm. Desktop: fuld-højde panel i højre side.
        <div className="fixed inset-0 z-[80] flex flex-col bg-white md:inset-y-0 md:left-auto md:right-0 md:w-[400px] md:border-l md:border-slate-200 md:shadow-2xl">
          <div className="flex items-start justify-between gap-2 bg-indigo-600 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white md:pt-3">
            <div>
              <div className="font-bold">Chat med Maria</div>
              <div className="flex items-center gap-1.5 text-xs text-white/80">
                <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-300' : 'bg-white/50'}`} />
                {online ? 'Vi er online — skriv til os' : 'Maria hjælper dig med det samme'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Luk chat"
              className="-mr-1 -mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/90 transition hover:bg-white/15"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="min-h-40 flex-1 space-y-2 overflow-y-auto p-3">
            {!online && offlineMessage ? (
              <div className="mb-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {offlineMessage}
              </div>
            ) : null}
            {messages.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Hej! 👋 Jeg er Maria. Spørg mig om Bilago — fakturaer, bilag, moms og mere.
              </p>
            ) : null}
            {messages.map(renderMsg)}
            {awaitingReply ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-slate-100 px-3 py-2 text-sm italic text-slate-500">
                  Maria skriver …
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-slate-200 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
            {known && !conv ? (
              <p className="text-xs text-slate-500">
                Skriver som{' '}
                <span className="font-semibold text-slate-700">{defaultName || defaultEmail}</span>
              </p>
            ) : null}
            {!conv && !known ? (
              <div className="space-y-2">
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  autoComplete="off"
                  placeholder="Dit navn (valgfrit)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Din e-mail *"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError(null)
                  }}
                />
                {emailError ? <p className="text-xs text-rose-600">{emailError}</p> : null}
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                autoComplete="off"
                placeholder="Skriv en besked…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <button
                onClick={() => void send()}
                disabled={sending}
                className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                Send
              </button>
            </div>
            {conv ? (
              !aiEnabled ? (
                <p className="text-center text-xs text-slate-500">En medarbejder er hos dig 👋</p>
              ) : wantsHuman ? (
                <p className="text-center text-xs text-slate-500">
                  En medarbejder er underrettet 👋 Vi vender tilbage til dig hurtigst muligt.
                </p>
              ) : confirmingHuman ? (
                <div className="space-y-1.5 text-center text-xs text-slate-500">
                  <div>Vil du skrive til en medarbejder i stedet for Maria?</div>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void escalate()}
                      disabled={escalating}
                      className="rounded-full bg-indigo-600 px-3 py-1 font-medium text-white disabled:opacity-60"
                    >
                      Ja, skriv til en medarbejder
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingHuman(false)}
                      className="rounded-full border border-slate-200 px-3 py-1"
                    >
                      Nej
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingHuman(true)}
                  className="w-full text-center text-xs text-slate-500 hover:text-indigo-600"
                >
                  Tal med et menneske
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
