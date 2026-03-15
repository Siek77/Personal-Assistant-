// JARVIS Voice API — receives speech text from Alexa Lambda, returns spoken reply
// Called server-side so secrets never touch the browser
//
// Required Vercel env vars:
//   GROQ_API_KEY   — from console.groq.com
//   VOICE_SECRET   — any random string, must match Lambda env var
//   HA_URL         — e.g. http://homeassistant.local:8123 or your Nabu Casa URL
//   HA_TOKEN       — Home Assistant long-lived access token
//   USER_NAME      — your first name (e.g. "Tony")
//   USER_FACTS     — comma-separated facts JARVIS should know (e.g. "works from home, has 2 cats")

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──
  const secret = process.env.VOICE_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' })
  }

  const { text, sessionHistory = [] } = req.body || {}
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' })

  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' })

  const haUrl = (process.env.HA_URL || '').replace(/\/$/, '')
  const haToken = process.env.HA_TOKEN
  const haEnabled = !!(haUrl && haToken)

  const userName = process.env.USER_NAME || 'Boss'
  const userFacts = (process.env.USER_FACTS || '')
    .split(',').map(f => f.trim()).filter(Boolean)
    .map(f => `- ${f}`).join('\n')

  // ── Fetch live HA entity states ──
  let entitySummary = ''
  if (haEnabled) {
    try {
      const r = await fetch(`${haUrl}/api/states`, {
        headers: { Authorization: `Bearer ${haToken}` },
      })
      if (r.ok) {
        const states = await r.json()
        const DOMAINS = ['light', 'switch', 'climate', 'media_player', 'sensor', 'binary_sensor', 'lock', 'cover', 'fan', 'input_boolean']
        const lines = states
          .filter(e => DOMAINS.some(d => e.entity_id.startsWith(d + '.')))
          .slice(0, 60)
          .map(e => {
            const name = e.attributes?.friendly_name
            const extra = e.attributes?.temperature || e.attributes?.current_temperature
            return `${e.entity_id}: ${e.state}${name ? ` (${name})` : ''}${extra ? ` [${extra}°]` : ''}`
          })
        if (lines.length) entitySummary = `\nCurrent home state:\n${lines.join('\n')}`
      }
    } catch { /* HA unreachable, continue without */ }
  }

  // ── System prompt (voice-optimised — no markdown) ──
  const systemPrompt = [
    `You are JARVIS, a highly intelligent personal assistant. Address the user as "${userName}".`,
    userFacts ? `What you know about ${userName}:\n${userFacts}` : '',
    entitySummary,
    `
STRICT voice rules — you are speaking through Amazon Alexa:
- Maximum 2 sentences. Never use lists, markdown, bullet points, or special characters.
- Confirm actions concisely (e.g. "Done, living room lights at 50 percent.").
- Use natural spoken language. Spell out symbols (say "percent" not "%", "degrees" not "°").
- If you don't know something, say so in one sentence.`,
  ].filter(Boolean).join('\n')

  // ── Groq function-calling tools (only if HA is configured) ──
  const tools = haEnabled ? [
    {
      type: 'function',
      function: {
        name: 'control_home',
        description: 'Control any Home Assistant entity — lights, switches, climate, locks, covers, media players, fans.',
        parameters: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'HA domain: light, switch, climate, media_player, cover, lock, fan, input_boolean',
            },
            service: {
              type: 'string',
              description: 'HA service: turn_on, turn_off, toggle, set_temperature, media_play, media_pause, lock, unlock, open_cover, close_cover',
            },
            entity_id: {
              type: 'string',
              description: 'Full entity ID e.g. light.living_room, switch.bedroom_fan',
            },
            service_data: {
              type: 'object',
              description: 'Optional extra params e.g. { "brightness_pct": 50, "temperature": 72, "color_temp": 300 }',
            },
          },
          required: ['domain', 'service'],
        },
      },
    },
  ] : []

  // Build message history (cap at last 6 to stay within Groq token limits)
  const messages = [
    ...sessionHistory.slice(-6),
    { role: 'user', content: text.trim() },
  ]

  try {
    // ── First Groq call ──
    const groqBody = {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 200,
      temperature: 0.7,
      ...(tools.length && { tools, tool_choice: 'auto' }),
    }

    const r1 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify(groqBody),
    })
    if (!r1.ok) {
      const e = await r1.json()
      throw new Error(e.error?.message || `Groq error ${r1.status}`)
    }
    const d1 = await r1.json()
    const assistantMsg = d1.choices[0].message
    const actions = []

    // ── Handle tool calls → execute HA services ──
    if (assistantMsg.tool_calls?.length) {
      const toolResultMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
        assistantMsg,
      ]

      for (const tc of assistantMsg.tool_calls) {
        if (tc.function.name !== 'control_home') continue
        let args
        try { args = JSON.parse(tc.function.arguments) } catch { continue }

        const { domain, service, entity_id, service_data = {} } = args
        let result = 'done'

        try {
          const haRes = await fetch(`${haUrl}/api/services/${domain}/${service}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${haToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ entity_id, ...service_data }),
          })
          result = haRes.ok ? 'done' : `error ${haRes.status}`
        } catch (e) {
          result = `error: ${e.message}`
        }

        actions.push({ domain, service, entity_id, result })
        toolResultMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }

      // ── Second Groq call — get the spoken confirmation ──
      const r2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: toolResultMessages,
          max_tokens: 120,
          temperature: 0.7,
        }),
      })
      if (!r2.ok) {
        const e = await r2.json()
        throw new Error(e.error?.message || `Groq error ${r2.status}`)
      }
      const d2 = await r2.json()
      const reply = d2.choices[0].message.content || 'Done.'

      const newHistory = [
        ...messages,
        assistantMsg,
        ...toolResultMessages.slice(messages.length + 2), // tool results
        { role: 'assistant', content: reply },
      ]
      return res.status(200).json({ reply, actions, sessionHistory: newHistory.slice(-8) })
    }

    // ── Plain reply (no tool calls) ──
    const reply = assistantMsg.content || 'I did not catch that.'
    const newHistory = [...messages, { role: 'assistant', content: reply }]
    return res.status(200).json({ reply, actions, sessionHistory: newHistory.slice(-8) })

  } catch (err) {
    console.error('[voice] error:', err)
    return res.status(500).json({ error: err.message })
  }
}
