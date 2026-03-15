// Uptime monitor — parallel-checks a list of URLs and returns status + latency
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { urls } = req.body || {}
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' })
  }

  const results = await Promise.all(
    urls.slice(0, 20).map(async ({ label, url }) => {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const r = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
        })
        clearTimeout(timeout)
        return { label, url, status: 'up', latency: Date.now() - start, statusCode: r.status }
      } catch (err) {
        return { label, url, status: 'down', latency: Date.now() - start, error: err.name === 'AbortError' ? 'timeout' : err.message }
      }
    })
  )

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ results, checkedAt: new Date().toISOString() })
}
