async function fetchPolyMarkets() {
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100'
  );
  const markets = await res.json();

  const worldcup = markets.filter(m =>
    m.question?.toLowerCase().includes('world cup') ||
    m.question?.toLowerCase().includes('fifa')
  );

  return worldcup;
}

fetchPolyMarkets().then(markets => {
  console.log(`Polymarket: Found ${markets.length} markets`);
  console.log(markets);
});

module.exports = { fetchPolyMarkets }