import { useState, useRef, useEffect, useCallback } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'
import { useGoogleDrive } from '../hooks/useGoogleDrive'
import { useConversations } from '../hooks/useConversations'
import { useGmail } from '../hooks/useGmail'

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

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, match => match.replace(/```\w*\n?/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()
}

function buildSystemPrompt(settings, memory) {
  const name = settings.userName || 'User'
  const facts = memory.facts.map(f => `- ${f.text}`).join('\n') || '(nothing yet)'
  const routines = memory.routines.map(r => `- ${r.description}`).join('\n') || '(none noted yet)'
  const topics = memory.recentTopics.join(', ') || 'none yet'

  // Pull calendar + email context from localStorage for the daily brief / general context
  const now = new Date()
  const calEvents = (() => {
    try {
      const events = JSON.parse(localStorage.getItem('jarvis_calendar_events') || '[]')
      const cutoff = new Date(now.getTime() + 7 * 86400000)
      return events
        .filter(e => e.start && new Date(e.start) >= now && new Date(e.start) <= cutoff)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .slice(0, 10)
        .map(e => {
          const d = new Date(e.start)
          const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          const timeStr = e.allDay ? 'all day' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          return `- ${dateStr} ${timeStr}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`
        })
        .join('\n')
    } catch { return '' }
  })()

  const emailSummary = (() => {
    try {
      const emails = JSON.parse(localStorage.getItem('jarvis_email_summary') || '[]')
      if (!emails.length) return ''
      return emails.slice(0, 5).map(e => `- ${e.unread ? '[UNREAD] ' : ''}${e.subject} — from ${e.from}`).join('\n')
    } catch { return '' }
  })()

  const weatherContext = (() => {
    try {
      const w = JSON.parse(localStorage.getItem('jarvis_weather_cache') || 'null')
      if (!w) return ''
      const age = (Date.now() - new Date(w.cachedAt).getTime()) / 60000
      if (age > 120) return '' // stale after 2 hours
      return `Current weather: ${w.temp}°F, ${w.desc}.${w.rainChance > 30 ? ` Rain chance today: ${w.rainChance}%.` : ' No significant rain expected.'}`
    } catch { return '' }
  })()

  const haContext = (() => {
    try {
      const ha = JSON.parse(localStorage.getItem('jarvis_ha_snapshot') || 'null')
      if (!ha) return ''
      const age = (Date.now() - new Date(ha.lastUpdated).getTime()) / 60000
      if (age > 30) return ''
      const parts = [`${ha.lightsOn} light${ha.lightsOn !== 1 ? 's' : ''} on`]
      if (ha.temperature != null) parts.push(`thermostat at ${ha.temperature}°`)
      return `Smart home: ${parts.join(', ')}.`
    } catch { return '' }
  })()

  const stocksContext = (() => {
    try {
      const stocks = JSON.parse(localStorage.getItem('jarvis_stocks_cache') || '[]')
      if (!stocks.length) return ''
      return `Portfolio today: ${stocks.map(s => `${s.symbol} ${(s.changePercent || 0) >= 0 ? '+' : ''}${s.changePercent?.toFixed(1)}%`).join(', ')}.`
    } catch { return '' }
  })()

  return `You are JARVIS, a highly intelligent personalized AI assistant — like Tony Stark's JARVIS. You are helpful, witty, precise, and proactive. Address the user as "${name}". Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

What you know about ${name}:
${facts}

Known routines:
${routines}

Recent interests: ${topics}
${calEvents ? `\nUpcoming calendar events:\n${calEvents}` : ''}
${emailSummary ? `\nRecent emails:\n${emailSummary}` : ''}
${weatherContext ? `\nLive context:\n- ${weatherContext}` : ''}
${haContext ? `- ${haContext}` : ''}
${stocksContext ? `- ${stocksContext}` : ''}

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
    const geminiModel = 'gemini-2.5-flash-lite'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        tools: [{ google_search: {} }],
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
  const { memory, addFact, editFact, removeFact, addRoutine, removeRoutine, addTopic, removeTopic, extractMemory } = useMemory()
  const provider = settings.aiProvider || 'groq'
  const cfg = PROVIDERS[provider]

  const drive = useGoogleDrive(settings.googleClientId || null)
  const conversations = useConversations()
  const gmail = useGmail(settings.googleClientId || null)

  // Stable conversation ID for this session
  const convIdRef = useRef(String(Date.now()))
  // Prior session messages included as context but not displayed
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
  const [saveStatus, setSaveStatus] = useState('')   // shown in header
  const [saving, setSaving] = useState(false)
  const [driveStatus, setDriveStatus] = useState('')
  const [driveSaving, setDriveSaving] = useState(false)
  const [factsExpanded, setFactsExpanded] = useState(false)
  const [routinesExpanded, setRoutinesExpanded] = useState(false)
  const [driveConvsExpanded, setDriveConvsExpanded] = useState(false)
  const [blobConvsExpanded, setBlobConvsExpanded] = useState(false)
  const [blobConvs, setBlobConvs] = useState([])
  const [archiving, setArchiving] = useState(false)
  const [editingFactId, setEditingFactId] = useState(null)
  const [editingFactText, setEditingFactText] = useState('')
  const [driveConvs, setDriveConvs] = useState([])
  const [emails, setEmails] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jarvis_email_summary') || '[]') } catch { return [] }
  })
  const [emailsExpanded, setEmailsExpanded] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled || false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const messagesEnd = useRef(null)
  const saveTimerRef = useRef(null)

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // Keep localStorage in sync so voice.js can read recent conversation via blob
  useEffect(() => {
    const saveable = messages.filter(m => m.id !== 'welcome' && m.role && m.content)
    if (!saveable.length) return
    try {
      localStorage.setItem(
        'jarvis_recent_conv',
        JSON.stringify(saveable.slice(-20).map(m => ({ role: m.role, content: m.content })))
      )
    } catch { /* ignore */ }
  }, [messages])

  // Load prior context — blob-primary, Drive as fallback
  useEffect(() => {
    ;(async () => {
      // ── Blob conversations (primary) ──
      if (conversations.isAvailable) {
        try {
          setSaveStatus('Loading history…')
          const convs = await conversations.loadRecentConversations(3)
          const prior = convs
            .flatMap(c => (c.messages || []).filter(m => m.id !== 'welcome').slice(-6))
            .slice(-12)
          priorMessagesRef.current = prior.map(m => ({ role: m.role, content: m.content }))
          setSaveStatus(convs.length ? `${convs.length} session${convs.length > 1 ? 's' : ''} loaded` : '')
          setTimeout(() => setSaveStatus(''), 3000)
          // Also populate the blob convs list
          conversations.listConversations().then(setBlobConvs).catch(() => {})
        } catch {
          setSaveStatus('')
        }
        return // don't also load from Drive when blob is available
      }

      // ── Drive fallback (no sync passphrase configured) ──
      if (drive.isSignedIn) {
        try {
          setDriveStatus('Loading history…')
          const convs = await drive.loadRecentConversations(3)
          const prior = convs
            .reverse()
            .flatMap(c => (c.messages || []).filter(m => m.id !== 'welcome').slice(-6))
            .slice(-10)
          priorMessagesRef.current = prior.map(m => ({ role: m.role, content: m.content }))
          setDriveStatus(convs.length ? `${convs.length} session${convs.length > 1 ? 's' : ''} loaded` : 'No history yet')
          setTimeout(() => setDriveStatus(''), 3000)
        } catch {
          setDriveStatus('History load failed')
          setTimeout(() => setDriveStatus(''), 3000)
        }
      }
    })()
  }, [conversations.isAvailable, drive.isSignedIn])

  // Load Drive conversation list when signed in (for archive panel)
  useEffect(() => {
    if (!drive.isSignedIn) return
    drive.listAllConversations().then(setDriveConvs).catch(() => {})
  }, [drive.isSignedIn])

  // Save after every AI reply — blob-primary, Drive as fallback
  const scheduleSave = useCallback((msgs) => {
    if (conversations.isAvailable) {
      setSaving(true)
      conversations.saveConversation(convIdRef.current, msgs)
        .then(() => { setSaveStatus('✓ Saved'); setTimeout(() => setSaveStatus(''), 2500) })
        .catch(e => { setSaveStatus('⚠️ ' + (e.message || 'Save failed')); setTimeout(() => setSaveStatus(''), 6000) })
        .finally(() => setSaving(false))
    } else if (drive.isSignedIn) {
      setDriveSaving(true)
      drive.saveConversation(convIdRef.current, msgs)
        .then(() => { setDriveStatus('✓ Saved'); setTimeout(() => setDriveStatus(''), 2500) })
        .catch(e => { setDriveStatus('⚠️ ' + (e.message || 'Save failed')); setTimeout(() => setDriveStatus(''), 6000) })
        .finally(() => setDriveSaving(false))
    }
  }, [conversations.isAvailable, conversations.saveConversation, drive.isSignedIn, drive.saveConversation])

  // Archive all blob conversations to Drive, then delete from blob
  const archiveToDrive = useCallback(async () => {
    if (!drive.isSignedIn || !conversations.isAvailable) return
    setArchiving(true)
    try {
      const convList = await conversations.listConversations()
      for (const meta of convList) {
        const data = await fetch(meta.url).then(r => r.json()).catch(() => null)
        if (data?.messages) {
          await drive.saveConversation(meta.id, data.messages)
        }
      }
      const ids = convList.map(c => c.id)
      if (ids.length) await conversations.deleteConversations(ids)
      setBlobConvs([])
      setSaveStatus(`✓ Archived ${ids.length} conversations to Drive`)
      setTimeout(() => setSaveStatus(''), 4000)
    } catch (e) {
      setSaveStatus('⚠️ Archive failed: ' + e.message)
      setTimeout(() => setSaveStatus(''), 6000)
    } finally {
      setArchiving(false)
    }
  }, [drive.isSignedIn, drive.saveConversation, conversations])

  // ── TTS ──
  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(stripMarkdown(text))
    utt.rate = 0.95
    utt.pitch = 1
    window.speechSynthesis.speak(utt)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  const toggleTts = () => {
    const next = !ttsEnabled
    setTtsEnabled(next)
    updateSetting('ttsEnabled', next)
    if (!next) stopSpeaking()
  }

  // ── Voice Input ──
  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Voice input is not supported in this browser. Try Chrome or Edge.'); return }
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      setInput(prev => prev + (prev.trim() ? ' ' : '') + transcript)
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  // ── Daily Brief ──
  const sendDailyBrief = () => {
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const calEvents = (() => {
      try {
        return JSON.parse(localStorage.getItem('jarvis_calendar_events') || '[]')
          .filter(e => e.start && new Date(e.start).toDateString() === now.toDateString())
          .map(e => `- ${e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}: ${e.title}`)
          .join('\n')
      } catch { return '' }
    })()
    const emailLines = emails.slice(0, 3).map(e => `- ${e.unread ? '[UNREAD] ' : ''}${e.subject} from ${e.from}`).join('\n')
    let prompt = `Give me my morning briefing for ${todayStr}. Be concise and conversational.`
    if (calEvents) prompt += `\n\nToday's events:\n${calEvents}`
    if (emailLines) prompt += `\n\nRecent emails:\n${emailLines}`
    setInput(prompt)
  }

  // ── Gmail fetch ──
  const loadEmails = useCallback(async () => {
    if (!gmail.isSignedIn) return
    setEmailLoading(true)
    try {
      const fetched = await gmail.fetchEmails(10)
      setEmails(fetched)
      localStorage.setItem('jarvis_email_summary', JSON.stringify(fetched))
      window.dispatchEvent(new CustomEvent('jarvis:email-updated'))
    } catch (e) {
      console.error('Gmail fetch failed:', e)
    } finally {
      setEmailLoading(false)
    }
  }, [gmail.isSignedIn, gmail.fetchEmails])

  // Auto-load emails on sign-in
  useEffect(() => {
    if (gmail.isSignedIn && !emails.length) loadEmails()
  }, [gmail.isSignedIn])

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
      scheduleSave(finalMessages)
      if (ttsEnabled) speak(reply)

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

          {/* Blob save status */}
          {conversations.isAvailable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {saveStatus && (
                <span style={{ fontSize: 11, color: saveStatus.startsWith('✓') ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                  {saveStatus}
                </span>
              )}
              <span title="Conversations stored in Vercel Blob (accessible by voice)"
                style={{ fontSize: 13, opacity: saving ? 0.5 : 1 }}>
                {saving ? '⏳' : '🗄️'}
              </span>
            </div>
          )}

          {/* Drive button — archive / fallback only */}
          {settings.googleClientId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {!conversations.isAvailable && drive.isSignedIn && driveStatus && (
                <span style={{ fontSize: 11, color: driveStatus.startsWith('✓') ? 'var(--green)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                  {driveStatus}
                </span>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => drive.isSignedIn ? drive.signOut() : drive.signIn()}
                title={drive.isSignedIn ? 'Drive connected — use as archive' : 'Connect Google Drive (for archiving)'}
                style={{ fontSize: 16, opacity: drive.signInStatus === 'idle' ? 0.4 : 1 }}
              >
                {drive.signInStatus === 'signing-in' ? '⏳' : drive.isSignedIn ? '🟢' : '☁️'}
              </button>
            </div>
          )}
          {/* Daily Brief */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={sendDailyBrief}
            title="Generate your daily briefing"
            style={{ fontSize: 13 }}
          >
            📋
          </button>

          {/* TTS toggle */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleTts}
            title={ttsEnabled ? 'TTS on — click to mute' : 'TTS off — click to enable'}
            style={{ fontSize: 13, color: ttsEnabled ? 'var(--cyan)' : undefined }}
          >
            {ttsEnabled ? '🔊' : '🔇'}
          </button>

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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 4 }}>
                  <span className="bubble-time">{msg.time}</span>
                  {msg.role === 'assistant' && msg.id !== 'welcome' && (
                    <button
                      onClick={() => speak(msg.content)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text2)', padding: '0 2px', lineHeight: 1, opacity: 0.6 }}
                      title="Read aloud"
                    >
                      🔊
                    </button>
                  )}
                </div>
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
            className="btn btn-ghost"
            onClick={toggleVoice}
            title={listening ? 'Listening… click to stop' : 'Voice input'}
            style={{ minWidth: 48, height: 48, fontSize: 20, color: listening ? 'var(--red)' : 'var(--text2)', transition: 'color 0.2s', animation: listening ? 'pulse 1s infinite' : 'none' }}
          >
            {listening ? '🔴' : '🎙️'}
          </button>
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

        {/* Facts */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>🧠 Memory</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge badge-blue">{memory.facts.length}</span>
              {memory.facts.length > 3 && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                  onClick={() => setFactsExpanded(e => !e)}>
                  {factsExpanded ? '▲ less' : '▼ all'}
                </button>
              )}
            </div>
          </div>
          {memory.facts.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>JARVIS will remember things as you chat.</p>
            : (factsExpanded ? memory.facts : memory.facts.slice(0, 3)).map(f => (
              <div key={f.id} className="memory-item" style={{ alignItems: 'flex-start', gap: 4 }}>
                <span className="mem-icon" style={{ marginTop: 1 }}>{f.category === 'preference' ? '❤️' : f.category === 'manual' ? '⭐' : '📌'}</span>
                {editingFactId === f.id ? (
                  <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                    <input className="input" style={{ fontSize: 11, flex: 1 }} autoFocus
                      value={editingFactText} onChange={e => setEditingFactText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { editFact(f.id, editingFactText); setEditingFactId(null) }
                        if (e.key === 'Escape') setEditingFactId(null)
                      }} />
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => { editFact(f.id, editingFactText); setEditingFactId(null) }}>✓</button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setEditingFactId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <span className="mem-text" style={{ flex: 1 }}>{f.text}</span>
                    <button onClick={() => { setEditingFactId(f.id); setEditingFactText(f.text) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', padding: '0 2px', lineHeight: 1 }}>✏️</button>
                    <button onClick={() => removeFact(f.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--red)', padding: '0 2px', lineHeight: 1, opacity: 0.7 }}>✕</button>
                  </>
                )}
              </div>
            ))
          }
          {/* Add fact */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input className="input" style={{ fontSize: 12 }} placeholder="Add a fact… (Enter)"
              value={newFact} onChange={e => setNewFact(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newFact.trim()) { addFact(newFact.trim(), 'manual'); setNewFact('') } }} />
            <button className="btn btn-primary btn-sm"
              onClick={() => { if (newFact.trim()) { addFact(newFact.trim(), 'manual'); setNewFact('') } }}>+</button>
          </div>
        </div>

        {/* Routines */}
        {memory.routines.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>🔄 Routines</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-blue">{memory.routines.length}</span>
                {memory.routines.length > 3 && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                    onClick={() => setRoutinesExpanded(e => !e)}>
                    {routinesExpanded ? '▲ less' : '▼ all'}
                  </button>
                )}
              </div>
            </div>
            {(routinesExpanded ? memory.routines : memory.routines.slice(0, 3)).map(r => (
              <div key={r.id} className="memory-item" style={{ gap: 4 }}>
                <span className="mem-icon">📅</span>
                <span className="mem-text" style={{ flex: 1 }}>{r.description}</span>
                <button onClick={() => removeRoutine(r.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--red)', padding: '0 2px', opacity: 0.7 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Topics */}
        {memory.recentTopics.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>💬 Topics</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {memory.recentTopics.map((t, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(59,130,246,0.15)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => setInput(t)}>{t}</span>
                  <button onClick={() => removeTopic(t)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 10, padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Blob conversation storage */}
        {conversations.isAvailable && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>🗄️ Conversations</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-blue">{blobConvs.length}</span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                  title="Refresh"
                  onClick={() => conversations.listConversations().then(setBlobConvs).catch(() => {})}>
                  ↻
                </button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                  onClick={() => setBlobConvsExpanded(e => !e)}>
                  {blobConvsExpanded ? '▲' : '▼'}
                </button>
              </div>
            </div>

            {/* Storage gauge */}
            {conversations.storageInfo && (() => {
              const { totalBytes, limitBytes } = conversations.storageInfo
              const pct = Math.min(100, (totalBytes / limitBytes) * 100)
              const mb = (totalBytes / 1024 / 1024).toFixed(1)
              const limitMb = (limitBytes / 1024 / 1024).toFixed(0)
              const color = pct > 80 ? 'var(--red)' : pct > 60 ? '#f97316' : 'var(--blue)'
              return (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text2)', marginBottom: 3 }}>
                    <span>{mb} MB used</span>
                    <span>{limitMb} MB limit</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--bg3)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                  {pct > 80 && (
                    <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>
                      Storage {pct.toFixed(0)}% full — archive old conversations to free space
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Archive to Drive button */}
            {drive.isSignedIn && blobConvs.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={archiveToDrive}
                disabled={archiving}
                style={{ fontSize: 11, width: '100%', marginBottom: 8 }}
                title="Move all blob conversations to Google Drive and free up space"
              >
                {archiving ? '⏳ Archiving…' : `📦 Archive all ${blobConvs.length} to Drive`}
              </button>
            )}

            {blobConvsExpanded && (
              blobConvs.length === 0
                ? <p style={{ fontSize: 11, color: 'var(--text2)' }}>No conversations saved yet.</p>
                : blobConvs.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                    <span style={{ flex: 1, color: 'var(--text3)' }}>
                      {new Date(c.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span style={{ color: 'var(--text2)', fontSize: 10 }}>{(c.size / 1024).toFixed(0)} KB</span>
                    <button onClick={async () => {
                      await conversations.deleteConversations([c.id])
                      setBlobConvs(prev => prev.filter(x => x.id !== c.id))
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 13, opacity: 0.7, padding: '0 2px' }}>🗑</button>
                  </div>
                ))
            )}
          </div>
        )}

        {/* Drive history (shown when blob unavailable, or as archive reference) */}
        {drive.isSignedIn && !conversations.isAvailable && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: driveConvsExpanded ? 8 : 0 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>🗂️ Drive History</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge badge-blue">{driveConvs.length}</span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                  onClick={() => drive.listAllConversations().then(setDriveConvs).catch(() => {})}>↻</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                  onClick={() => setDriveConvsExpanded(e => !e)}>
                  {driveConvsExpanded ? '▲' : '▼'}
                </button>
              </div>
            </div>
            {driveConvsExpanded && (
              driveConvs.length === 0
                ? <p style={{ fontSize: 11, color: 'var(--text2)' }}>No conversations saved yet.</p>
                : driveConvs.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                    <span style={{ flex: 1, color: 'var(--text3)' }}>
                      {new Date(f.createdTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={async () => {
                      await drive.deleteConversation(f.id)
                      setDriveConvs(prev => prev.filter(c => c.id !== f.id))
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 13, opacity: 0.7, padding: '0 2px' }}>🗑</button>
                  </div>
                ))
            )}
          </div>
        )}

        {/* Gmail */}
        {settings.googleClientId && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>✉️ Gmail</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {gmail.isSignedIn && (
                  <>
                    <span className="badge badge-blue">{emails.filter(e => e.unread).length} unread</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={loadEmails} disabled={emailLoading} title="Refresh">
                      {emailLoading ? '⏳' : '↻'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => setEmailsExpanded(e => !e)}>
                      {emailsExpanded ? '▲' : '▼'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {!gmail.isSignedIn ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={gmail.signIn}
                disabled={gmail.signInStatus === 'signing-in'}
                style={{ width: '100%', fontSize: 12, justifyContent: 'center' }}
              >
                {gmail.signInStatus === 'signing-in' ? '⏳ Signing in…' : '🔑 Connect Gmail'}
              </button>
            ) : emailsExpanded && (
              emails.length === 0 && !emailLoading
                ? <p style={{ fontSize: 11, color: 'var(--text2)' }}>No recent emails.</p>
                : emails.map(e => (
                  <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {e.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0, display: 'inline-block' }} />}
                      <span style={{ fontWeight: e.unread ? 600 : 400, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {e.subject}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.from}
                    </div>
                    {e.snippet && (
                      <div style={{ color: 'var(--text2)', fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.snippet}
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        )}

        {/* Quick prompts */}
        <div className="card">
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>⚡ Quick Prompts</h4>
          {["What's my schedule today?", "Summarize my emails", "What should I focus on?", "Give me my daily brief"].map(p => (
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
