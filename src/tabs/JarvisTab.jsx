import { useState, useRef, useEffect, useCallback } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'
import { useGoogleDrive } from '../hooks/useGoogleDrive'
import { useConversations } from '../hooks/useConversations'
import { useGmail } from '../hooks/useGmail'
import { useMicrosoftMail } from '../hooks/useMicrosoftMail'
import { getPersistenceKey } from '../utils/persistence'

const OPENAI_PROVIDER = {
  name: 'OpenAI',
  badge: 'SERVER',
  badgeColor: '#10b981',
  modelKey: 'openaiModel',
  models: [
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini (Recommended)' },
    { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
    { id: 'gpt-4.1', label: 'gpt-4.1' },
    { id: 'gpt-4o', label: 'gpt-4o' },
  ],
}

const BLOB_ARCHIVE_THRESHOLD = 0.8
const BLOB_ARCHIVE_TARGET = 0.6
const EMAIL_RANGES = [
  { id: '7d', label: '7d', daysBack: 7 },
  { id: '30d', label: '30d', daysBack: 30 },
  { id: '90d', label: '90d', daysBack: 90 },
]

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

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

function buildChatContext() {
  return {
    calendarEvents: readJson('jarvis_calendar_events', []),
    emailSummary: readJson('jarvis_email_summary', []),
    weatherCache: readJson('jarvis_weather_cache', null),
    haSnapshot: readJson('jarvis_ha_snapshot', null),
    stocksCache: readJson('jarvis_stocks_cache', []),
  }
}

function matchesEmailQuery(email, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [email.subject, email.from, email.snippet]
    .filter(Boolean)
    .some(value => value.toLowerCase().includes(q))
}

function emailScopeLabel(email) {
  return email.accountScope || (email.accountType === 'gmail' || email.accountType === 'yahoo' ? 'personal' : 'work')
}

function buildEmailSearchPrompt(query, matches, rangeLabel) {
  const personal = matches.filter(email => emailScopeLabel(email) === 'personal')
  const work = matches.filter(email => emailScopeLabel(email) === 'work')
  const formatLine = (email) => `- [${email.accountType || 'mail'}] ${email.subject} — ${email.from}${email.date ? ` (${new Date(email.date).toLocaleDateString()})` : ''}`

  let prompt = `Search my email for "${query}" and summarize what matters. Distinguish clearly between personal and work accounts.\n\n`
  prompt += `Search window: last ${rangeLabel}.\n`

  if (personal.length) {
    prompt += `\nPersonal email matches:\n${personal.map(formatLine).join('\n')}\n`
  }
  if (work.length) {
    prompt += `\nWork email matches:\n${work.map(formatLine).join('\n')}\n`
  }

  return prompt.trim()
}

// ── Component ──────────────────────────────────────────────────
export default function JarvisTab() {
  const { settings, updateSetting } = useSettings()
  const { memory, addFact, editFact, removeFact, removeRoutine, addTopic, removeTopic, extractMemory } = useMemory()
  const cfg = OPENAI_PROVIDER

  const drive = useGoogleDrive(settings.googleClientId || null)
  const conversations = useConversations()
  const gmail = useGmail(settings.googleClientId || null)
  const outlook = useMicrosoftMail(settings.microsoftClientId || null)

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
  const [factsExpanded, setFactsExpanded] = useState(false)
  const [routinesExpanded, setRoutinesExpanded] = useState(false)
  const [driveConvsExpanded, setDriveConvsExpanded] = useState(false)
  const [blobConvsExpanded, setBlobConvsExpanded] = useState(false)
  const [blobConvs, setBlobConvs] = useState([])
  const [archiving, setArchiving] = useState(false)
  const [autoArchiving, setAutoArchiving] = useState(false)
  const [editingFactId, setEditingFactId] = useState(null)
  const [editingFactText, setEditingFactText] = useState('')
  const [driveConvs, setDriveConvs] = useState([])
  const [emails, setEmails] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jarvis_email_summary') || '[]') } catch { return [] }
  })
  const [emailsExpanded, setEmailsExpanded] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [yahooStatus, setYahooStatus] = useState('idle')
  const [emailRange, setEmailRange] = useState('30d')
  const [emailSearchQuery, setEmailSearchQuery] = useState('')
  const [emailSearchLoading, setEmailSearchLoading] = useState(false)
  const [emailSearchStatus, setEmailSearchStatus] = useState('')
  const [ttsEnabled, setTtsEnabled] = useState(settings.ttsEnabled || false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const messagesEnd = useRef(null)
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

      // ── Drive fallback when blob history is unavailable ──
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
      drive.saveConversation(convIdRef.current, msgs)
        .then(() => { setDriveStatus('✓ Saved'); setTimeout(() => setDriveStatus(''), 2500) })
        .catch(e => { setDriveStatus('⚠️ ' + (e.message || 'Save failed')); setTimeout(() => setDriveStatus(''), 6000) })
    }
  }, [conversations.isAvailable, conversations.saveConversation, drive.isSignedIn, drive.saveConversation])

  // Archive all blob conversations to Drive, then delete from blob
  const archiveToDrive = useCallback(async () => {
    if (!drive.isSignedIn || !conversations.isAvailable) return
    setArchiving(true)
    try {
      const convList = await conversations.listConversations()
      for (const meta of convList) {
        const data = await conversations.getConversation(meta.id).catch(() => null)
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

  const archiveOverflowToDrive = useCallback(async () => {
    if (!drive.isSignedIn || !conversations.isAvailable || autoArchiving) return

    const storage = conversations.storageInfo
    if (!storage?.limitBytes || !storage?.totalBytes) return

    const usageRatio = storage.totalBytes / storage.limitBytes
    if (usageRatio < BLOB_ARCHIVE_THRESHOLD) return

    setAutoArchiving(true)
    setSaveStatus('Storage cap reached. Archiving older conversations…')

    try {
      const convList = await conversations.listConversations()
      if (convList.length <= 1) return

      const sortedOldestFirst = [...convList].sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))
      const newestId = convList[0]?.id
      let bytesToFree = storage.totalBytes - storage.limitBytes * BLOB_ARCHIVE_TARGET
      const idsToArchive = []

      for (const conv of sortedOldestFirst) {
        if (conv.id === newestId) continue
        idsToArchive.push(conv.id)
        bytesToFree -= conv.size || 0
        if (bytesToFree <= 0) break
      }

      if (!idsToArchive.length) return

      for (const id of idsToArchive) {
        const data = await conversations.getConversation(id).catch(() => null)
        if (data?.messages) {
          await drive.saveConversation(id, data.messages)
        }
      }

      await conversations.deleteConversations(idsToArchive)
      const refreshed = await conversations.listConversations()
      setBlobConvs(refreshed)
      setSaveStatus(`✓ Archived ${idsToArchive.length} older conversation${idsToArchive.length === 1 ? '' : 's'} to Drive`)
      setTimeout(() => setSaveStatus(''), 5000)
    } catch (e) {
      setSaveStatus('⚠️ Auto-archive failed: ' + e.message)
      setTimeout(() => setSaveStatus(''), 7000)
    } finally {
      setAutoArchiving(false)
    }
  }, [autoArchiving, conversations, drive.isSignedIn, drive.saveConversation])

  useEffect(() => {
    if (!drive.isSignedIn || !conversations.isAvailable || autoArchiving || archiving) return
    archiveOverflowToDrive()
  }, [archiveOverflowToDrive, archiving, autoArchiving, conversations.isAvailable, conversations.storageInfo, drive.isSignedIn])

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
    const emailLines = emails.slice(0, 8).map(e => `- ${e.unread ? '[UNREAD] ' : ''}${e.subject} from ${e.from}`).join('\n')
    let prompt = `Give me my morning briefing for ${todayStr}. Be concise and conversational.`
    if (calEvents) prompt += `\n\nToday's events:\n${calEvents}`
    if (emailLines) prompt += `\n\nRecent emails:\n${emailLines}`
    setInput(prompt)
  }

  const fetchEmailProviders = useCallback(async ({ maxResults = 100, daysBack = 30 } = {}) => {
    const fetchOptions = { maxResults, daysBack, unreadOnly: false }
    const providers = []

      if (gmail.isSignedIn) {
        providers.push(
          gmail.fetchEmails(fetchOptions).then(items => items.map(item => ({ ...item, accountType: 'gmail', accountScope: 'personal' })))
        )
      }

      if (outlook.isSignedIn) {
        providers.push(
          outlook.fetchEmails(fetchOptions).then(items => items.map(item => ({ ...item, accountType: 'outlook', accountScope: 'work' })))
        )
      }

    if (settings.outlookEmail && settings.outlookPassword) {
      providers.push(
        fetch('/api/email-imap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: 'outlook.office365.com',
            port: 993,
            secure: true,
            username: settings.outlookEmail,
            password: settings.outlookPassword,
            maxResults,
            daysBack,
            unreadOnly: false,
          }),
        })
            .then(async res => {
              const data = await res.json()
              if (!res.ok) throw new Error(data.error || 'Outlook IMAP fetch failed')
              return (data.emails || []).map(item => ({ ...item, accountType: 'outlook-work', accountScope: 'work' }))
            })
        )
      }

    if (settings.yahooEmail && settings.yahooAppPassword) {
      setYahooStatus('loading')
      providers.push(
        fetch('/api/email-imap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host: 'imap.mail.yahoo.com',
            port: 993,
            secure: true,
            username: settings.yahooEmail,
            password: settings.yahooAppPassword,
            maxResults,
            daysBack,
            unreadOnly: false,
          }),
        })
            .then(async res => {
              const data = await res.json()
              if (!res.ok) throw new Error(data.error || 'Yahoo fetch failed')
              return (data.emails || []).map(item => ({ ...item, accountType: 'yahoo', accountScope: 'personal' }))
            })
            .finally(() => setYahooStatus('idle'))
        )
    }

    return (await Promise.allSettled(providers))
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [gmail.isSignedIn, gmail.fetchEmails, outlook.isSignedIn, outlook.fetchEmails, settings.outlookEmail, settings.outlookPassword, settings.yahooEmail, settings.yahooAppPassword])

  // ── Email fetch ──
  const loadEmails = useCallback(async () => {
    setEmailLoading(true)
    try {
      const selectedRange = EMAIL_RANGES.find(range => range.id === emailRange) || EMAIL_RANGES[1]
      const fetched = await fetchEmailProviders({ maxResults: 100, daysBack: selectedRange.daysBack })
      setEmails(fetched)
      localStorage.setItem('jarvis_email_summary', JSON.stringify(fetched))
      window.dispatchEvent(new CustomEvent('jarvis:email-updated'))
    } catch (e) {
      console.error('Email fetch failed:', e)
    } finally {
      setEmailLoading(false)
    }
  }, [emailRange, fetchEmailProviders])

  const searchEmailsAndPrompt = useCallback(async () => {
    const query = emailSearchQuery.trim()
    if (!query) return

    setEmailSearchLoading(true)
    setEmailSearchStatus('')
    try {
      const selectedRange = EMAIL_RANGES.find(range => range.id === emailRange) || EMAIL_RANGES[1]
      const fetched = await fetchEmailProviders({ maxResults: 100, daysBack: selectedRange.daysBack })
      const matches = fetched.filter(email => matchesEmailQuery(email, query)).slice(0, 15)

      if (!matches.length) {
        setEmailSearchStatus(`No matches found for "${query}" in the last ${selectedRange.label}.`)
        return
      }

      setInput(buildEmailSearchPrompt(query, matches, selectedRange.label))
      setEmails(matches)
      localStorage.setItem('jarvis_email_summary', JSON.stringify(matches))
      window.dispatchEvent(new CustomEvent('jarvis:email-updated'))
      setEmailSearchStatus(`Loaded ${matches.length} matching email${matches.length === 1 ? '' : 's'} into the prompt.`)
    } catch (e) {
      setEmailSearchStatus(`Email search failed: ${e.message}`)
    } finally {
      setEmailSearchLoading(false)
    }
  }, [emailRange, emailSearchQuery, fetchEmailProviders])

  // Auto-load emails on sign-in
  useEffect(() => {
    if ((gmail.isSignedIn || outlook.isSignedIn || (settings.outlookEmail && settings.outlookPassword) || (settings.yahooEmail && settings.yahooAppPassword)) && !emails.length) loadEmails()
  }, [gmail.isSignedIn, outlook.isSignedIn, settings.outlookEmail, settings.outlookPassword, settings.yahooEmail, settings.yahooAppPassword])

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
      const apiMessages = [
        ...priorMessagesRef.current,
        ...nextMessages
          .filter(m => m.id !== 'welcome')
          .map(m => ({ role: m.role, content: m.content })),
      ]
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: getPersistenceKey(),
          messages: apiMessages,
          settings,
          memory: JSON.parse(localStorage.getItem('jarvis_memory') || 'null') || memory,
          context: buildChatContext(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chat failed')
      const reply = data.reply

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

  const modelLabel = settings[cfg.modelKey] || cfg.models[0]?.id

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
              {`Using ${modelLabel} through /api/chat`}
            </div>
          </div>

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
                disabled={archiving || autoArchiving}
                style={{ fontSize: 11, width: '100%', marginBottom: 8 }}
                title="Move all blob conversations to Google Drive and free up space"
              >
                {archiving || autoArchiving ? '⏳ Archiving…' : `📦 Archive all ${blobConvs.length} to Drive`}
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

        {/* Email */}
        {(settings.googleClientId || settings.microsoftClientId || settings.outlookEmail || settings.yahooEmail) && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>✉️ Email</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {(gmail.isSignedIn || outlook.isSignedIn || settings.outlookEmail || settings.yahooEmail) && (
                  <>
                    <span className="badge badge-blue">{emails.length} synced</span>
                    <span style={{ fontSize: 10, color: 'var(--text2)' }}>{emails.filter(e => e.unread).length} unread</span>
                    <select
                      className="input"
                      value={emailRange}
                      onChange={e => setEmailRange(e.target.value)}
                      style={{ width: 'auto', fontSize: 10, padding: '2px 6px', height: 24 }}
                      title="How far back to sync"
                    >
                      {EMAIL_RANGES.map(range => (
                        <option key={range.id} value={range.id}>{range.label}</option>
                      ))}
                    </select>
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

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                className="input"
                value={emailSearchQuery}
                onChange={e => setEmailSearchQuery(e.target.value)}
                placeholder="Search emails by sender, subject, keyword..."
                style={{ fontSize: 12, flex: 1 }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    searchEmailsAndPrompt()
                  }
                }}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={searchEmailsAndPrompt}
                disabled={emailSearchLoading || !emailSearchQuery.trim()}
                style={{ fontSize: 12 }}
                title="Search and add results to a JARVIS prompt"
              >
                {emailSearchLoading ? '⏳' : 'Ask'}
              </button>
            </div>
            {emailSearchStatus && (
              <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 10 }}>
                {emailSearchStatus}
              </div>
            )}

            <div style={{ display: 'grid', gap: 8, marginBottom: emailsExpanded ? 12 : 0 }}>
              {settings.googleClientId && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={gmail.isSignedIn ? gmail.signOut : gmail.signIn}
                  disabled={gmail.signInStatus === 'signing-in'}
                  style={{ width: '100%', fontSize: 12, justifyContent: 'center' }}
                >
                  {gmail.signInStatus === 'signing-in' ? '⏳ Signing in to Gmail…' : gmail.isSignedIn ? '🔓 Disconnect Gmail' : '🔑 Connect Gmail'}
                </button>
              )}

              {settings.outlookEmail && settings.outlookPassword && (
                <div style={{ fontSize: 11, color: 'var(--text2)', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
                  🏢 Outlook IMAP ready: {settings.outlookEmail}
                </div>
              )}

              {settings.microsoftClientId && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={outlook.isSignedIn ? outlook.signOut : outlook.signIn}
                  disabled={outlook.signInStatus === 'signing-in'}
                  style={{ width: '100%', fontSize: 12, justifyContent: 'center' }}
                >
                  {outlook.signInStatus === 'signing-in' ? '⏳ Signing in to Outlook…' : outlook.isSignedIn ? '🔓 Disconnect Outlook' : '🏢 Connect Outlook'}
                </button>
              )}

              {settings.yahooEmail && settings.yahooAppPassword && (
                <div style={{ fontSize: 11, color: 'var(--text2)', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 8 }}>
                  {yahooStatus === 'loading' ? '⏳ Fetching Yahoo Mail…' : `📨 Yahoo ready: ${settings.yahooEmail}`}
                </div>
              )}
            </div>

            {emailsExpanded && (
              emails.length === 0 && !emailLoading
                ? <p style={{ fontSize: 11, color: 'var(--text2)' }}>No recent emails.</p>
                : emails.map(e => (
                  <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {e.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0, display: 'inline-block' }} />}
                      <span style={{ fontSize: 10, color: 'var(--text2)', minWidth: 86, textTransform: 'uppercase' }}>{emailScopeLabel(e)} · {e.accountType || 'mail'}</span>
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
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 8 }}>
              Syncs up to 100 emails per account for the selected window, including both read and unread mail. Pick a longer range and refresh if you want JARVIS to dig further back.
            </div>
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
