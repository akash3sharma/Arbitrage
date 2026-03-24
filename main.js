// ─── DYNAMIC API URL ─────────────────────────────────────────────────────────
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000' 
  : 'https://api.arbdetector.com'; 

// ─── BEAM ANIMATION ─────────────────────────────────────────────────────────
const canvas = document.getElementById('beams-canvas')
const heroWrap = document.getElementById('hero-wrap')

if (canvas && heroWrap) {
  const ctx = canvas.getContext('2d')

  function resizeCanvas(){
    canvas.width  = heroWrap.offsetWidth
    canvas.height = heroWrap.offsetHeight
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  const beamDefs = [
    {xRatio:.06, speed:1.2, width:1.5, delay:0,   len:70},
    {xRatio:.18, speed:2.2, width:1.0, delay:60,  len:45},
    {xRatio:.30, speed:1.6, width:2.0, delay:20,  len:85},
    {xRatio:.42, speed:1.0, width:1.0, delay:140, len:55},
    {xRatio:.55, speed:2.8, width:1.5, delay:30,  len:75},
    {xRatio:.67, speed:1.4, width:1.0, delay:90,  len:50},
    {xRatio:.79, speed:2.0, width:2.0, delay:110, len:90},
    {xRatio:.88, speed:1.8, width:1.0, delay:50,  len:60},
    {xRatio:.95, speed:1.3, width:1.5, delay:170, len:65},
  ]

  const beams = beamDefs.map(d => ({...d, y:-d.len, active:false, frameDelay:d.delay}))
  const explosions = []
  let frame = 0
  let animationId = null;
  let isHeroVisible = true;

  function spawnExplosion(x, y){
    const particles = Array.from({length:18}, () => ({
      x, y,
      vx:(Math.random()-.5)*5,
      vy:-(Math.random()*3.5+1),
      life:1,
      size:Math.random()*2+1
    }))
    explosions.push({particles, life:1})
  }

  function drawBeams(){
    if (!isHeroVisible) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const h = canvas.height
    frame++

    beams.forEach(b => {
      if(frame < b.frameDelay) return
      if(!b.active){
        b.active = true
        b.y = -b.len
        b.x = canvas.width * b.xRatio
      }
      b.y += b.speed

      if(b.y - b.len > h){
        b.active = false
        b.frameDelay = frame + Math.floor(Math.random()*200 + 80)
        return
      }

      const hitY = h - 2
      if(b.y >= hitY && b.y - b.speed < hitY){
        spawnExplosion(b.x, hitY)
      }

      const drawTop = b.y - b.len
      const drawBot = Math.min(b.y, hitY)
      const grad = ctx.createLinearGradient(b.x, drawTop, b.x, drawBot)
      grad.addColorStop(0,   'rgba(22,163,74,0)')
      grad.addColorStop(0.4, 'rgba(22,163,74,0.55)')
      grad.addColorStop(1,   'rgba(22,163,74,0.05)')
      ctx.beginPath()
      ctx.moveTo(b.x, drawTop)
      ctx.lineTo(b.x, drawBot)
      ctx.strokeStyle = grad
      ctx.lineWidth = b.width
      ctx.stroke()
    })

    for(let i = explosions.length - 1; i >= 0; i--){
      const exp = explosions[i]
      exp.life -= 0.022
      if(exp.life <= 0){ explosions.splice(i,1); continue }
      exp.particles.forEach(p => {
        p.x  += p.vx
        p.y  += p.vy
        p.vy += 0.1
        p.life -= 0.028
        if(p.life <= 0) return
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2)
        ctx.fillStyle = `rgba(22,163,74,${Math.max(0, p.life * exp.life * 1.2)})`
        ctx.fill()
      })
      const glowGrad = ctx.createRadialGradient(
        explosions[i]?.particles[0]?.x || 0, canvas.height - 2, 0,
        explosions[i]?.particles[0]?.x || 0, canvas.height - 2, 30
      )
      glowGrad.addColorStop(0, `rgba(22,163,74,${exp.life * 0.3})`)
      glowGrad.addColorStop(1, 'rgba(22,163,74,0)')
      ctx.beginPath()
      ctx.arc(exp.particles[0]?.x || 0, canvas.height - 2, 30, 0, Math.PI*2)
      ctx.fillStyle = glowGrad
      ctx.fill()
    }

    animationId = requestAnimationFrame(drawBeams)
  }

  // Optimize animation: Pause when hero is not visible
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      isHeroVisible = e.isIntersecting;
      if (isHeroVisible) {
        if (!animationId) drawBeams();
      } else {
        if (animationId) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    });
  }, { threshold: 0.01 });
  heroObserver.observe(heroWrap);
}

// ─── INTERSECTION OBSERVER — fade in ────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('visible') })
}, {threshold:0.1})
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el))

// ─── ACTIVE NAV ─────────────────────────────────────────────────────────────
const sections = ['how','math','teaser','waitlist']
const navObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if(e.isIntersecting){
      document.querySelectorAll('.n-link').forEach(l => l.classList.remove('active'))
      const lnk = document.querySelector(`.n-link[data-section="${e.target.id}"]`)
      if(lnk) lnk.classList.add('active')
    }
  })
}, {threshold:0.4})
sections.forEach(id => { const el = document.getElementById(id); if(el) navObs.observe(el) })

// ─── NAV SHADOW ─────────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  if(nav) nav.classList.toggle('scrolled', window.scrollY > 10)
})

// ─── INTERACTIVE MATH ───────────────────────────────────────────────────────
function calcMath(){
  const yesEl = document.getElementById('m-yes');
  if (!yesEl) return;
  const yes  = parseFloat(yesEl.value)  || 0
  const no   = parseFloat(document.getElementById('m-no').value)   || 0
  const fee  = parseFloat(document.getElementById('m-fee').value)  || 0
  const total   = yes + no + fee
  const profit  = (1 - total) * 100
  document.getElementById('m-total').textContent = total.toFixed(2)
  const profEl  = document.getElementById('m-profit')
  const resRow  = document.getElementById('m-res-row')
  const resLbl  = document.getElementById('m-res-lbl')
  const note    = document.getElementById('m-note')
  
  if(profit > 0){
    profEl.textContent = '+' + profit.toFixed(2) + '%'
    profEl.className   = 'mb-val profit'
    resRow.className   = 'mb-row res'
    resLbl.style.color = 'var(--profit)'
    resLbl.textContent = 'Guaranteed profit'
    note.textContent   = 'On ₹10,000 → guaranteed ₹' + Math.round(10000*(profit/100)) + ' profit'
    note.style.color   = 'var(--profit)'
  } else {
    profEl.textContent = profit.toFixed(2) + '%'
    profEl.className   = 'mb-val loss'
    resRow.className   = 'mb-row res-bad'
    resLbl.style.color = 'var(--danger)'
    resLbl.textContent = 'No arb — loss at these prices'
    note.textContent   = 'Total cost exceeds 1.00 — On ₹10,000 → guaranteed ₹' + Math.abs(Math.round(10000*(profit/100))) + ' loss'
    note.style.color   = 'var(--danger)'
  }
}
if(document.getElementById('m-yes')) calcMath();

// ─── WAITLIST ───────────────────────────────────────────────────────────────
function handleWL(e){
  e.preventDefault()
  const email = document.getElementById('wl-email').value
  if(!email || !email.includes('@')) return
  const form = document.getElementById('wl-form');
  const note = document.getElementById('wl-note');
  const ok = document.getElementById('wl-ok');
  
  form.style.opacity = '0';
  note.style.opacity = '0';
  
  setTimeout(() => {
    form.style.display = 'none';
    note.style.display = 'none';
    ok.style.display   = 'block';
  }, 300);
}

// ─── LIVE STATS ─────────────────────────────────────────────────────────────
async function fetchStats(){
  try{
    const r   = await fetch(`${API_URL}/opportunities`)
    const d   = await r.json()
    const ops = d.opportunities || []
    const harblEl = document.getElementById('h-arb');
    if(harblEl) harblEl.textContent = ops.length
    const s = document.getElementById('t-status')
    if(s) {
      s.textContent = 'LIVE DATA'; s.className = 'tb-live'
    }
    if(ops.length){
      const best = ops.reduce((a,b) => a.profit > b.profit ? a : b)
      const hbest = document.getElementById('h-best')
      if (hbest) hbest.textContent  = '+' + (best.profit*100).toFixed(1) + '%'
      const tpct1 = document.getElementById('t-pct1')
      if (tpct1) tpct1.textContent  = '+' + (best.profit*100).toFixed(2) + '%'
    }
  } catch(e){
    const s = document.getElementById('t-status')
    if(s) {
      s.textContent = 'DEMO DATA'; s.className = 'tb-demo'
    }
  }
}
if(document.getElementById('h-arb')) {
  fetchStats()
  setInterval(fetchStats, 10000)
}
