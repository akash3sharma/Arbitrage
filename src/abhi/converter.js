const KALSHI_FEE = Number(process.env.KALSHI_FEE || 0.02)
const POLY_FEE = Number(process.env.POLYMARKET_FEE || 0.03)
const STOPWORDS = new Set([
  'a', 'an', 'the', 'will', 'is', 'are', 'be', 'to', 'of', 'for', 'on', 'at', 'by',
  'who', 'what', 'when', 'where', 'why', 'how', 'next', 'win', 'wins', 'winning',
  'presidential', 'election', 'elections', 'general', 'occur', 'before', 'after',
  'party', 'parties', 'under', 'over'
])

function normalizeMarketId(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = normalized.split(' ').filter(token => {
    const isNumeric = /^[0-9]+$/.test(token)
    const keepShortToken = token === 'jr' || token === 'sr'
    const isLongEnough = token.length > 2
    return (isLongEnough || isNumeric || keepShortToken) && !STOPWORDS.has(token)
  })
  const unique = [...new Set(tokens)]
  return unique.slice(0, 18).join('-') || 'unknown-market'
}

function parsePrice(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return null
  }
  if (num < 0 || num > 1) {
    return null
  }
  return Number(num.toFixed(4))
}

function getFirstValidPrice(...candidates) {
  for (const candidate of candidates) {
    const parsed = parsePrice(candidate)
    if (parsed !== null) {
      return parsed
    }
  }
  return null
}

function parseTimeMs(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    const ms = Date.parse(candidate)
    if (Number.isFinite(ms)) {
      return ms
    }
  }
  return null
}

function convertKalshi(markets) {
  return markets
    .map(market => {
      const yesPrice = getFirstValidPrice(
        market.yes_ask_dollars,
        market.yes_bid_dollars,
        market.last_price_dollars
      )
      const noPrice = getFirstValidPrice(
        market.no_ask_dollars,
        market.no_bid_dollars,
        yesPrice !== null ? (1 - yesPrice).toFixed(4) : null
      )

      if (yesPrice === null || noPrice === null) {
        return null
      }

      const displayTitle = market.title || market.ticker || ''
      const yesHint = market.yes_sub_title && market.yes_sub_title.toLowerCase() !== 'yes'
        ? market.yes_sub_title
        : ''
      const matchingText = `${displayTitle} ${yesHint}`.trim()
      const expiryTimeMs = parseTimeMs(
        market.close_time,
        market.expected_expiration_time,
        market.expiration_time,
        market.latest_expiration_time
      )
      return {
        platform: 'A',
        platformName: 'KALSHI',
        exchangeMarketId: market.ticker,
        marketTitle: displayTitle,
        marketId: normalizeMarketId(matchingText),
        yesPrice,
        noPrice,
        fees: KALSHI_FEE,
        expiryTimeMs,
        expiryAt: expiryTimeMs ? new Date(expiryTimeMs).toISOString() : null,
        timestamp: Date.now()
      }
    })
    .filter(Boolean)
}

function parsePolymarketArray(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function convertPolymarket(markets) {
  return markets
    .map(market => {
      const outcomes = parsePolymarketArray(market.outcomes).map(item => String(item).toLowerCase())
      const prices = parsePolymarketArray(market.outcomePrices)

      const yesIndex = outcomes.indexOf('yes')
      const noIndex = outcomes.indexOf('no')

      const yesPrice = getFirstValidPrice(
        yesIndex >= 0 ? prices[yesIndex] : prices[0]
      )
      const noPrice = getFirstValidPrice(
        noIndex >= 0 ? prices[noIndex] : prices[1],
        yesPrice !== null ? (1 - yesPrice).toFixed(4) : null
      )

      if (yesPrice === null || noPrice === null) {
        return null
      }

      const marketTitle = market.question || market.slug || ''
      const expiryTimeMs = parseTimeMs(market.endDate, market.endDateIso)
      return {
        platform: 'B',
        platformName: 'POLYMARKET',
        exchangeMarketId: market.id,
        marketTitle,
        marketId: normalizeMarketId(marketTitle),
        yesPrice,
        noPrice,
        fees: POLY_FEE,
        expiryTimeMs,
        expiryAt: expiryTimeMs ? new Date(expiryTimeMs).toISOString() : null,
        timestamp: Date.now()
      }
    })
    .filter(Boolean)
}

module.exports = {
  convertKalshi,
  convertPolymarket,
  // Backward-compatible export name used by older files.
  convertManifold: convertKalshi
}
