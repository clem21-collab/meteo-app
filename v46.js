const V46_VERSION='4.6';
const V46_STATS_URL='https://historical-forecast-api.open-meteo.com/v1/forecast';
let v46StatsData=null;
let v46StatsKey='';
let v46StatsDays=30;
let v46StatsRefreshTimer=null;

(function initV46(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v46.css?v=${V46_VERSION}`;document.head.appendChild(css);
  const boot=()=>{
    if(!document.getElementById('panel-weather')||typeof currentPlace==='undefined')return setTimeout(boot,250);
    injectV46ExportButton();
    injectV46ExportModal();
    injectV46StatsTab();
    bindV46PlaceObserver();
  };
  boot();
})();

function v46PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

function injectV46ExportButton(){
  if(document.getElementById('v46ExportBtn'))return;
  const btn=document.createElement('button');
  btn.id='v46ExportBtn';btn.type='button';btn.className='secondary-button v46-export-btn';btn.innerHTML='↗️ Exporter le résumé';
  const bar=document.getElementById('v45CustomizeBar');
  if(bar){
    const actions=bar.querySelector('.v46-home-actions')||document.createElement('div');
    if(!actions.classList.contains('v46-home-actions')){
      actions.className='v46-home-actions';
      const customize=document.getElementById('v45CustomizeBtn');
      if(customize){customize.replaceWith(actions);actions.appendChild(customize);}
      else bar.prepend(actions);
    }
    actions.appendChild(btn);
  }else{
    const panel=document.getElementById('panel-weather');
    const wrap=document.createElement('div');wrap.className='v46-export-wrap';wrap.appendChild(btn);panel?.prepend(wrap);
  }
  btn.addEventListener('click',openV46ExportModal);
}

function injectV46ExportModal(){
  if(document.getElementById('v46ExportModal'))return;
  const modal=document.createElement('div');
  modal.id='v46ExportModal';modal.className='v46-export-modal';modal.hidden=true;
  modal.innerHTML=`
    <div class="v46-export-backdrop" data-v46-close="1"></div>
    <section class="v46-export-sheet glass-card" role="dialog" aria-modal="true" aria-labelledby="v46ExportTitle">
      <div class="v46-export-head">
        <div><span class="section-label">EXPORTER</span><h2 id="v46ExportTitle">Résumé météo</h2><p class="muted">Une carte prête à enregistrer ou partager.</p></div>
        <button id="v46ExportClose" class="v46-close" type="button">✕</button>
      </div>
      <div id="v46ExportPreview" class="v46-export-preview"></div>
      <div class="v46-export-actions">
        <button id="v46DownloadPng" type="button">🖼️ Télécharger PNG</button>
        <button id="v46SharePng" class="secondary-button" type="button">📤 Partager</button>
        <button id="v46PrintPdf" class="secondary-button" type="button">🖨️ Imprimer / PDF</button>
        <button id="v46CopyText" class="secondary-button" type="button">📋 Copier le texte</button>
      </div>
      <p id="v46ExportStatus" class="muted v46-export-status"></p>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-v46-close]')?.addEventListener('click',closeV46ExportModal);
  document.getElementById('v46ExportClose')?.addEventListener('click',closeV46ExportModal);
  document.getElementById('v46DownloadPng')?.addEventListener('click',()=>exportV46Png(false));
  document.getElementById('v46SharePng')?.addEventListener('click',()=>exportV46Png(true));
  document.getElementById('v46PrintPdf')?.addEventListener('click',printV46Summary);
  document.getElementById('v46CopyText')?.addEventListener('click',copyV46Summary);
}

function openV46ExportModal(){
  renderV46ExportPreview();
  const modal=document.getElementById('v46ExportModal');if(modal)modal.hidden=false;
  document.body.classList.add('v46-modal-open');
}
function closeV46ExportModal(){const modal=document.getElementById('v46ExportModal');if(modal)modal.hidden=true;document.body.classList.remove('v46-modal-open');}

function v46SummaryData(){
  const c=typeof currentData!=='undefined'?currentData?.current:null;
  const d=typeof currentData!=='undefined'?currentData?.daily:null;
  const [icon,condition]=typeof weatherInfo==='function'&&c?weatherInfo(Number(c.weather_code),Number(c.is_day)):['🌤️','Conditions variables'];
  const min=Number(d?.temperature_2m_min?.[0]),max=Number(d?.temperature_2m_max?.[0]),rainProb=Number(d?.precipitation_probability_max?.[0]);
  let aqi=null,aqiLabel='';
  try{if(typeof v44AirData!=='undefined'){aqi=Number(v44AirData?.current?.european_aqi);if(typeof v44AqiInfo==='function'&&Number.isFinite(aqi))aqiLabel=v44AqiInfo(aqi).label;}}catch{}
  const vigilance=document.getElementById('v41VigilanceLevel')?.textContent?.trim()||document.getElementById('v41VigilanceColor')?.textContent?.trim()||'';
  return{
    city:typeof currentPlace!=='undefined'&&currentPlace?.name?currentPlace.name:'Ma position',
    detail:document.getElementById('placeDetail')?.textContent?.trim()||'',
    icon,condition,
    temp:Number(c?.temperature_2m),feels:Number(c?.apparent_temperature),min,max,
    rainNow:Number(c?.precipitation||0),rainProb,
    humidity:Number(c?.relative_humidity_2m),wind:Number(c?.wind_speed_10m),gust:Number(c?.wind_gusts_10m),pressure:Number(c?.pressure_msl),
    aqi,aqiLabel,vigilance,
    generated:new Date()
  };
}

function v46Fmt(value,suffix='',decimals=0){const n=Number(value);return Number.isFinite(n)?`${n.toFixed(decimals)}${suffix}`:`--${suffix}`;}

function renderV46ExportPreview(){
  const s=v46SummaryData(),box=document.getElementById('v46ExportPreview');if(!box)return;
  box.innerHTML=`
    <div class="v46-preview-card">
      <div class="v46-preview-top"><div><small>RÉSUMÉ MÉTÉO</small><h3>${s.city}</h3><p>${s.detail}</p></div><div class="v46-preview-icon">${s.icon}</div></div>
      <div class="v46-preview-temp"><strong>${v46Fmt(s.temp,'°')}</strong><span>${s.condition}<small>Ressenti ${v46Fmt(s.feels,'°')} • ${v46Fmt(s.min,'°')} → ${v46Fmt(s.max,'°')}</small></span></div>
      <div class="v46-preview-grid">
        <span><b>🌧️ ${v46Fmt(s.rainProb,' %')}</b><small>Risque pluie</small></span>
        <span><b>💨 ${v46Fmt(s.wind,' km/h')}</b><small>Vent</small></span>
        <span><b>🌬️ ${v46Fmt(s.gust,' km/h')}</b><small>Rafales</small></span>
        <span><b>💧 ${v46Fmt(s.humidity,' %')}</b><small>Humidité</small></span>
      </div>
      <div class="v46-preview-bottom">${Number.isFinite(s.aqi)?`AQI ${Math.round(s.aqi)} • ${s.aqiLabel}`:'Qualité de l’air : --'}${s.vigilance?` • Vigilance ${s.vigilance}`:''}</div>
    </div>`;
}

function v46SummaryText(){
  const s=v46SummaryData();
  return `Météo à ${s.city}\n${s.condition} • ${v46Fmt(s.temp,'°C')} (ressenti ${v46Fmt(s.feels,'°C')})\nAujourd’hui : ${v46Fmt(s.min,'°C')} → ${v46Fmt(s.max,'°C')}\nPluie : ${v46Fmt(s.rainProb,' %')} de risque • ${v46Fmt(s.rainNow,' mm',1)} actuellement\nVent : ${v46Fmt(s.wind,' km/h')} • rafales ${v46Fmt(s.gust,' km/h')}\nHumidité : ${v46Fmt(s.humidity,' %')} • pression ${v46Fmt(s.pressure,' hPa')}\n${Number.isFinite(s.aqi)?`Qualité de l’air : AQI ${Math.round(s.aqi)} (${s.aqiLabel})\n`:''}${s.vigilance?`Vigilance : ${s.vigilance}\n`:''}Généré par Météo • ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(s.generated)}`;
}

async function copyV46Summary(){
  const status=document.getElementById('v46ExportStatus');
  try{await navigator.clipboard.writeText(v46SummaryText());if(status)status.textContent='Résumé copié dans le presse-papiers.';}catch{if(status)status.textContent='Impossible de copier automatiquement le résumé.';}
}

function v46RoundRect(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function v46CanvasText(ctx,text,x,y,size,weight='400',color='#ffffff',maxWidth){ctx.font=`${weight} ${size}px Inter, Arial, sans-serif`;ctx.fillStyle=color;ctx.fillText(text,x,y,maxWidth);}

async function makeV46CanvasBlob(){
  const s=v46SummaryData(),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;const ctx=canvas.getContext('2d');
  const night=document.body.classList.contains('night')||document.body.classList.contains('v44-night');
  const grad=ctx.createLinearGradient(0,0,1200,1500);grad.addColorStop(0,night?'#111a35':'#6684e8');grad.addColorStop(1,night?'#07101f':'#b8c9ff');ctx.fillStyle=grad;ctx.fillRect(0,0,1200,1500);
  ctx.globalAlpha=.18;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(1030,170,190,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(170,1360,260,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  v46CanvasText(ctx,'RÉSUMÉ MÉTÉO',80,105,30,'700','rgba(255,255,255,.72)');
  v46CanvasText(ctx,s.city,80,180,64,'800');
  v46CanvasText(ctx,s.detail,80,225,28,'400','rgba(255,255,255,.72)',760);
  v46CanvasText(ctx,s.icon,930,210,120,'400');
  v46CanvasText(ctx,v46Fmt(s.temp,'°'),80,420,160,'800');
  v46CanvasText(ctx,s.condition,395,350,42,'700');
  v46CanvasText(ctx,`Ressenti ${v46Fmt(s.feels,'°')}  •  Aujourd’hui ${v46Fmt(s.min,'°')} → ${v46Fmt(s.max,'°')}`,395,405,30,'400','rgba(255,255,255,.78)',690);
  const cells=[['🌧️','Risque pluie',v46Fmt(s.rainProb,' %')],['💨','Vent',v46Fmt(s.wind,' km/h')],['🌬️','Rafales',v46Fmt(s.gust,' km/h')],['💧','Humidité',v46Fmt(s.humidity,' %')],['🌡️','Pression',v46Fmt(s.pressure,' hPa')],['🌬️','Qualité de l’air',Number.isFinite(s.aqi)?`AQI ${Math.round(s.aqi)}`:'--']];
  cells.forEach((cell,i)=>{const col=i%2,row=Math.floor(i/2),x=80+col*530,y=560+row*235;v46RoundRect(ctx,x,y,490,190,34,'rgba(255,255,255,.13)');v46CanvasText(ctx,cell[0],x+32,y+62,42,'400');v46CanvasText(ctx,cell[1],x+92,y+54,25,'600','rgba(255,255,255,.7)');v46CanvasText(ctx,cell[2],x+32,y+135,38,'800');});
  if(s.vigilance){v46RoundRect(ctx,80,1280,1020,90,26,'rgba(255,255,255,.12)');v46CanvasText(ctx,`⚠️ Vigilance Météo-France : ${s.vigilance}`,115,1338,28,'700');}
  v46CanvasText(ctx,`Météo • ${new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium',timeStyle:'short'}).format(s.generated)}`,80,1440,25,'500','rgba(255,255,255,.65)');
  return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));
}

async function exportV46Png(share){
  const status=document.getElementById('v46ExportStatus');if(status)status.textContent='Création de l’image…';
  try{
    const blob=await makeV46CanvasBlob();if(!blob)throw new Error('Image impossible');
    const s=v46SummaryData(),name=`meteo-${String(s.city).toLowerCase().replace(/[^a-z0-9]+/gi,'-')}-${new Date().toISOString().slice(0,10)}.png`;
    const file=new File([blob],name,{type:'image/png'});
    if(share&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:`Météo à ${s.city}`,text:'Résumé météo',files:[file]});if(status)status.textContent='Résumé partagé.';return;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);if(status)status.textContent=share?'Partage de fichier non disponible : image téléchargée à la place.':'Image PNG téléchargée.';
  }catch(error){console.error('V4.6 export',error);if(status)status.textContent='Impossible de créer le résumé pour le moment.';}
}

function printV46Summary(){
  const s=v46SummaryData(),w=window.open('','_blank');if(!w)return;
  const text=v46SummaryText().split('\n').map(x=>`<p>${x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('');
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Météo ${s.city}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:50px auto;padding:30px;color:#172039}h1{font-size:40px;margin-bottom:8px}.card{border:1px solid #d8deef;border-radius:24px;padding:30px;background:#f5f7ff}.icon{font-size:72px;float:right}p{font-size:18px;line-height:1.45;margin:8px 0}@media print{body{margin:0}.card{border:0}}</style></head><body><div class="card"><div class="icon">${s.icon}</div><h1>${s.city}</h1>${text}</div><script>window.onload=()=>setTimeout(()=>window.print(),150)<\/script></body></html>`);w.document.close();
}

function injectV46StatsTab(){
  if(document.getElementById('panel-stats'))return;
  const panel=document.createElement('section');panel.id='panel-stats';panel.className='tab-panel v46-stats-panel';panel.hidden=true;
  panel.innerHTML=`
    <div class="v46-stats-head"><div><span class="section-label">STATISTIQUES</span><h2>30 derniers jours</h2><p class="muted">Historique météo récent jusqu’à hier.</p></div><div class="v46-range-toggle"><button type="button" data-days="7">7 jours</button><button type="button" data-days="30" class="active">30 jours</button></div></div>
    <div id="v46StatsCards" class="v46-stats-cards"><div class="empty-state">Ouvre l’onglet pour charger les statistiques.</div></div>
    <section class="v46-chart-card glass-card"><div class="section-heading"><div><h3>Températures</h3><p class="muted">Minimum, moyenne et maximum par jour</p></div></div><div id="v46TempChart" class="v46-svg-chart"></div></section>
    <section class="v46-chart-card glass-card"><div class="section-heading"><div><h3>Précipitations</h3><p class="muted">Cumul quotidien en millimètres</p></div></div><div id="v46RainChart" class="v46-svg-chart"></div></section>
    <section class="v46-chart-card glass-card"><div class="section-heading"><div><h3>Rafales</h3><p class="muted">Rafale maximale quotidienne</p></div></div><div id="v46WindChart" class="v46-svg-chart"></div></section>
    <section class="v46-records glass-card"><h3>Records de la période</h3><div id="v46Records" class="v46-record-grid"></div></section>`;
  document.querySelector('footer')?.insertAdjacentElement('beforebegin',panel);

  const tabs=document.querySelector('.tabs');
  if(tabs&&!tabs.querySelector('[data-tab="stats"]')){const b=document.createElement('button');b.className='tab';b.type='button';b.dataset.tab='stats';b.textContent='Statistiques';tabs.appendChild(b);b.addEventListener('click',()=>switchV46Tab('stats'));}
  const mobile=document.querySelector('.mobile-bottom-nav');
  if(mobile&&!mobile.querySelector('[data-mobile-tab="stats"]')){const b=document.createElement('button');b.type='button';b.dataset.mobileTab='stats';b.innerHTML='<span>📈</span><small>Stats</small>';mobile.insertBefore(b,mobile.querySelector('[data-mobile-tab="alerts"]'));b.addEventListener('click',()=>switchV46Tab('stats'));}

  document.querySelectorAll('.v46-range-toggle button').forEach(b=>b.addEventListener('click',()=>{v46StatsDays=Number(b.dataset.days)||30;document.querySelectorAll('.v46-range-toggle button').forEach(x=>x.classList.toggle('active',x===b));renderV46Stats(v46StatsData);}));
}

function switchV46Tab(name){
  document.querySelectorAll('.tab-panel').forEach(p=>{const active=p.id===`panel-${name}`;p.classList.toggle('active',active);p.hidden=!active;});
  document.querySelectorAll('.tabs [data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  document.querySelectorAll('.mobile-bottom-nav [data-mobile-tab]').forEach(b=>b.classList.toggle('active',b.dataset.mobileTab===name));
  if(name==='stats')refreshV46Stats(false);
  try{history.replaceState(null,'',name==='weather'?location.pathname:`?tab=${name}`);}catch{}
}

function bindV46PlaceObserver(){
  const place=document.getElementById('placeName');if(!place||!('MutationObserver'in window))return;
  new MutationObserver(()=>{clearTimeout(v46StatsRefreshTimer);v46StatsRefreshTimer=setTimeout(()=>{v46StatsData=null;v46StatsKey='';if(!document.getElementById('panel-stats')?.hidden)refreshV46Stats(true);},600);}).observe(place,{childList:true,characterData:true,subtree:true});
}

function v46IsoDate(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`;}

async function fetchV46Stats(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;
  const key=v46PlaceKey();if(!force&&v46StatsData&&v46StatsKey===key)return v46StatsData;
  const end=new Date();end.setHours(12,0,0,0);end.setDate(end.getDate()-1);const start=new Date(end);start.setDate(start.getDate()-29);
  const url=new URL(V46_STATS_URL);url.searchParams.set('latitude',currentPlace.latitude);url.searchParams.set('longitude',currentPlace.longitude);url.searchParams.set('timezone','auto');url.searchParams.set('start_date',v46IsoDate(start));url.searchParams.set('end_date',v46IsoDate(end));
  url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration');
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`Statistiques ${response.status}`);v46StatsData=await response.json();v46StatsKey=key;return v46StatsData;
}

async function refreshV46Stats(force=false){
  const cards=document.getElementById('v46StatsCards');if(cards)cards.innerHTML='<div class="empty-state">Chargement des 30 derniers jours…</div>';
  try{const data=await fetchV46Stats(force);renderV46Stats(data);}catch(error){console.error('V4.6 stats',error);if(cards)cards.innerHTML='<div class="empty-state">Impossible de charger les statistiques pour le moment.</div>';}
}

function v46SliceDaily(data){
  const d=data?.daily;if(!d?.time?.length)return null;const n=Math.min(v46StatsDays,d.time.length),start=d.time.length-n,out={};Object.keys(d).forEach(k=>{out[k]=Array.isArray(d[k])?d[k].slice(start):d[k];});return out;
}
function v46Avg(arr){const a=(arr||[]).map(Number).filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;}
function v46Sum(arr){return(arr||[]).map(Number).filter(Number.isFinite).reduce((x,y)=>x+y,0);}
function v46Max(arr){const a=(arr||[]).map(Number).filter(Number.isFinite);return a.length?Math.max(...a):NaN;}
function v46Min(arr){const a=(arr||[]).map(Number).filter(Number.isFinite);return a.length?Math.min(...a):NaN;}
function v46DateShort(iso){const d=new Date(`${iso}T12:00:00`);return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(d);}
function v46DateLong(iso){const d=new Date(`${iso}T12:00:00`);return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(d);}

function renderV46Stats(data){
  if(!data)return;const d=v46SliceDaily(data),cards=document.getElementById('v46StatsCards');if(!d?.time?.length)return;
  const avg=Number.isFinite(v46Avg(d.temperature_2m_mean))?v46Avg(d.temperature_2m_mean):(v46Avg(d.temperature_2m_max)+v46Avg(d.temperature_2m_min))/2;
  const rain=v46Sum(d.precipitation_sum),rainDays=(d.precipitation_sum||[]).filter(x=>Number(x)>=0.1).length,gust=v46Max(d.wind_gusts_10m_max),sun=v46Sum(d.sunshine_duration)/3600;
  if(cards)cards.innerHTML=`
    <div class="v46-stat-card glass-card"><span>🌡️ Température moyenne</span><strong>${Number.isFinite(avg)?avg.toFixed(1):'--'} °C</strong><small>${v46Fmt(v46Min(d.temperature_2m_min),'°')} → ${v46Fmt(v46Max(d.temperature_2m_max),'°')}</small></div>
    <div class="v46-stat-card glass-card"><span>🌧️ Pluie cumulée</span><strong>${rain.toFixed(1)} mm</strong><small>${rainDays} jour${rainDays>1?'s':''} avec pluie</small></div>
    <div class="v46-stat-card glass-card"><span>💨 Rafale maximale</span><strong>${Number.isFinite(gust)?Math.round(gust):'--'} km/h</strong><small>Sur ${d.time.length} jours</small></div>
    <div class="v46-stat-card glass-card"><span>☀️ Ensoleillement</span><strong>${sun.toFixed(0)} h</strong><small>${(sun/Math.max(1,d.time.length)).toFixed(1)} h/jour en moyenne</small></div>`;
  renderV46TempChart(d);renderV46BarChart('v46RainChart',d.time,d.precipitation_sum,'mm');renderV46LineChart('v46WindChart',d.time,d.wind_gusts_10m_max,'km/h');renderV46Records(d);
}

function v46ChartDims(){return{w:960,h:300,pL:48,pR:20,pT:25,pB:45};}
function v46SvgWrap(inner){const{w,h}=v46ChartDims();return`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Graphique météo">${inner}</svg>`;}
function v46Grid(min,max){const{w,h,pL,pR,pT,pB}=v46ChartDims(),plotH=h-pT-pB,lines=[];for(let i=0;i<=4;i++){const y=pT+plotH*i/4,val=max-(max-min)*i/4;lines.push(`<line x1="${pL}" x2="${w-pR}" y1="${y}" y2="${y}" class="v46-grid-line"/><text x="${pL-8}" y="${y+5}" text-anchor="end" class="v46-axis-text">${Math.round(val)}</text>`);}return lines.join('');}
function v46Path(values,min,max){const{w,h,pL,pR,pT,pB}=v46ChartDims(),plotW=w-pL-pR,plotH=h-pT-pB,n=Math.max(1,values.length-1);return values.map((v,i)=>{const x=pL+plotW*i/n,y=pT+plotH*(max-Number(v))/Math.max(.001,max-min);return`${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');}
function v46Labels(times){const{w,h,pL,pR}=v46ChartDims(),plotW=w-pL-pR,n=Math.max(1,times.length-1),step=times.length>14?5:Math.max(1,Math.floor(times.length/6));return times.map((t,i)=>i%step===0||i===times.length-1?`<text x="${(pL+plotW*i/n).toFixed(1)}" y="${h-14}" text-anchor="middle" class="v46-axis-text">${v46DateShort(t)}</text>`:'').join('');}

function renderV46TempChart(d){
  const el=document.getElementById('v46TempChart');if(!el)return;const minV=Math.floor(v46Min(d.temperature_2m_min)-2),maxV=Math.ceil(v46Max(d.temperature_2m_max)+2);const mean=(d.temperature_2m_mean||[]).map((v,i)=>Number.isFinite(Number(v))?Number(v):(Number(d.temperature_2m_min[i])+Number(d.temperature_2m_max[i]))/2);
  el.innerHTML=v46SvgWrap(`${v46Grid(minV,maxV)}<path d="${v46Path(d.temperature_2m_min,minV,maxV)}" class="v46-line v46-line-min"/><path d="${v46Path(mean,minV,maxV)}" class="v46-line v46-line-mean"/><path d="${v46Path(d.temperature_2m_max,minV,maxV)}" class="v46-line v46-line-max"/>${v46Labels(d.time)}<g class="v46-legend"><text x="570" y="18">Min</text><text x="660" y="18">Moyenne</text><text x="800" y="18">Max</text></g>`);
}
function renderV46LineChart(id,times,values,unit){
  const el=document.getElementById(id);if(!el)return;const vals=(values||[]).map(Number),min=0,max=Math.max(10,Math.ceil(v46Max(vals)/10)*10);el.innerHTML=v46SvgWrap(`${v46Grid(min,max)}<path d="${v46Path(vals,min,max)}" class="v46-line v46-line-wind"/>${v46Labels(times)}<text x="930" y="18" text-anchor="end" class="v46-axis-text">${unit}</text>`);
}
function renderV46BarChart(id,times,values,unit){
  const el=document.getElementById(id);if(!el)return;const vals=(values||[]).map(x=>Number(x)||0),max=Math.max(2,Math.ceil(v46Max(vals)/2)*2),{w,h,pL,pR,pT,pB}=v46ChartDims(),plotW=w-pL-pR,plotH=h-pT-pB,slot=plotW/Math.max(1,vals.length),barW=Math.max(4,slot*.68);const bars=vals.map((v,i)=>{const bh=plotH*v/max,x=pL+slot*i+(slot-barW)/2,y=pT+plotH-bh;return`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,bh).toFixed(1)}" rx="3" class="v46-rain-bar"><title>${v46DateLong(times[i])} : ${v.toFixed(1)} ${unit}</title></rect>`;}).join('');el.innerHTML=v46SvgWrap(`${v46Grid(0,max)}${bars}${v46Labels(times)}<text x="930" y="18" text-anchor="end" class="v46-axis-text">${unit}</text>`);
}

function renderV46Records(d){
  const el=document.getElementById('v46Records');if(!el)return;
  const find=(arr,type='max')=>{const vals=(arr||[]).map(Number);let idx=-1,best=type==='max'?-Infinity:Infinity;vals.forEach((v,i)=>{if(Number.isFinite(v)&&((type==='max'&&v>best)||(type==='min'&&v<best))){best=v;idx=i;}});return{value:best,index:idx,date:idx>=0?d.time[idx]:null};};
  const hot=find(d.temperature_2m_max),cold=find(d.temperature_2m_min,'min'),wet=find(d.precipitation_sum),windy=find(d.wind_gusts_10m_max);
  el.innerHTML=`<div><span>🔥 Plus chaud</span><strong>${Number.isFinite(hot.value)?Math.round(hot.value):'--'}°</strong><small>${hot.date?v46DateLong(hot.date):'--'}</small></div><div><span>❄️ Plus froid</span><strong>${Number.isFinite(cold.value)?Math.round(cold.value):'--'}°</strong><small>${cold.date?v46DateLong(cold.date):'--'}</small></div><div><span>🌧️ Plus pluvieux</span><strong>${Number.isFinite(wet.value)?wet.value.toFixed(1):'--'} mm</strong><small>${wet.date?v46DateLong(wet.date):'--'}</small></div><div><span>💨 Plus venteux</span><strong>${Number.isFinite(windy.value)?Math.round(windy.value):'--'} km/h</strong><small>${windy.date?v46DateLong(windy.date):'--'}</small></div>`;
}

setTimeout(()=>{const q=new URLSearchParams(location.search);if(q.get('tab')==='stats')switchV46Tab('stats');},900);
