const { fetchKalshiMarkets } = require('./first')
const { fetchPolyMarkets } = require('./second')
const { convertKalshi, convertPolymarket } = require('./converter')
const { matchMarkets } = require('./eventMatcher')
const { detectArb } = require('./detectArb')

async function runLiveTest() {
  const topic = process.env.ARBITRAGE_TOPIC || 'election'
  console.log(`Fetching from real-money APIs (topic: ${topic})...`)

  const kalshiRaw = await fetchKalshiMarkets(topic)
  const polyRaw = await fetchPolyMarkets(topic)

  console.log(`Kalshi: ${kalshiRaw.length} markets`)
  console.log(`Polymarket: ${polyRaw.length} markets`)

  const platformA = convertKalshi(kalshiRaw)
  const platformB = convertPolymarket(polyRaw)

  console.log("\nPlatform A sample:", platformA[0])
  console.log("Platform B sample:", platformB[0])

  const pairs = matchMarkets(platformA, platformB)
  console.log(`\nMatched pairs: ${pairs.length}`)

  for (const pair of pairs) {
    const result = detectArb(pair.marketA, pair.marketB)
    if (result) {
      console.log("\nARB FOUND!")
      console.log(result)
    } else {
      console.log(`No arb: ${pair.marketA.marketId}`)
    }
  }
}

runLiveTest()
