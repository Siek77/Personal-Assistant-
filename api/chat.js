import { del, list, put } from '@vercel/blob'

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_PAYLOAD_BYTES = 512 * 1024

function isValidClientId(clientId) {
  return typeof clientId === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(clientId)
}

function formatUpcomingEvents(events = []) {
  const now = new Date()
  const cutoff = new Date(now.getTime() + 7 * 86400000)
  return events
    .filter(event => event.start && new Date(event.start) >= now && new Date(event.start) <= cutoff)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 10)
    .map(event => {
      const date = new Date(event.start)
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const timeStr = event.allDay ? 'all day' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      return `- ${dateStr} ${timeStr}: ${event.title}${event.location ? ` @ ${event.location}` : ''}`
    })
    .join('\n')
}

function buildSystemPrompt(settings = {}, memory = {}, context = {}) {
  const name = settings.userName || 'User'
  const now = new Date()
  const facts = (memory.facts || []).map(fact => `- ${fact.text}`).join('\n') || '(nothing yet)'
  const routines = (memory.routines || []).map(routine => `- ${routine.description || routine.text || 'Unnamed routine'}`).join('\n') || '(none noted yet)'
  const topics = (memory.recentTopics || []).join(', ') || 'none yet'
  const emailSummary = (context.emailSummary || [])
    .slice(0, 20)
    .map(email => `- ${email.unread ? '[UNREAD] ' : ''}${email.subject} — from ${email.from}`)
    .join('\n')
  const calendarSummary = formatUpcomingEvents(context.calendarEvents || [])
  const weather = context.weatherCache
  const ha = context.haSnapshot
  const stocks = context.stocksCache || []

  const liveContext = []
  if (weather?.temp != null && weather?.desc) {
    liveContext.push(`Current weather: ${weather.temp}°F, ${weather.desc}.${weather.rainChance > 30 ? ` Rain chance today: ${weather.rainChance}%.` : ' No significant rain expected.'}`)
  }
  if (ha?.lastUpdated) {
    const ageMinutes = (Date.now() - new Date(ha.lastUpdated).getTime()) / 60000
    if (ageMinutes <= 30) {
      const parts = [`${ha.lightsOn || 0} light${ha.lightsOn === 1 ? '' : 's'} on`]
      if (ha.temperature != null) parts.push(`thermostat at ${ha.temperature}°`)
      liveContext.push(`Smart home: ${parts.join(', ')}.`)
    }
  }
  if (stocks.length) {
    liveContext.push(`Portfolio today: ${stocks.map(stock => `${stock.symbol} ${(stock.changePercent || 0) >= 0 ? '+' : ''}${stock.changePercent?.toFixed?.(1) ?? stock.changePercent}%`).join(', ')}.`)
  }

  return `You are JARVIS, a highly intelligent personalized AI assistant. You are helpful, witty, precise, and proactive. Address the user as "${name}". Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

What you know about ${name}:
${facts}

Known routines:
${routines}

Recent interests: ${topics}
${calendarSummary ? `\nUpcoming calendar events:\n${calendarSummary}` : ''}
${emailSummary ? `\nRecent synced emails:\n${emailSummary}` : ''}
${liveContext.length ? `\nLive context:\n- ${liveContext.join('\n- ')}` : ''}

Guidelines:
- Be concise but thorough. Match the user's energy.
- Proactively surface relevant info based on what you know.
- Use a slightly formal but warm tone.
- Reference previous context when relevant.
- Format with markdown when it helps.`
}

async function persistState(clientId, payload) {
  const blobPath = `jarvis-state/${clientId}.json`
  const { blobs: existing } = await list({ prefix: blobPath })
  if (existing.length) await del(existing.map(blob => blob.url))

  const savedAt = new Date().toISOString()
  await put(blobPath, JSON.stringify({ ...payload, savedAt }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
  })

  return savedAt
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' })

  const body = req.body || {}
  if (JSON.stringify(body).length > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({ error: 'Payload too large' })
  }

  const { clientId, messages = [], settings = {}, memory = {}, context = {} } = body
  if (!isValidClientId(clientId)) return res.status(400).json({ error: 'Invalid clientId' })
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages[] required' })

  try {
    const model = settings.openaiModel || DEFAULT_MODEL
    const systemPrompt = buildSystemPrompt(settings, memory, context)
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || `OpenAI error ${response.status}` })
    }

    const reply = data.choices?.[0]?.message?.content
    if (!reply) {
      return res.status(500).json({ error: 'OpenAI returned an empty response.' })
    }

    const savedAt = await persistState(clientId, {
      settings,
      memory,
      recentConv: messages.slice(-20),
      ...context,
    })

    return res.status(200).json({ reply, model, savedAt })
  } catch (error) {
    console.error('[chat] error:', error)
    return res.status(500).json({ error: error.message || 'Chat request failed' })
  }
}
