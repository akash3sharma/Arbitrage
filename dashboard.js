const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000' 
  : 'https://api.arbdetector.com'; 

let scanN=0,total=0,cd=5,paused=false,bestP=0.016
let prevKeys=new Set(),aliveMap={},lastArbTime=null

const mock=[
  {market:'Will Italy qualify on the field for the 2026 FIFA World Cup?',short:'ITA-QUAL',yesPrice:.58,noPrice:.35,total:.93,profit:.016},
  {market:'Will England win the 2026 FIFA World Cup?',short:'ENG-WIN',yesPrice:.08,noPrice:.87,total:.95,profit:.002}
]
const nearMock=[
  {market:'Will France win the 2026 FIFA World Cup?',short:'FRA-WIN',profit:-.018,gap:1.8},
  {market:'Will Argentina win the 2026 FIFA World Cup?',short:'ARG-WIN',profit:-.031,gap:3.1},
  {market:'Will Japan reach the quarterfinals 2026?',short:'JPN-QTR',profit:-.042,gap:4.2}
]

window.addEventListener('scroll',()=> {
  const dnav = document.getElementById('dnav');
  if(dnav) dnav.classList.toggle('scrolled',window.scrollY>10)
})

window.calcP = function(){
  const camtEl = document.getElementById('camt');
  if(!camtEl) return;
  const amt=parseFloat(camtEl.value)||0
  document.getElementById('cres').textContent='₹'+Math.round(amt*bestP).toLocaleString()
  document.getElementById('cpct').textContent='+'+(bestP*100).toFixed(2)+'%'
  const res=document.getElementById('calc-res')
  res.classList.remove('flash')
  void res.offsetWidth
  res.classList.add('flash')
}

window.togglePause = function(){
  paused=!paused
  const b=document.getElementById('pbtn')
  b.textContent=paused?'▶ resume':'⏸ pause'
  b.className='pause-btn'+(paused?' on':'')
}

function shorten(s){return s.length>52?s.substring(0,50)+'…':s}

function timeSince(t){
  if(!t)return null
  const d=Math.floor((Date.now()-t)/1000)
  if(d<60)return d+'s ago'
  return Math.floor(d/60)+'m ago'
}

function renderOpps(ops){
  if(paused)return
  const g=document.getElementById('opp-grid')
  if(!g) return;
  if(!ops.length){
    const since=timeSince(lastArbTime)
    g.innerHTML=`<div class="empty-state">
      <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:6px">Markets are efficient right now</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:12px">Monitoring all 7 pairs — check near-miss below</div>
      <div class="dots"><span></span><span></span><span></span></div>
      ${since?`<div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-top:10px">Last opportunity found ${since}</div>`:''}
    </div>`
    return
  }
  lastArbTime=Date.now()
  const best=ops.reduce((a,b)=>a.profit>b.profit?a:b)
  bestP=best.profit; window.calcP()
  document.getElementById('d-act').textContent=ops.length
  document.getElementById('d-acth').textContent=ops.length+' live now'
  const now=new Date().toLocaleTimeString()
  g.innerHTML=ops.map(o=>{
    const h=o===best
    const p=(o.profit*100).toFixed(2)
    const bw=Math.min((o.profit/.05)*100,100).toFixed(0)
    const isNew=!prevKeys.has(o.short)
    const alive=aliveMap[o.short]||1
    return`<div class="ocard${h?' hot':''}${isNew?' flash':''}">
      <div class="oc-top">
        ${h?'<div class="oc-hot">best edge</div>':'<div></div>'}
        <div class="oc-alive">seen ${alive}×</div>
      </div>
      <div class="oc-pct${h?'':' dim'}">+${p}%</div>
      <div class="oc-name">${shorten(o.market)}</div>
      <div class="oc-bar"><div class="oc-bar-fill" style="width:${bw}%"></div></div>
      <div class="oc-pills">
        <div class="oc-pill">YES (A) <b>${o.yesPrice.toFixed(2)}</b></div>
        <div class="oc-pill">NO (B) <b>${o.noPrice.toFixed(2)}</b></div>
        <div class="oc-pill">total <b>${o.total.toFixed(2)}</b></div>
      </div>
      <div class="oc-hint">On ₹10,000 → guaranteed <span>₹${Math.round(10000*o.profit)}</span></div>
      <div class="oc-fresh">prices at ${now}</div>
    </div>`
  }).join('')
  ops.forEach(o=>{aliveMap[o.short]=(aliveMap[o.short]||0)+1})
  prevKeys=new Set(ops.map(o=>o.short))
}

function renderNear(near){
  if(paused)return
  const ng = document.getElementById('near-grid');
  if(!ng) return;
  ng.innerHTML=near.map(n=>{
    const gap=Math.abs(n.gap||Math.abs(n.profit*100))
    const close=gap<2
    const bw=Math.max(0,100-(gap/5)*100).toFixed(0)
    return`<div class="ncard">
      <div class="nc-pct${close?' close':''}">${(n.profit*100).toFixed(2)}%</div>
      <div class="nc-name">${shorten(n.market)}</div>
      <div class="nc-gap">${gap.toFixed(1)}% from threshold</div>
      <div class="nc-bar"><div class="nc-fill${close?' close':''}" style="width:${bw}%"></div></div>
    </div>`
  }).join('')
}

function addLog(t,ops){
  if(paused)return
  const b=document.getElementById('li')
  if(!b) return;
  const r=document.createElement('div'); r.className='lrow'
  if(ops.length){
    r.innerHTML=`<span class="lt">${t}</span><span class="ld f"></span><span class="ltxt">${ops.map(o=>o.short+' +'+(o.profit*100).toFixed(2)+'%').join(' · ')}</span><span class="lp">+${(Math.max(...ops.map(o=>o.profit))*100).toFixed(2)}%</span>`
  } else {
    r.innerHTML=`<span class="lt">${t}</span><span class="ld n"></span><span class="ltxt">no arb — markets efficient</span>`
  }
  b.insertBefore(r,b.firstChild)
  while(b.children.length>60)b.removeChild(b.lastChild)
}

function updateStats(ops,t){
  if(paused)return
  scanN++; total+=ops.length
  document.getElementById('dscan').textContent='scan #'+scanN
  document.getElementById('d-time').textContent=t
  document.getElementById('dtotal').textContent=total+' arb detected'
  if(ops.length){
    const b=ops.reduce((a,c)=>a.profit>c.profit?a:c)
    document.getElementById('d-best').textContent='+'+(b.profit*100).toFixed(2)+'%'
    document.getElementById('d-besth').textContent=b.short
  } else {
    document.getElementById('d-act').textContent='0'
    document.getElementById('d-acth').textContent='none right now'
  }
}

async function scan(){
  if(paused)return; cd=5
  const now=new Date().toLocaleTimeString()
  const dtimeh = document.getElementById('d-timeh');
  if(!dtimeh) return;
  try{
    const r=await fetch(`${API_URL}/opportunities`)
    const d=await r.json()
    if(!d||!Array.isArray(d.opportunities))throw new Error('bad')
    dtimeh.textContent='server connected'
    updateStats(d.opportunities,now)
    renderOpps(d.opportunities)
    renderNear(nearMock)
    addLog(now,d.opportunities)
  }catch(e){
    dtimeh.textContent='mock — server offline'
    updateStats(mock,now)
    renderOpps(mock)
    renderNear(nearMock)
    addLog(now,mock)
  }
}

if (document.getElementById('dnav')) {
  setInterval(()=>{if(!paused){cd--;document.getElementById('dcd').textContent='next in '+Math.max(cd,0)+'s'}},1000)
  setInterval(scan,5000)
  scan(); window.calcP()
}
