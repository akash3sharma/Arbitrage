function getMockPrices() {
  return [
    {
      platform: "A",
      marketId: "ind-vs-aus-t20",
      yesPrice: 0.41,
      noPrice: 0.59,
      fees: 0.02,
      timestamp: Date.now()
    },
    {
      platform: "B",
      marketId: "ind-vs-aus-t20",
      yesPrice: 0.97,
      noPrice: 0.03,
      fees: 0.03,
      timestamp: Date.now()
    }
  ]
}

module.exports = { getMockPrices }