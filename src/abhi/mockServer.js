const http = require('http')
const { fetchKalshiMarkets } = require('./first')
const { fetchPolyMarkets } = require('./second')
const { convertKalshi, convertPolymarket } = require('./converter')
const { matchMarkets } = require('./eventMatcher')
const { detectArb } = require('./detectArb')
const { registerOrder } = require('./orderRouter')

const PORT = Number(process.env.PORT || 3000)
const TOPIC = (process.env.ARBITRAGE_TOPIC || 'election').toLowerCase()
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS || 15000)
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

// memory store - latest results live here
let latestOpportunities = []
let latestNearMisses = []
let latestWeekCandidates = []
let lastScanned = null
let lastScanStats = {
  totalPairs: 0,
  platformACount: 0,
  platformBCount: 0
}
let isScanning = false

function createShortCode(marketText) {
  const code = String(marketText || '')
    .split('-')
    .filter(Boolean)
    .slice(0, 3)
    .join('-')
    .toUpperCase()
  return code || 'ARB'
}

function getPairExpiryMs(pair) {
  const candidates = [pair.marketA?.expiryTimeMs, pair.marketB?.expiryTimeMs]
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)

  if (!candidates.length) {
    return null
  }
  return Math.min(...candidates)
}

function formatTimeLeft(ms) {
  if (!Number.isFinite(ms)) {
    return 'unknown'
  }
  if (ms <= 0) {
    return 'ended'
  }

  const hours = ms / (60 * 60 * 1000)
  if (hours < 24) {
    return `${Math.ceil(hours)}h left`
  }

  const days = ms / (24 * 60 * 60 * 1000)
  return `${Math.ceil(days)}d left`
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'))
      }
    })
    req.on('end', () => {
      if (!body) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

async function scanMarkets() {
  if (isScanning) {
    return
  }
  isScanning = true
  try {
    console.log(`Scanning real-money markets for topic "${TOPIC}"...`)

    const kalshiRaw = await fetchKalshiMarkets(TOPIC)
    const polyRaw = await fetchPolyMarkets(TOPIC)

    const platformA = convertKalshi(kalshiRaw)
    const platformB = convertPolymarket(polyRaw)

    const pairs = matchMarkets(platformA, platformB)

    const opportunities = []
    const nearMisses = []
    const weekCandidates = []
    const nowMs = Date.now()

    for (const pair of pairs) {
      const pairExpiryMs = getPairExpiryMs(pair)
      const timeToExpiryMs = pairExpiryMs ? pairExpiryMs - nowMs : null
      const result = detectArb(pair.marketA, pair.marketB)
      if (result) {
        opportunities.push({
          ...result,
          short: createShortCode(result.market),
          platformA: pair.marketA.platformName || 'KALSHI',
          platformB: pair.marketB.platformName || 'POLYMARKET',
          marketAExchangeId: pair.marketA.exchangeMarketId,
          marketBExchangeId: pair.marketB.exchangeMarketId,
          expiresAt: pairExpiryMs ? new Date(pairExpiryMs).toISOString() : null,
          timeToExpiryMs
        })
        console.log(`ARB FOUND: ${result.market} → +${(result.profit * 100).toFixed(2)}%`)
      } else {
        const totalFees = pair.marketA.fees + pair.marketB.fees
        const combo1Total = pair.marketA.yesPrice + pair.marketB.noPrice + totalFees
        const combo2Total = pair.marketA.noPrice + pair.marketB.yesPrice + totalFees
        const combo1IsBest = combo1Total <= combo2Total
        const bestTotal = combo1IsBest ? combo1Total : combo2Total
        const gap = bestTotal - 1
        const marketKey = pair.marketA.marketId || pair.marketA.marketTitle

        nearMisses.push({
          market: pair.marketA.marketTitle || pair.marketA.marketId,
          short: createShortCode(marketKey),
          profit: Number((-gap).toFixed(6)),
          gap: Number((gap * 100).toFixed(2)),
          total: Number(bestTotal.toFixed(4)),
          yesPrice: combo1IsBest ? pair.marketA.yesPrice : pair.marketB.yesPrice,
          noPrice: combo1IsBest ? pair.marketB.noPrice : pair.marketA.noPrice,
          platformA: pair.marketA.platformName || 'KALSHI',
          platformB: pair.marketB.platformName || 'POLYMARKET',
          matchScore: pair.matchScore || null,
          expiresAt: pairExpiryMs ? new Date(pairExpiryMs).toISOString() : null,
          timeToExpiryMs
        })
      }

      if (pairExpiryMs && timeToExpiryMs !== null && timeToExpiryMs >= 0 && timeToExpiryMs <= ONE_WEEK_MS) {
        const totalFees = pair.marketA.fees + pair.marketB.fees
        const combo1Total = pair.marketA.yesPrice + pair.marketB.noPrice + totalFees
        const combo2Total = pair.marketA.noPrice + pair.marketB.yesPrice + totalFees
        const bestTotal = Math.min(combo1Total, combo2Total)
        const gap = bestTotal - 1

        weekCandidates.push({
          market: pair.marketA.marketTitle || pair.marketA.marketId,
          short: createShortCode(pair.marketA.marketId || pair.marketA.marketTitle),
          gap: Number((gap * 100).toFixed(2)),
          total: Number(bestTotal.toFixed(4)),
          isArb: gap < 0,
          arbProfitPct: Number((-gap * 100).toFixed(2)),
          platformA: pair.marketA.platformName || 'KALSHI',
          platformB: pair.marketB.platformName || 'POLYMARKET',
          matchScore: pair.matchScore || null,
          expiresAt: new Date(pairExpiryMs).toISOString(),
          timeToExpiryMs,
          timeToExpiryLabel: formatTimeLeft(timeToExpiryMs)
        })
      }
    }

    latestOpportunities = opportunities.sort((a, b) => b.profit - a.profit)
    latestNearMisses = nearMisses
      .sort((a, b) => {
        if (a.gap !== b.gap) return a.gap - b.gap
        return (b.matchScore || 0) - (a.matchScore || 0)
      })
      .slice(0, 20)
    latestWeekCandidates = weekCandidates
      .sort((a, b) => {
        if (a.isArb !== b.isArb) return a.isArb ? -1 : 1
        if (a.gap !== b.gap) return a.gap - b.gap
        return (a.timeToExpiryMs || Number.MAX_SAFE_INTEGER) - (b.timeToExpiryMs || Number.MAX_SAFE_INTEGER)
      })
      .slice(0, 20)

    lastScanned = new Date().toLocaleTimeString()
    lastScanStats = {
      totalPairs: pairs.length,
      platformACount: platformA.length,
      platformBCount: platformB.length
    }

    console.log(
      `Scan complete. ${pairs.length} pairs checked. ${opportunities.length} arb found. ` +
      `A=${platformA.length}, B=${platformB.length}.`
    )

  } catch (err) {
    console.error('Scan error:', err.message)
  } finally {
    isScanning = false
  }
}

// run immediately then on interval
scanMarkets()
setInterval(scanMarkets, SCAN_INTERVAL_MS)

async function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.method === 'GET' && req.url === '/opportunities') {
    sendJson(res, 200, {
      opportunities: latestOpportunities,
      nearMisses: latestNearMisses,
      weekCandidates: latestWeekCandidates,
      lastScanned,
      totalPairs: lastScanStats.totalPairs,
      platformACount: lastScanStats.platformACount,
      platformBCount: lastScanStats.platformBCount,
      topic: TOPIC
    })
    return
  }

  if (req.method === 'POST' && req.url === '/register-order') {
    try {
      const payload = await readJsonBody(req)
      const result = await registerOrder(payload)
      sendJson(res, 200, {
        ok: true,
        result
      })
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message
      })
    }
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      ok: true,
      lastScanned,
      topic: TOPIC
    })
    return
  }

  sendJson(res, 404, { error: 'Not found' })
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    sendJson(res, 500, { error: error.message })
  })
})

server.listen(PORT, () => {
  console.log(`Scanner running at http://localhost:${PORT}`)
})
