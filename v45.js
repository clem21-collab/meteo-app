const V45_VERSION='4.5';
const V45_ORDER_KEY='meteo-app-home-order-v1';
const V45_HISTORY_URL='https://historical-forecast-api.open-meteo.com/v1/forecast';
const V45_DEFAULT_ORDER=['brief','smart','vigilance','current','hourly','chart','air','history','daily'];
let v45HistoryData=null;
let v45HistoryKey='';
let v45SelectedHistory=-1;
let v45RefreshTimer=null;

const V45_BLOCKS={
  brief:{label:'Aujourd’hui en bref',icon:'📝',get:()=>document.getElementById('v44DailyBrief')},
  smart:{label:'Pluie à court terme',icon:'🌧️',get:()=>document.getElementById('v41SmartSummary')},
  vigilance:{label:'Vigilance Météo-France',icon:'⚠️',get:()=>document.getElementById('v41VigilanceCard')},
  current:{label:'Météo actuelle',icon:'🌡️',get:()=>document.querySelector('#panel-weather > .hero')},
  hourly:{label:'Prochaines heures',icon:'🕐',get:()=>document.getElementById('hourly')?.closest('.section')},
  chart:{label:'Graphique 24 heures',icon:'📊',get:()=>document.getElementById('v41ChartSection')},
  air:{label:'Qualité de l’air & pollen',icon:'🌬️',get:()=>document.getElementById('v44AirSection')},
  history:{label:'Historique 7 jours',icon:'🗓️',get:()=>document.getElementById('v45HistorySection')},
  daily:{label:'Prévisions sur 7 jours',icon:'📅',get:()=>document.getElementById('daily')?.closest('.section')}
};

(function initV45(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v45.css?v=${V45_VERSION}`;document.head.appendChild(css);
  const boot=()=>{
    const panel=document.getElementById('panel-weather');
    if(!panel||typeof currentPlace==='undefined')return setTimeout(boot,250);
    injectV45History(panel);
    injectV45Customize(panel);
    applyV45Order();
    bindV45PlaceObserver();
    setTimeout(()=>refreshV45History(true),350);
  };
  boot();
})();

function v45PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

function readV45Order(){
  try{
    const saved=JSON.parse(localStorage.getItem(V45_ORDER_KEY)||'[]');
    if(Array.isArray(saved)){
      const valid=saved.filter(x=>V45_DEFAULT_ORDER.includes(x));
      V45_DEFAULT_ORDER.forEach(x=>{if(!valid.includes(x))valid.push(x);});
      return valid;
    }
  }catch{}
  return[...V45_DEFAULT_ORDER];
}

function saveV45Order(order){
  try{localStorage.setItem(V45_ORDER_KEY,JSON.stringify(order));}catch{}
}

function applyV45Order(){
  const panel=document.getElementById('panel-weather');if(!panel)return;
  const order=readV45Order();
  order.forEach(key=>{const el=V45_BLOCKS[key]?.get?.();if(el&&el.parentElement===panel)panel.appendChild(el);});
  renderV45OrderList();
}

function injectV45Customize(panel){
  if(document.getElementById('v45CustomizeBar'))return;
  const bar=document.createElement('div');
  bar.id='v45CustomizeBar';bar.className='v45-customize-bar';
  bar.innerHTML=`<button id="v45CustomizeBtn" class="secondary-button" type="button">⚙️ Personnaliser l’accueil</button><small class="muted">L’ordre choisi est mémorisé sur cet appareil.</small>`;
  panel.prepend(bar);

  const modal=document.createElement('div');
  modal.id='v45OrderModal';modal.className='v45-order-modal';modal.hidden=true;
  modal.innerHTML=`<div class="v45-order-backdrop" data-v45-close="1"></div><section class="v45-order-sheet glass-card" role="dialog" aria-modal="true" aria-labelledby="v45OrderTitle"><div class="v45-order-head"><div><span class="section-label">PERSONNALISER</span><h2 id="v45OrderTitle">Ordre de l’accueil</h2><p class="muted">Utilise ↑ et ↓ pour déplacer les blocs.</p></div><button id="v45OrderClose" class="v45-order-close" type="button">✕</button></div><div id="v45OrderList" class="v45-order-list"></div><div class="v45-order-actions"><button id="v45OrderReset" class="secondary-button" type="button">↺ Ordre par défaut</button><button id="v45OrderDone" type="button">Terminé</button></div></section>`;
  document.body.appendChild(modal);
  document.getElementById('v45CustomizeBtn')?.addEventListener('click',openV45OrderModal);
  document.getElementById('v45OrderClose')?.addEventListener('click',closeV45OrderModal);
  document.getElementById('v45OrderDone')?.addEventListener('click',closeV45OrderModal);
  modal.querySelector('[data-v45-close]')?.addEventListener('click',closeV45OrderModal);
  document.getElementById('v45OrderReset')?.addEventListener('click',()=>{saveV45Order([...V45_DEFAULT_ORDER]);applyV45Order();});
}

function openV45OrderModal(){
  renderV45OrderList();
  const modal=document.getElementById('v45OrderModal');if(modal)modal.hidden=false;
  document.body.classList.add('v45-modal-open');
}
function closeV45OrderModal(){const modal=document.getElementById('v45OrderModal');if(modal)modal.hidden=true;document.body.classList.remove('v45-modal-open');}

function renderV45OrderList(){
  const list=document.getElementById('v45OrderList');if(!list)return;
  const order=readV45Order();
  list.innerHTML=order.map((key,index)=>{
    const item=V45_BLOCKS[key];if(!item)return'';
    return`<div class="v45-order-row" data-key="${key}"><span class="v45-order-grip">☰</span><span class="v45-order-name"><b>${item.icon}</b><strong>${item.label}</strong></span><span class="v45-order-buttons"><button type="button" data-move="up" ${index===0?'disabled':''} aria-label="Monter ${item.label}">↑</button><button type="button" data-move="down" ${index===order.length-1?'disabled':''} aria-label="Descendre ${item.label}">↓</button></span></div>`;
  }).join('');
  list.querySelectorAll('[data-move]').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('.v45-order-row'),key=row?.dataset.key;if(!key)return;
    const next=readV45Order(),i=next.indexOf(key),delta=btn.dataset.move==='up'?-1:1,j=i+delta;
    if(i<0||j<0||j>=next.length)return;
    [next[i],next[j]]=[next[j],next[i]];saveV45Order(next);applyV45Order();
  }));
}

function injectV45History(panel){
  if(document.getElementById('v45HistorySection'))return;
  const section=document.createElement('section');
  section.id='v45HistorySection';section.className='section v45-history-section';
  section.innerHTML=`<div class="section-heading"><div><h2>Historique des 7 derniers jours</h2><p class="muted">Jours terminés • jusqu’à hier</p></div><span id="v45HistoryPeriod" class="v45-history-period">Chargement…</span></div><div class="glass-card v45-history-card"><div id="v45HistorySummary" class="v45-history-summary"></div><div id="v45HistoryList" class="v45-history-list"><div class="empty-state">Chargement de l’historique…</div></div><div id="v45HistoryDetail" class="v45-history-detail" hidden></div><small class="muted v45-history-source">Historique météo récent basé sur les prévisions archivées Open‑Meteo.</small></div>`;
  const daily=document.getElementById('daily')?.closest('.section');
  if(daily)daily.insertAdjacentElement('beforebegin',section);else panel.appendChild(section);
}

function v45IsoDate(date){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`;
}

async function fetchV45History(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;
  const key=v45PlaceKey();if(!force&&v45HistoryData&&v45HistoryKey===key)return v45HistoryData;
  const end=new Date();end.setHours(12,0,0,0);end.setDate(end.getDate()-1);
  const start=new Date(end);start.setDate(start.getDate()-6);
  const url=new URL(V45_HISTORY_URL);
  url.searchParams.set('latitude',currentPlace.latitude);url.searchParams.set('longitude',currentPlace.longitude);url.searchParams.set('timezone','auto');
  url.searchParams.set('start_date',v45IsoDate(start));url.searchParams.set('end_date',v45IsoDate(end));
  url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,snowfall_sum,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunshine_duration');
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`Historique ${response.status}`);
  v45HistoryData=await response.json();v45HistoryKey=key;return v45HistoryData;
}

function v45Weather(code){
  try{if(typeof weatherInfo==='function')return weatherInfo(Number(code),1);}catch{}
  return['🌤️','Conditions variables'];
}
function v45Day(date){const d=new Date(`${date}T12:00:00`);return new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'2-digit',month:'2-digit'}).format(d).replace(/^./,c=>c.toUpperCase());}
function v45LongDay(date){const d=new Date(`${date}T12:00:00`);return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(d).replace(/^./,c=>c.toUpperCase());}
function v45Direction(deg){const n=Number(deg);if(!Number.isFinite(n))return'--';const dirs=['N','NE','E','SE','S','SO','O','NO'];return`${dirs[Math.round((((n%360)+360)%360)/45)%8]} • ${Math.round(((n%360)+360)%360)}°`;}
function v45Hours(seconds){const n=Number(seconds);if(!Number.isFinite(n))return'--';const h=Math.floor(n/3600),m=Math.round((n%3600)/60);return m?`${h} h ${m} min`:`${h} h`;}

function renderV45History(data){
  const d=data?.daily,list=document.getElementById('v45HistoryList'),summary=document.getElementById('v45HistorySummary'),period=document.getElementById('v45HistoryPeriod');
  if(!d?.time?.length){if(list)list.innerHTML='<div class="empty-state">Historique indisponible.</div>';return;}
  const tempsMax=d.temperature_2m_max.map(Number).filter(Number.isFinite),tempsMin=d.temperature_2m_min.map(Number).filter(Number.isFinite),rain=d.precipitation_sum.map(x=>Number(x)||0),gusts=d.wind_gusts_10m_max.map(Number).filter(Number.isFinite);
  const rainTotal=rain.reduce((a,b)=>a+b,0),avgMax=tempsMax.reduce((a,b)=>a+b,0)/Math.max(1,tempsMax.length),avgMin=tempsMin.reduce((a,b)=>a+b,0)/Math.max(1,tempsMin.length),maxGust=gusts.length?Math.max(...gusts):NaN;
  let todayCompare='';
  try{const td=currentData?.daily,tmx=Number(td?.temperature_2m_max?.[0]),tp=Number(td?.precipitation_probability_max?.[0]);if(Number.isFinite(tmx))todayCompare=`Aujourd’hui : ${Math.round(tmx)}° max (${tmx>=avgMax?'+':''}${Math.round(tmx-avgMax)}° vs moyenne récente)${Number.isFinite(tp)?` • pluie ${Math.round(tp)} %`:''}`;}catch{}
  if(summary)summary.innerHTML=`<div><span>🌡️ Moyenne</span><strong>${Math.round(avgMin)}° → ${Math.round(avgMax)}°</strong></div><div><span>🌧️ Pluie totale</span><strong>${rainTotal.toFixed(1)} mm</strong></div><div><span>💨 Rafale max</span><strong>${Number.isFinite(maxGust)?Math.round(maxGust):'--'} km/h</strong></div>${todayCompare?`<p>${todayCompare}</p>`:''}`;
  if(period)period.textContent=`${v45Day(d.time[0])} → ${v45Day(d.time.at(-1))}`;
  if(list)list.innerHTML=d.time.map((date,i)=>{const [icon,label]=v45Weather(d.weather_code?.[i]);const min=Number(d.temperature_2m_min?.[i]),max=Number(d.temperature_2m_max?.[i]),p=Number(d.precipitation_sum?.[i]||0),g=Number(d.wind_gusts_10m_max?.[i]);return`<button class="v45-history-row" type="button" data-index="${i}"><span class="v45-history-day"><b>${v45Day(date)}</b><small>${label}</small></span><span class="v45-history-icon">${icon}</span><span><b>${Number.isFinite(min)?Math.round(min):'--'}° / ${Number.isFinite(max)?Math.round(max):'--'}°</b><small>min / max</small></span><span><b>💧 ${p.toFixed(1)} mm</b><small>précipitations</small></span><span><b>💨 ${Number.isFinite(g)?Math.round(g):'--'}</b><small>km/h rafales</small></span><i>›</i></button>`;}).join('');
  document.querySelectorAll('.v45-history-row').forEach(row=>row.addEventListener('click',()=>openV45HistoryDetail(Number(row.dataset.index),row)));
}

function openV45HistoryDetail(i,row){
  const d=v45HistoryData?.daily,detail=document.getElementById('v45HistoryDetail');if(!d?.time?.[i]||!detail)return;
  if(v45SelectedHistory===i&&!detail.hidden){detail.hidden=true;v45SelectedHistory=-1;document.querySelectorAll('.v45-history-row').forEach(r=>r.classList.remove('active'));return;}
  v45SelectedHistory=i;document.querySelectorAll('.v45-history-row').forEach(r=>r.classList.toggle('active',r===row));
  const [,label]=v45Weather(d.weather_code?.[i]);
  const min=Number(d.temperature_2m_min?.[i]),max=Number(d.temperature_2m_max?.[i]),feelMin=Number(d.apparent_temperature_min?.[i]),feelMax=Number(d.apparent_temperature_max?.[i]);
  const precip=Number(d.precipitation_sum?.[i]||0),rain=Number(d.rain_sum?.[i]||0),snow=Number(d.snowfall_sum?.[i]||0),hours=Number(d.precipitation_hours?.[i]||0);
  const wind=Number(d.wind_speed_10m_max?.[i]),gust=Number(d.wind_gusts_10m_max?.[i]),sun=Number(d.sunshine_duration?.[i]);
  detail.hidden=false;detail.innerHTML=`<div class="v45-history-detail-head"><div><span class="section-label">HISTORIQUE DU JOUR</span><h3>${v45LongDay(d.time[i])}</h3><p class="muted">${label}</p></div><button type="button" id="v45HistoryClose">✕</button></div><div class="v45-history-detail-grid"><div><span>🌡️ Température</span><strong>${Number.isFinite(min)?Math.round(min):'--'}° → ${Number.isFinite(max)?Math.round(max):'--'}°</strong><small>Ressenti ${Number.isFinite(feelMin)?Math.round(feelMin):'--'}° → ${Number.isFinite(feelMax)?Math.round(feelMax):'--'}°</small></div><div><span>🌧️ Précipitations</span><strong>${precip.toFixed(1)} mm</strong><small>Pluie ${rain.toFixed(1)} mm • ${hours.toFixed(1)} h</small></div><div><span>💨 Vent</span><strong>${Number.isFinite(wind)?Math.round(wind):'--'} km/h</strong><small>Rafales ${Number.isFinite(gust)?Math.round(gust):'--'} km/h</small></div><div><span>🧭 Direction</span><strong>${v45Direction(d.wind_direction_10m_dominant?.[i])}</strong><small>Direction dominante</small></div><div><span>☀️ Ensoleillement</span><strong>${v45Hours(sun)}</strong><small>Durée estimée</small></div><div><span>❄️ Neige</span><strong>${snow.toFixed(1)} cm</strong><small>Cumul estimé</small></div></div>`;
  document.getElementById('v45HistoryClose')?.addEventListener('click',()=>{detail.hidden=true;v45SelectedHistory=-1;document.querySelectorAll('.v45-history-row').forEach(r=>r.classList.remove('active'));});
  try{detail.scrollIntoView({behavior:'smooth',block:'nearest'});}catch{}
}

async function refreshV45History(force=false){
  try{const data=await fetchV45History(force);renderV45History(data);}catch(error){console.warn('V4.5 history',error);const list=document.getElementById('v45HistoryList');if(list)list.innerHTML='<div class="empty-state">Impossible de charger l’historique récent.</div>';}
}

function bindV45PlaceObserver(){
  const place=document.getElementById('placeName');if(!place||!('MutationObserver'in window))return;
  new MutationObserver(()=>{clearTimeout(v45RefreshTimer);v45RefreshTimer=setTimeout(()=>{v45HistoryData=null;v45HistoryKey='';v45SelectedHistory=-1;const detail=document.getElementById('v45HistoryDetail');if(detail)detail.hidden=true;refreshV45History(true);},500);}).observe(place,{childList:true,characterData:true,subtree:true});
}
