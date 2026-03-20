async function fetchManifoldMarkets() {
  const res = await fetch(
    'https://api.manifold.markets/v0/search-markets?term=2026+FIFA+World+Cup&filter=open&contractType=BINARY&limit=50'
  );
  const markets = await res.json();
  return markets;
}

fetchManifoldMarkets().then(markets => {
  console.log(`Manifold: Found ${markets.length} markets`);
  console.log(markets.map(m => m.question));
});

module.exports = { fetchManifoldMarkets }