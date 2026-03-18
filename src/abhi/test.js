const { getMockPrices } = require('./mockPrices')
const { detectArb } = require('./detectArb')

const prices = getMockPrices()

const marketA = prices.find(p => p.platform === "A")
const marketB = prices.find(p => p.platform === "B")

const result = detectArb(marketA, marketB)

if (result) {
  console.log("ARB FOUND!")
  console.log(result)
} else {
  console.log("No arb opportunity right now.")
}