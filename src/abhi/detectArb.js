function detectArb(marketA, marketB) {
  const totalFees = marketA.fees + marketB.fees

  const combo1Total = marketA.yesPrice + marketB.noPrice
  const combo1Profit = 1 - combo1Total - totalFees

  const combo2Total = marketA.noPrice + marketB.yesPrice
  const combo2Profit = 1 - combo2Total - totalFees

  if (combo1Profit > 0 ) {
    return {
      market: marketA.marketId,
      yesPrice: marketA.yesPrice,
      noPrice: marketB.noPrice,
      total: combo1Total,
      profit:combo1Profit
    }
  }
  else if (combo2Profit > 0) {
    return {
      market: marketB.marketId,
      yesPrice: marketB.yesPrice,
      noPrice: marketA.noPrice,
      total: combo2Total,
      profit:combo2Profit
    }
  }
  return false
}

module.exports = { detectArb }