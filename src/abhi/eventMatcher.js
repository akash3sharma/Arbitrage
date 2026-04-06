const Fuse = require('fuse.js')

const MATCH_MIN_SCORE = Number(process.env.MATCH_MIN_SCORE || 0.52)
const MATCH_FALLBACK_MIN_SCORE = Number(process.env.MATCH_FALLBACK_MIN_SCORE || 0.43)
const MATCH_FUSE_LIMIT = Number(process.env.MATCH_FUSE_LIMIT || 20)
const STOPWORDS = new Set([
  'a', 'an', 'the', 'will', 'is', 'are', 'be', 'to', 'of', 'for', 'on', 'at', 'by',
  'who', 'what', 'when', 'where', 'why', 'how', 'win', 'wins', 'winner', 'winners',
  'first', 'round', '1st', '2nd', '3rd', 'next', 'presidential', 'presidency',
  'election', 'elections', 'general', 'party', 'parties', 'control', 'before', 'after',
  'price', 'range', 'above', 'below'
])

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(token => Boolean(token) && !STOPWORDS.has(token))
}

function buildBigrams(text) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return []
  }
  if (normalized.length < 2) {
    return [normalized]
  }

  const grams = []
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.push(normalized.slice(i, i + 2))
  }
  return grams
}

function diceCoefficient(textA, textB) {
  const gramsA = buildBigrams(textA)
  const gramsB = buildBigrams(textB)
  if (!gramsA.length || !gramsB.length) {
    return 0
  }

  const countsB = new Map()
  for (const gram of gramsB) {
    countsB.set(gram, (countsB.get(gram) || 0) + 1)
  }

  let intersection = 0
  for (const gram of gramsA) {
    const remaining = countsB.get(gram) || 0
    if (remaining > 0) {
      intersection += 1
      countsB.set(gram, remaining - 1)
    }
  }

  return (2 * intersection) / (gramsA.length + gramsB.length)
}

function buildTokenFrequency(markets) {
  const frequency = new Map()
  for (const market of markets) {
    const unique = new Set(market.wordTokens)
    for (const token of unique) {
      frequency.set(token, (frequency.get(token) || 0) + 1)
    }
  }
  return frequency
}

function tokenWeight(token, frequency) {
  const freq = frequency.get(token) || 1
  return 1 / (1 + freq)
}

function splitTokenSets(tokens) {
  const words = new Set()
  const numbers = new Set()

  for (const token of tokens) {
    if (/^[0-9]+$/.test(token)) {
      numbers.add(token)
    } else {
      words.add(token)
    }
  }

  return { words, numbers }
}

function isGeoAdjectiveToken(token) {
  return /(ian|ese|ish)$/.test(token)
}

function geoOverlapCount(geoA, geoB) {
  let count = 0
  for (const token of geoA) {
    if (geoB.has(token)) {
      count += 1
    }
  }
  return count
}

function weightedJaccard(wordsA, wordsB, frequency) {
  if (!wordsA.size || !wordsB.size) {
    return 0
  }

  const union = new Set([...wordsA, ...wordsB])
  let unionWeight = 0
  let intersectionWeight = 0

  for (const token of union) {
    const weight = tokenWeight(token, frequency)
    unionWeight += weight
    if (wordsA.has(token) && wordsB.has(token)) {
      intersectionWeight += weight
    }
  }

  if (unionWeight === 0) {
    return 0
  }
  return intersectionWeight / unionWeight
}

function sharedWordStats(wordsA, wordsB, frequency) {
  let count = 0
  let rarity = 0
  for (const token of wordsA) {
    if (!wordsB.has(token)) {
      continue
    }
    count += 1
    rarity += tokenWeight(token, frequency)
  }
  return { count, rarity }
}

function sharedNumberCount(numbersA, numbersB) {
  let count = 0
  for (const token of numbersA) {
    if (numbersB.has(token)) {
      count += 1
    }
  }
  return count
}

function yearScore(numbersA, numbersB) {
  const hasA = numbersA.size > 0
  const hasB = numbersB.size > 0

  if (!hasA && !hasB) {
    return 0.6
  }

  const overlap = sharedNumberCount(numbersA, numbersB)
  if (overlap > 0) {
    return 1
  }

  if (hasA && hasB) {
    return 0
  }

  return 0.3
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function prepareMarkets(markets) {
  return markets.map(market => {
    const combinedText = `${market.marketId || ''} ${market.marketTitle || ''}`.trim()
    const tokens = tokenize(combinedText)
    const split = splitTokenSets(tokens)
    return {
      ...market,
      _queryText: combinedText,
      wordTokens: split.words,
      numberTokens: split.numbers,
      geoTokens: new Set([...split.words].filter(isGeoAdjectiveToken))
    }
  })
}

function buildCandidateEdges(preparedA, preparedB, tokenFrequency) {
  if (!preparedA.length || !preparedB.length) {
    return []
  }

  const fuse = new Fuse(preparedB, {
    keys: ['marketId', 'marketTitle'],
    threshold: 0.8,
    includeScore: true,
    ignoreLocation: true
  })

  const edges = []
  const seenEdge = new Set()

  for (const marketA of preparedA) {
    const results = fuse.search(marketA._queryText, { limit: MATCH_FUSE_LIMIT })

    for (const result of results) {
      const marketB = result.item
      const edgeKey = `${marketA.exchangeMarketId || marketA.marketId}::${marketB.exchangeMarketId || marketB.marketId}`
      if (seenEdge.has(edgeKey)) {
        continue
      }
      seenEdge.add(edgeKey)

      const overlapScore = weightedJaccard(marketA.wordTokens, marketB.wordTokens, tokenFrequency)
      const textScore = 1 - Number(result.score ?? 1)
      const titleScore = diceCoefficient(
        marketA.marketId,
        marketB.marketId
      )
      const numericScore = yearScore(marketA.numberTokens, marketB.numberTokens)
      const sharedWords = sharedWordStats(marketA.wordTokens, marketB.wordTokens, tokenFrequency)
      const sharedNumbers = sharedNumberCount(marketA.numberTokens, marketB.numberTokens)
      const sharedGeo = geoOverlapCount(marketA.geoTokens, marketB.geoTokens)

      let score =
        (0.55 * overlapScore) +
        (0.12 * titleScore) +
        (0.25 * textScore) +
        (0.08 * numericScore)

      if (sharedWords.count >= 2) {
        score += 0.08
      }
      if (sharedWords.rarity >= 0.6) {
        score += 0.05
      }
      if (sharedWords.count === 0) {
        score -= 0.25
      }
      if (sharedNumbers === 0 && marketA.numberTokens.size > 0 && marketB.numberTokens.size > 0) {
        score -= 0.07
      }

      score = clamp(score, 0, 1)

      const hasStrongAnchorToken = sharedWords.rarity >= 0.22 || sharedWords.count >= 2
      const hasGeoConflict =
        marketA.geoTokens.size > 0 &&
        marketB.geoTokens.size > 0 &&
        sharedGeo === 0

      const accepted =
        !hasGeoConflict &&
        sharedWords.count >= 1 &&
        hasStrongAnchorToken &&
        (
          score >= MATCH_MIN_SCORE ||
          (sharedWords.count >= 2 && score >= MATCH_FALLBACK_MIN_SCORE)
        )

      if (!accepted) {
        continue
      }

      edges.push({
        marketA,
        marketB,
        score,
        sharedWordCount: sharedWords.count,
        sharedWordRarity: sharedWords.rarity,
        sharedNumberCount: sharedNumbers
      })
    }
  }

  return edges
}

function chooseBestPairs(edges) {
  const sorted = edges.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    if (right.sharedWordCount !== left.sharedWordCount) {
      return right.sharedWordCount - left.sharedWordCount
    }
    if (right.sharedNumberCount !== left.sharedNumberCount) {
      return right.sharedNumberCount - left.sharedNumberCount
    }
    return right.sharedWordRarity - left.sharedWordRarity
  })

  const matchedA = new Set()
  const matchedB = new Set()
  const pairs = []

  for (const edge of sorted) {
    const idA = edge.marketA.exchangeMarketId || edge.marketA.marketId
    const idB = edge.marketB.exchangeMarketId || edge.marketB.marketId

    if (matchedA.has(idA) || matchedB.has(idB)) {
      continue
    }

    matchedA.add(idA)
    matchedB.add(idB)
    pairs.push({
      marketA: edge.marketA,
      marketB: edge.marketB,
      matchScore: Number(edge.score.toFixed(4))
    })
  }

  return pairs
}

function matchMarkets(platformAPrices, platformBPrices) {
  const preparedA = prepareMarkets(platformAPrices || [])
  const preparedB = prepareMarkets(platformBPrices || [])
  const tokenFrequency = buildTokenFrequency([...preparedA, ...preparedB])
  const edges = buildCandidateEdges(preparedA, preparedB, tokenFrequency)
  return chooseBestPairs(edges)
}

module.exports = { matchMarkets }
