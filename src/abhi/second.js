const DEFAULT_TOPIC = (process.env.ARBITRAGE_TOPIC || 'election').toLowerCase()
const POLY_BASE_URL = process.env.POLY_BASE_URL || 'https://gamma-api.polymarket.com/markets'
const POLY_LIMIT = Number(process.env.POLY_LIMIT || 1000)

async function fetchPolyMarkets(topic = DEFAULT_TOPIC) {
  const url = new URL(POLY_BASE_URL)
  url.searchParams.set('active', 'true')
  url.searchParams.set('closed', 'false')
  url.searchParams.set('limit', String(POLY_LIMIT))

  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Polymarket API error ${response.status}`)
  }

  const markets = await response.json()
  const normalizedTopic = String(topic || '').toLowerCase().trim()
  if (!normalizedTopic) {
    return []
  }

  return markets.filter(market => {
    const question = String(market.question || '').toLowerCase()
    if (!question.includes(normalizedTopic)) {
      return false
    }

    const hasTwoOutcomes = market.outcomes && market.outcomePrices
    return Boolean(hasTwoOutcomes)
  })
}

module.exports = { fetchPolyMarkets }
