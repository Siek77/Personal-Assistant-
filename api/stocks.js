const UA = 'Mozilla/5.0 (compatible; StocksBot/1.0)'

// Map user-supplied symbols to Stooq format.
// US stocks → aapl.us  |  major crypto → btc.v  |  indices (^GSPC) → keep as-is lowercased
function toStooqSym(sym) {
  const s = sym.toUpperCase()
  if (s.startsWith('^')) return sym.toLowerCase()
  const cryptoBase = ['BTC','ETH','LTC','XRP','ADA','SOL','DOGE','AVAX','DOT','LINK','MATIC','BNB']
  const base = s.split(/[-/]/)[0]
  if (cryptoBase.includes(base)) return base.toLowerCase() + '.v'
  return sym.toLowerCase() + '.us'
}

// Stooq returns daily CSV:  Date,Open,High,Low,Close,Volume
async function fetchQuote(symbol) {
  const stooq = toStooqSym(symbol)
  const url   = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d`

  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain' },
    signal: AbortSignal.timeout(8_000),
  })
  if (!r.ok) throw new Error(`${symbol}: HTTP ${r.status}`)

  const text  = (await r.text()).trim()
  const lines = text.split('\n').filter(l => l.trim() && l !== 'No data')
  // lines[0] = header row
  if (lines.length < 3) throw new Error(`${symbol}: no data`)

  const parse = row => {
    const cols = row.trim().split(',')
    return { date: cols[0], open: parseFloat(cols[1]), close: parseFloat(cols[4]) }
  }

  const latest = parse(lines[lines.length - 1])
  const prev   = parse(lines[lines.length - 2])

  if (isNaN(latest.close)) throw new Error(`${symbol}: invalid data (N/D)`)

  const price         = latest.close
  const change        = price - prev.close
  const changePercent = prev.close ? (change / prev.close) * 100 : 0

  return { symbol, name: symbol, price, change, changePercent }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols query param required' })

  const list = symbols.split(',').map(s => s.trim()).filter(Boolean)

  const results = await Promise.allSettled(list.map(fetchQuote))

  const quotes = []
  const errors = []
  for (const r of results) {
    if (r.status === 'fulfilled') quotes.push(r.value)
    else errors.push(r.reason?.message || 'unknown error')
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
  res.json({ quotes, ...(errors.length ? { errors } : {}) })
}
