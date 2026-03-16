export default async function handler(req, res) {
  const apiKey = process.env.NEWSAPI_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'NEWSAPI_KEY not configured' })
  }

  try {
    const upstream = await fetch(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=8&apiKey=${apiKey}`
    )
    const data = await upstream.json()
    // Cache for 5 minutes at the CDN edge
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
