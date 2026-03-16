const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Yahoo Finance requires a session cookie + crumb for API calls.
// We obtain both with two cheap requests before fetching quotes.
let crumbCache = null  // { crumb, cookie, expiresAt }

async function getCrumb() {
  if (crumbCache && crumbCache.expiresAt > Date.now()) return crumbCache

  // Step 1 — get session cookies from the consent/main page
  const pageRes = await fetch('https://finance.yahoo.com/', {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow',
  })
  const rawCookies = pageRes.headers.getSetCookie?.() ?? []
  const cookie = rawCookies.map(c => c.split(';')[0]).join('; ')

  // Step 2 — exchange cookie for a crumb token
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  })
  if (!crumbRes.ok) throw new Error(`Crumb fetch failed: ${crumbRes.status}`)
  const crumb = (await crumbRes.text()).trim()
  if (!crumb || crumb.includes('<')) throw new Error('Invalid crumb received')

  crumbCache = { crumb, cookie, expiresAt: Date.now() + 55 * 60 * 1000 } // 55 min TTL
  return crumbCache
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' })

  try {
    const { crumb, cookie } = await getCrumb()

    const url =
      `https://query2.finance.yahoo.com/v7/finance/quote` +
      `?symbols=${encodeURIComponent(symbols)}&crumb=${encodeURIComponent(crumb)}`

    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Cookie: cookie, Accept: 'application/json' },
    })

    if (!r.ok) {
      // Crumb may have expired server-side; clear cache and surface the error
      crumbCache = null
      throw new Error(`Yahoo Finance returned ${r.status}`)
    }

    const data = await r.json()
    const quotes = (data.quoteResponse?.result || []).map(q => ({
      symbol: q.symbol,
      name: q.shortName || q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
    }))
    res.json({ quotes })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
