function normalizeOrderPayload(payload) {
  const platform = String(payload?.platform || '').trim().toUpperCase()
  const marketId = String(payload?.marketId || '').trim()
  const side = String(payload?.side || '').trim().toUpperCase()
  const size = Number(payload?.size)
  const price = payload?.price === undefined ? undefined : Number(payload.price)

  if (!platform) {
    throw new Error('Missing order field: platform')
  }
  if (!marketId) {
    throw new Error('Missing order field: marketId')
  }
  if (side !== 'YES' && side !== 'NO') {
    throw new Error('Invalid order side. Use YES or NO.')
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Invalid order size. Must be a positive number.')
  }
  if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > 1)) {
    throw new Error('Invalid order price. Must be between 0 and 1.')
  }

  return {
    platform,
    marketId,
    side,
    size,
    price,
    clientOrderId: payload?.clientOrderId || `arb-${Date.now()}`
  }
}

async function submitToConfiguredEndpoint(platform, order) {
  const endpoint = process.env[`${platform}_ORDER_API_URL`]
  if (!endpoint) {
    throw new Error(`No endpoint configured for ${platform}. Set ${platform}_ORDER_API_URL.`)
  }

  const headers = { 'Content-Type': 'application/json' }
  const apiKey = process.env[`${platform}_ORDER_API_KEY`] || process.env[`${platform}_API_KEY`]
  const apiSecret = process.env[`${platform}_ORDER_API_SECRET`] || process.env[`${platform}_API_SECRET`]

  if (apiKey) {
    headers['X-API-KEY'] = apiKey
  }
  if (apiSecret) {
    headers['X-API-SECRET'] = apiSecret
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(order)
  })

  const responseText = await response.text()
  let parsedBody
  try {
    parsedBody = JSON.parse(responseText)
  } catch {
    parsedBody = { raw: responseText }
  }

  if (!response.ok) {
    throw new Error(`${platform} order failed (${response.status}): ${responseText.slice(0, 200)}`)
  }

  return {
    platform,
    endpoint,
    order,
    exchangeResponse: parsedBody
  }
}

const orderHandlers = {
  KALSHI: order => submitToConfiguredEndpoint('KALSHI', order),
  POLYMARKET: order => submitToConfiguredEndpoint('POLYMARKET', order)
}

function registerOrderHandler(platform, handler) {
  const key = String(platform || '').trim().toUpperCase()
  if (!key) {
    throw new Error('Platform is required to register handler.')
  }
  if (typeof handler !== 'function') {
    throw new Error('Order handler must be a function.')
  }
  orderHandlers[key] = handler
}

async function registerOrder(payload) {
  const order = normalizeOrderPayload(payload)
  const handler = orderHandlers[order.platform]
  if (!handler) {
    throw new Error(`No order handler found for ${order.platform}.`)
  }
  return handler(order)
}

module.exports = {
  registerOrder,
  registerOrderHandler
}
