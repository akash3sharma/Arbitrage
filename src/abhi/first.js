const KALSHI_BASE_URL = process.env.KALSHI_BASE_URL || 'https://api.elections.kalshi.com/trade-api/v2'
const DEFAULT_TOPIC = (process.env.ARBITRAGE_TOPIC || 'election').toLowerCase()
const EVENT_PAGE_LIMIT = Number(process.env.KALSHI_EVENT_PAGE_LIMIT || 20)
const EVENT_MATCH_LIMIT = Number(process.env.KALSHI_EVENT_MATCH_LIMIT || 20)
const EVENT_POOL_LIMIT = Number(process.env.KALSHI_EVENT_POOL_LIMIT || 250)
const MAX_EVENTS_PER_SERIES = Number(process.env.KALSHI_MAX_EVENTS_PER_SERIES || 3)
const MARKETS_PER_EVENT = Number(process.env.KALSHI_MARKETS_PER_EVENT || 200)
const EVENT_CACHE_MS = Number(process.env.KALSHI_EVENT_CACHE_MS || 30 * 60 * 1000)

let eventTickerCache = {
  topic: '',
  expiresAt: 0,
  tickers: []
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (response.ok) {
      return response.json()
    }

    const isRetryable = response.status === 429 || response.status >= 500
    if (isRetryable && attempt < retries) {
      await sleep((attempt + 1) * 700)
      continue
    }

    throw new Error(`Kalshi API error ${response.status} for ${url}`)
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function topicMatches(eventObj, topic) {
  const text = normalizeText(`${eventObj.title} ${eventObj.sub_title} ${eventObj.event_ticker}`)
  const terms = normalizeText(topic).split(' ').filter(Boolean)
  return terms.length ? terms.every(term => text.includes(term)) : false
}

function scoreEvent(eventObj, topicTerms) {
  const text = normalizeText(
    `${eventObj.title} ${eventObj.sub_title} ${eventObj.event_ticker} ${eventObj.series_ticker}`
  )

  let score = 0
  for (const term of topicTerms) {
    if (text.includes(term)) {
      score += 2
    }
  }

  if (/\bwinner\b|\bwho will\b|\bwill .* win\b/.test(text)) {
    score += 1.2
  }
  if (/\bprice\b|\brange\b|\babove\b|\bbelow\b/.test(text)) {
    score += 0.5
  }
  if (/\bgroup\b|\bqualifier\b|\bqualifiers\b/.test(text)) {
    score -= 0.2
  }

  const updatedTime = Date.parse(eventObj.last_updated_ts || '') || 0
  return { score, updatedTime }
}

function selectEventTickers(events, topic) {
  const topicTerms = normalizeText(topic).split(' ').filter(Boolean)

  const ranked = events
    .map(eventObj => {
      const ranking = scoreEvent(eventObj, topicTerms)
      return { ...eventObj, ...ranking }
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return b.updatedTime - a.updatedTime
    })

  const selected = []
  const seriesCounter = new Map()

  for (const eventObj of ranked) {
    if (selected.length >= EVENT_MATCH_LIMIT) {
      break
    }

    const seriesKey = eventObj.series_ticker || eventObj.event_ticker
    const countForSeries = seriesCounter.get(seriesKey) || 0
    if (countForSeries >= MAX_EVENTS_PER_SERIES) {
      continue
    }

    selected.push(eventObj.event_ticker)
    seriesCounter.set(seriesKey, countForSeries + 1)
  }

  return selected
}

async function fetchKalshiEventTickers(topic) {
  const now = Date.now()
  if (
    eventTickerCache.topic === topic &&
    eventTickerCache.expiresAt > now &&
    eventTickerCache.tickers.length
  ) {
    return eventTickerCache.tickers
  }

  const matchedEvents = []
  const seen = new Set()
  let cursor = ''

  for (let page = 0; page < EVENT_PAGE_LIMIT; page += 1) {
    const url = new URL(`${KALSHI_BASE_URL}/events`)
    url.searchParams.set('status', 'open')
    url.searchParams.set('limit', '200')
    if (cursor) {
      url.searchParams.set('cursor', cursor)
    }

    const payload = await fetchJson(url.toString())
    const events = payload.events || []

    for (const eventObj of events) {
      if (!eventObj?.event_ticker || seen.has(eventObj.event_ticker)) {
        continue
      }
      if (topicMatches(eventObj, topic)) {
        seen.add(eventObj.event_ticker)
        matchedEvents.push(eventObj)
        if (matchedEvents.length >= EVENT_POOL_LIMIT) {
          break
        }
      }
    }

    if (!payload.cursor || matchedEvents.length >= EVENT_POOL_LIMIT) {
      break
    }
    cursor = payload.cursor
  }

  const tickers = selectEventTickers(matchedEvents, topic)

  eventTickerCache = {
    topic,
    expiresAt: now + EVENT_CACHE_MS,
    tickers
  }

  return tickers
}

async function fetchKalshiMarkets(topic = DEFAULT_TOPIC) {
  const tickers = await fetchKalshiEventTickers(topic)
  if (!tickers.length) {
    return []
  }

  const allMarkets = []
  for (const eventTicker of tickers) {
    try {
      const url = new URL(`${KALSHI_BASE_URL}/markets`)
      url.searchParams.set('status', 'open')
      url.searchParams.set('limit', String(MARKETS_PER_EVENT))
      url.searchParams.set('event_ticker', eventTicker)
      const payload = await fetchJson(url.toString())
      allMarkets.push(...(payload.markets || []))
      // Gentle delay to avoid hitting Kalshi's rate limits.
      await sleep(120)
    } catch (error) {
      console.error(`Kalshi market fetch failed for ${eventTicker}: ${error.message}`)
    }
  }

  const dedupe = new Map()
  for (const market of allMarkets) {
    if (market?.market_type !== 'binary') {
      continue
    }
    if (!market?.ticker) {
      continue
    }
    dedupe.set(market.ticker, market)
  }

  return Array.from(dedupe.values())
}

module.exports = {
  fetchKalshiMarkets,
  // Backward-compatible export name used by older files.
  fetchManifoldMarkets: fetchKalshiMarkets
}
