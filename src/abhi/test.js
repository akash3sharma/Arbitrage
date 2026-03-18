const { getMockPrices } = require('./mockPrices')
const { detectArb } = require('./detectArb')
const { matchMarkets } = require('./eventMatcher')

const prices = getMockPrices()

const platformAPrices = prices.filter(p => p.platform === "A")
const platformBPrices = prices.filter(p => p.platform === "B")

// Step 1 - match markets
const pairs = matchMarkets(platformAPrices, platformBPrices)

console.log("Matched pairs found:", pairs.length)

// Step 2 - run detectArb on each matched pair
for (const pair of pairs) {
  const result = detectArb(pair.marketA, pair.marketB)

  if (result) {
    console.log("ARB FOUND!")
    console.log(result)
  } else {
    console.log("No arb for:", pair.marketA.marketId)
  }
}