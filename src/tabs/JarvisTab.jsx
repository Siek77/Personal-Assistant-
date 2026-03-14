import { useState, useRef, useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useMemory } from '../context/MemoryContext'

function buildSystemPrompt(settings, memory) {
  const name = settings.userName || 'User'
  const facts = memory.facts.map(f => `- ${f.text}`).join('\n')
  const routines = memory.routines.map(r => `- ${r.description}`).join('\n')
  const topics = memory.recentTopics.join(', ')

  return `You are JARVIS, a highly intelligent, personalized AI assistant — like Tony Stark's JARVIS. You are helpful, witty, precise, and proactive. You address the user as "${name}".

You have learned the following about ${name}:
${facts || '(nothing yet — learn as you go)'}

Known routines:
${routines || '(none noted yet)'}

Recent topics of interest: ${topics || 'none yet'}

Guidelines:
- Be concise but thorough. Don't be verbose unless asked.
- Proactively suggest things based on what you know about ${name}.
- When you learn something new about ${name} from the conversation, remember it.
- Use a slightly formal but warm tone — like a sophisticated AI assistant, not a generic chatbot.
- If relevant, reference their previous interests or routines.
- Format responses with markdown when helpful (lists, code blocks, etc).
- You have access to context about their ESP32 devices, Spotify, and other services through this app.`
}

export default function JarvisTab() {
  const { settings } = useSettings()
  const { memory, addFact, addTopic, extractMemory } = useMemory()
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Systems online. Welcome back${settings.userName ? ', ' + settings.userName : ''}. How can I assist you today?`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const messagesEnd = useRef(null)
  const textareaRef = useRef(null)
  const [newFact, setNewFact] = useState('')

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    if (!settings.claudeApiKey) {
      setError('No Claude API key set. Go to Settings → API Keys.')
      return
    }

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setError(null)
    setLoading(true)

    // Extract memory hints from user message
    extractMemory(input.trim(), '')

    try {
      const systemPrompt = buildSystemPrompt(settings, memory)
      const apiMessages = messages
        .filter(m => m.id !== 'welcome')
        .concat(userMsg)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.claudeApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: apiMessages,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || `API error ${res.status}`)
      }

      const data = await res.json()
      const reply = data.content?.[0]?.text || ''

      const aiMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: reply,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages(prev => [...prev, aiMsg])

      // Auto-extract topics
      const words = input.split(' ').filter(w => w.length > 4)
      if (words.length > 0) addTopic(words.slice(0, 3).join(' '))

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Chat cleared. Systems ready, ${settings.userName || 'User'}.`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }])
  }

  return (
    <div className="jarvis-layout" style={{ height: 'calc(100vh - var(--header) - 40px)' }}>
      {/* Chat Panel */}
      <div className="chat-panel">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div className="jarvis-orb">🤖</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>JARVIS</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
              Just A Rather Very Intelligent System
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={clearChat}>Clear</button>
          </div>
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
                <div className="bubble-time">{msg.time}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-bubble">
              <div className="bubble-avatar ai">🤖</div>
              <div className="bubble-body">
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 13, color: 'var(--red)' }}>
              ⚠️ {error}
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={textareaRef}
            className="input"
            style={{ minHeight: 48, maxHeight: 120 }}
            placeholder="Ask JARVIS anything... (Enter to send, Shift+Enter for new line)"
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
            {loading ? '...' : '↑'}
          </button>
        </div>
      </div>

      {/* Memory / Context Panel */}
      <div className="memory-panel">
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              🧠 Memory
            </h4>
            <span className="badge badge-blue">{memory.facts.length}</span>
          </div>
          {memory.facts.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
              JARVIS will remember things you tell it as you chat.
            </p>
          ) : (
            memory.facts.slice(0, 6).map(f => (
              <div key={f.id} className="memory-item">
                <span className="mem-icon">{f.category === 'preference' ? '❤️' : '📌'}</span>
                <span className="mem-text">{f.text.length > 80 ? f.text.slice(0, 80) + '…' : f.text}</span>
              </div>
            ))
          )}
        </div>

        {/* Manual fact input */}
        <div className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            📝 Tell JARVIS About You
          </h4>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              style={{ fontSize: 12 }}
              placeholder="e.g. I wake up at 7am"
              value={newFact}
              onChange={e => setNewFact(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newFact.trim()) {
                  addFact(newFact.trim(), 'manual')
                  setNewFact('')
                }
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { if (newFact.trim()) { addFact(newFact.trim(), 'manual'); setNewFact('') } }}
            >+</button>
          </div>
        </div>

        {/* Routines */}
        {memory.routines.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              🔄 Routines
            </h4>
            {memory.routines.slice(0, 4).map(r => (
              <div key={r.id} className="memory-item">
                <span className="mem-icon">📅</span>
                <span className="mem-text">{r.description.length > 70 ? r.description.slice(0, 70) + '…' : r.description}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recent topics */}
        {memory.recentTopics.length > 0 && (
          <div className="card">
            <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              💬 Recent Topics
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {memory.recentTopics.map((t, i) => (
                <span key={i} className="badge badge-blue" style={{ cursor: 'pointer' }} onClick={() => setInput(t)}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quick prompts */}
        <div className="card">
          <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            ⚡ Quick Prompts
          </h4>
          {[
            "What's my schedule today?",
            "Summarize my routine for me",
            "What should I focus on?",
            "Any suggestions for tonight?",
          ].map(p => (
            <div
              key={p}
              className="memory-item"
              style={{ cursor: 'pointer' }}
              onClick={() => setInput(p)}
            >
              <span className="mem-icon">→</span>
              <span className="mem-text">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
