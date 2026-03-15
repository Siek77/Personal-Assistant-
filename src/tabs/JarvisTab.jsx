import { useState, useRef, useEffect, useCallback } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'
import { useGoogleDrive } from '../hooks/useGoogleDrive'

// ── Provider configs ───────────────────────────────────────────
const PROVIDERS = {
  groq: {
    name: 'Groq',
    badge: 'FREE',
    badgeColor: '#10b981',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    format: 'openai',
    keyName: 'groqApiKey',
    modelKey: 'groqModel',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended)' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Fastest)' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
    signupUrl: 'https://console.groq.com',
    signupLabel: 'console.groq.com → free signup',
  },
  gemini: {
    name: 'Gemini',
    badge: 'FREE',
    badgeColor: '#10b981',
    url: null, // built with key in URL
    format: 'gemini',
    keyName: 'geminiApiKey',
    modelKey: null,
    models: [],
    signupUrl: 'https://aistudio.google.com/app/apikey',
    signupLabel: 'aistudio.google.com → Get API key',
  },
  openrouter: {
    name: 'OpenRouter',
    badge: 'FREE MODELS',
    badgeColor: '#8b5cf6',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    format: 'openai',
    keyName: 'openrouterApiKey',
    modelKey: 'openrouterModel',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (Free)' },
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Free)' },
    ],
    signupUrl: 'https://openrouter.ai/keys',
    signupLabel: 'openrouter.ai → free API key',
  },
  claude: {
    name: 'Claude',
    badge: 'PAID',
    badgeColor: '#f97316',
    url: 'https://api.anthropic.com/v1/messages',
    format: 'claude',
    keyName: 'claudeApiKey',
    modelKey: 'claudeModel',
    models: [
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Best)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Balanced)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fast)' },
    ],
    signupUrl: 'https://console.anthropic.com',
    signupLabel: 'console.anthropic.com',
  },
}

function buildSystemPrompt(settings, memory) {
  const name = settings.userName || 'User'
  const facts = memory.facts.map(f => `- ${f.text}`).join('\n') || '(nothing yet)'
  const routines = memory.routines.map(r => `- ${r.description}`).join('\n') || '(none noted yet)'
  const topics = memory.recentTopics.join(', ') || 'none yet'
  return `You are JARVIS, a highly intelligent personalized AI assistant — like Tony Stark's JARVIS. You are helpful, witty, precise, and proactive. Address the user as "${name}".

What you know about ${name}:
${facts}

Known routines:
${routines}

Recent interests: ${topics}

Guidelines:
- Be concise but thorough. Match the user's energy.
- Proactively surface relevant info based on what you know.
- Use a slightly formal but warm tone — sophisticated, not generic.
- Reference previous context when relevant. You have full conversation history across sessions.
- Format with markdown (lists, code blocks) when it helps.`
}

async function callAI(provider, settings, messages, systemPrompt) {
  const cfg = PROVIDERS[provider]
  const key = settings[cfg.keyName]
  const model = cfg.modelKey ? settings[cfg.modelKey] || cfg.models[0]?.id : null

  if (!key) throw new Error(`No ${cfg.name} API key set. Go to Settings → AI.`)

  // ── Groq / OpenRouter (OpenAI-compatible) ──
  if (cfg.format === 'openai') {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `${cfg.name} error ${res.status}`) }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  // ── Gemini ──
  if (cfg.format === 'gemini') {
    const geminiModel = 'gemini-1.5-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
      }),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Gemini error ${res.status}`) }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  // ── Claude ──
  if (cfg.format === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages }),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || `Claude error ${res.status}`) }
    const data = await res.json()
    return data.content?.[0]?.text || ''
  }

  throw new Error('Unknown provider')
}

// ── Component ──────────────────────────────────────────────────
export default function JarvisTab() {
  const { settings, updateSetting } = useSettings()
  const { memory, addFact, addTopic, extractMemory } = useMemory()
  const provider = settings.aiProvider || 'groq'
  const cfg = PROVIDERS[provider]

  const drive = useGoogleDrive(settings.googleClientId || null)

  // Stable conversation ID for this session
  const convIdRef = useRef(String(Date.now()))
  // Prior session messages (from Drive) included as context but not displayed
  const priorMessagesRef = useRef([])

  const [messages, setMessages] = useState([{
    id: 'welcome', role: 'assistant',
    content: `Systems online. Welcome back${settings.userName ? ', ' + settings.userName : ''}. How can I assist you today?`,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [newFact, setNewFact] = useState('')
  const [showMemory, setShowMemory] = useState(false)
  const [driveStatus, setDriveStatus] = useState('')
  const messagesEnd = useRef(null)
  const saveTimerRef = useRef(null)

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // Load prior conversation context when Drive connects
  useEffect(() => {
    if (!drive.isSignedIn) return
    ;(async () => {
      try {
        setDriveStatus('Loading history…')
        const convs = await drive.loadRecentConversations(3)
        // Flatten last 10 messages from prior sessions (oldest first) as hidden context
        const prior = convs
          .reverse()
          .flatMap(c => (c.messages || []).filter(m => m.id !== 'welcome').slice(-6))
          .slice(-10)
        priorMessagesRef.current = prior.map(m => ({ role: m.role, content: m.content }))
        setDriveStatus(convs.length ? `${convs.length} session${convs.length > 1 ? 's' : ''} loaded` : 'No history yet')
        setTimeout(() => setDriveStatus(''), 3000)
      } catch (e) {
        setDriveStatus('History load failed')
        setTimeout(() => setDriveStatus(''), 3000)
      }
    })()
  }, [drive.isSignedIn])

  // Debounced save to Drive after each message exchange
  const scheduleDriveSave = useCallback((msgs) => {
    if (!drive.isSignedIn) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      drive.saveConversation(convIdRef.current, msgs).catch(() => {})
    }, 2000)
  }, [drive.isSignedIn, drive.saveConversation])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMsg = {
      id: Date.now(), role: 'user', content: input.trim(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setLoading(true)
    extractMemory(input.trim(), '')

    try {
      const systemPrompt = buildSystemPrompt(settings, memory)
      // Include prior session messages as context, then current session
      const apiMessages = [
        ...priorMessagesRef.current,
        ...nextMessages
          .filter(m => m.id !== 'welcome')
          .map(m => ({ role: m.role, content: m.content })),
      ]

      const reply = await callAI(provider, settings, apiMessages, systemPrompt)

      const assistantMsg = {
        id: Date.now() + 1, role: 'assistant', content: reply,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }
      const finalMessages = [...nextMessages, assistantMsg]
      setMessages(finalMessages)
      scheduleDriveSave(finalMessages)

      const words = input.split(' ').filter(w => w.length > 4)
      if (words.length) addTopic(words.slice(0, 3).join(' '))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const clearChat = () => setMessages([{
    id: 'welcome', role: 'assistant',
    content: `Chat cleared. Systems ready, ${settings.userName || 'User'}.`,
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }])

  const hasKey = !!settings[cfg.keyName]

  return (
    <div className="jarvis-layout" style={{ height: 'calc(100vh - var(--header) - 40px)' }}>

      {/* ── Chat Panel ── */}
      <div className="chat-panel">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div className="jarvis-orb">🤖</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>JARVIS</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: cfg.badgeColor + '22', color: cfg.badgeColor, letterSpacing: 0.5 }}>
                {cfg.name} · {cfg.badge}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
              {hasKey ? `Using ${settings[cfg.modelKey] || cfg.models[0]?.id || cfg.name}` : `⚠️ No ${cfg.name} key — go to Settings`}
            </div>
          </div>

          {/* Provider switcher */}
          <select
            value={provider}
            onChange={e => updateSetting('aiProvider', e.target.value)}
            className="input provider-select"
            style={{ width: 'auto', fontSize: 12, padding: '5px 10px', height: 34 }}
          >
            {Object.entries(PROVIDERS).map(([id, p]) => (
              <option key={id} value={id}>{p.name} ({p.badge})</option>
            ))}
          </select>

          {settings.googleClientId && (
            <button
              className={`btn btn-ghost btn-sm`}
              onClick={drive.isSignedIn ? undefined : drive.signIn}
              title={drive.isSignedIn ? driveStatus || 'Drive connected — conversations saving' : 'Connect Google Drive'}
              style={{ fontSize: 16, opacity: drive.isSignedIn ? 1 : 0.4 }}
            >
              {drive.signInStatus === 'signing-in' ? '⏳' : drive.isSignedIn ? '🟢' : '☁️'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm memory-toggle-btn" onClick={() => setShowMemory(s => !s)}>
            {showMemory ? '💬' : '🧠'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearChat}>Clear</button>
        </div>

        {/* No key warning */}
        {!hasKey && (
          <div style={{ background: 'rgba(245,133,77,0.08)', border: '1px solid rgba(245,133,77,0.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: 'var(--orange)', marginBottom: 4 }}>
              {cfg.name} API key needed
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.6 }}>
              Get a free key at <strong style={{ color: 'var(--text3)' }}>{cfg.signupLabel}</strong>, then paste it in <strong>Settings → AI</strong>.
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="chat-messages">
          {messages.map(msg => (
            <div key={msg.id} className={`chat-bubble ${msg.role === 'user' ? 'user' : ''}`}>
              <div className={`bubble-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                {msg.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div className="bubble-body">
                <div className="bubble-text">{msg.content}</div>
                <div className="bubble-time">{msg.time}</div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-bubble">
              <div className="bubble-avatar ai">🤖</div>
              <div className="bubble-body">
                <div className="typing-indicator"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 13, color: 'var(--red)', cursor: 'pointer' }} onClick={() => setError(null)}>
              ⚠️ {error} <span style={{ opacity: 0.6 }}>(tap to dismiss)</span>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            className="input"
            style={{ minHeight: 48, maxHeight: 120 }}
            placeholder={`Ask JARVIS via ${cfg.name}… (Enter to send)`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
          />
          <button
            className="btn btn-primary"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{ minWidth: 60, height: 48 }}
          >
            {loading ? '…' : '↑'}
          </button>
        </div>
      </div>

      {/* ── Memory Panel ── */}
      <div className={`memory-panel ${showMemory ? 'memory-panel--open' : ''}`}>
        {/* Memory */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>🧠 Memory</h4>
            <span className="badge badge-blue">{memory.facts.length}</span>
          </div>
          {memory.facts.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>JARVIS will remember things you tell it as you chat.</p>
            : memory.facts.slice(0, 6).map(f => (
              <div key={f.id} className="memory-item">
                <span className="mem-icon">{f.category === 'preference' ? '❤️' : '📌'}</span>
                <span className="mem-text">{f.text.length > 80 ? f.text.slice(0, 80) + '…' : f.text}</span>
              </div>
            ))
          }
        </div>

        {/* Tell JARVIS */}
        <div className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>📝 Tell JARVIS About You</h4>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input" style={{ fontSize: 12 }}
              placeholder="e.g. I wake up at 7am"
              value={newFact} onChange={e => setNewFact(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newFact.trim()) { addFact(newFact.trim(), 'manual'); setNewFact('') } }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => { if (newFact.trim()) { addFact(newFact.trim(), 'manual'); setNewFact('') } }}>+</button>
          </div>
        </div>

        {/* Routines */}
        {memory.routines.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>🔄 Routines</h4>
            {memory.routines.slice(0, 4).map(r => (
              <div key={r.id} className="memory-item">
                <span className="mem-icon">📅</span>
                <span className="mem-text">{r.description.length > 70 ? r.description.slice(0, 70) + '…' : r.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Topics */}
        {memory.recentTopics.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>💬 Recent Topics</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {memory.recentTopics.map((t, i) => (
                <span key={i} className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => setInput(t)}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Quick prompts */}
        <div className="card">
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>⚡ Quick Prompts</h4>
          {["What's my schedule today?", "Summarize my routine", "What should I focus on?", "Any suggestions for tonight?"].map(p => (
            <div key={p} className="memory-item" style={{ cursor: 'pointer' }} onClick={() => setInput(p)}>
              <span className="mem-icon">→</span>
              <span className="mem-text">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
