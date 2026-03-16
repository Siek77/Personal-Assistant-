export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { haUrl, path } = req.query
  if (!haUrl || !path) {
    return res.status(400).json({ error: 'haUrl and path are required' })
  }

  const target = `${haUrl.replace(/\/$/, '')}/${path}`

  const forwardHeaders = { 'Content-Type': 'application/json' }
  if (req.headers.authorization) forwardHeaders['Authorization'] = req.headers.authorization

  // CF Access service token: prefer headers forwarded from browser settings,
  // fall back to Vercel env vars (CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET)
  const cfId = req.headers['cf-access-client-id'] || process.env.CF_ACCESS_CLIENT_ID
  const cfSecret = req.headers['cf-access-client-secret'] || process.env.CF_ACCESS_CLIENT_SECRET
  if (cfId) forwardHeaders['CF-Access-Client-Id'] = cfId
  if (cfSecret) forwardHeaders['CF-Access-Client-Secret'] = cfSecret

  const isBodyMethod = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH'

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: forwardHeaders,
      body: isBodyMethod ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(10000),
    })

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return res.status(502).json({
        error: `Home Assistant returned a non-JSON response (HTTP ${upstream.status}). Check your HA URL, token, and Cloudflare Access credentials.`,
      })
    }
    const data = await upstream.json()
    return res.status(upstream.status).json(data)
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed', detail: err.message })
  }
}
