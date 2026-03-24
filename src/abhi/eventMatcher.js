const Fuse = require('fuse.js')

function matchMarkets(platformAPrices, platformBPrices) {

  const fuse = new Fuse(platformBPrices, {
    keys: ['marketId'],
    threshold: 0.2
  })

  const matchedPairs = []

  for (const marketA of platformAPrices) {
    const result = fuse.search(marketA.marketId)

    if (result.length > 0) {
      matchedPairs.push({
        marketA: marketA,
        marketB: result[0].item
      })
    }
  }

  return matchedPairs
}

module.exports = { matchMarkets }