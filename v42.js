const V42_VERSION='4.2';
const V42_FORECAST_URL=typeof FORECAST_URL!=='undefined'?FORECAST_URL:'https://api.open-meteo.com/v1/forecast';
let v42HourlyDetails=null;
let v42HourlyKey='';
let v42SelectedIndex=-1;

(function initV42(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v42.css?v=${V42_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    const hourly=document.getElementById('hourly');
    if(!hourly||typeof currentPlace==='undefined')return setTimeout(boot,250);
    injectV42DetailPanel(hourly);
    bindV42HourlyCards();
    observeV42Hourly();
    observeV42Place();
    if(typeof currentPlace!=='undefined'&&currentPlace)fetchV42HourlyDetails(false).catch(()=>{});
  };
  boot();
})();

function v42PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

function injectV42DetailPanel(hourly){
  if(document.getElementById('v42HourlyDetail'))return;
  const panel=document.createElement('div');
  panel.id='v42HourlyDetail';
  panel.className='v42-hour-detail glass-card';
  panel.hidden=true;
  panel.innerHTML=`
    <div class="v42-detail-head">
      <div>
        <span class="section-label">DÉTAIL DE L’HEURE</span>
        <h3 id="v42DetailTitle">--:--</h3>
        <p id="v42DetailCondition" class="muted">Chargement…</p>
      </div>
      <button id="v42DetailClose" class="v42-detail-close" type="button" aria-label="Fermer le détail">✕</button>
    </div>
    <div id="v42DetailGrid" class="v42-detail-grid"></div>`;
  hourly.insertAdjacentElement('afterend',panel);
  document.getElementById('v42DetailClose')?.addEventListener('click',closeV42HourlyDetail);
}

function baseV42HourlyStart(){
  if(typeof currentData==='undefined'||!currentData?.hourly?.time?.length)return 0;
  const now=new Date(currentData.current?.time||Date.now()).getTime();
  let start=currentData.hourly.time.findIndex(t=>new Date(t).getTime()>=now);
  return start<0?0:start;
}

function bindV42HourlyCards(){
  const hourly=document.getElementById('hourly');
  if(!hourly)return;
  const start=baseV42HourlyStart();
  [...hourly.querySelectorAll('.hour-card')].forEach((card,displayIndex)=>{
    card.classList.add('v42-hour-clickable');
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');
    card.setAttribute('aria-label',`${card.querySelector('.time')?.textContent||'Heure'} — afficher les détails`);
    card.dataset.hourlyIndex=String(start+displayIndex);
    if(card.dataset.v42Bound==='1')return;
    card.dataset.v42Bound='1';
    card.addEventListener('click',()=>openV42HourlyDetail(Number(card.dataset.hourlyIndex),card));
    card.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();openV42HourlyDetail(Number(card.dataset.hourlyIndex),card);}
    });
  });
}

function observeV42Hourly(){
  const hourly=document.getElementById('hourly');
  if(!hourly||!('MutationObserver'in window))return;
  new MutationObserver(()=>{
    closeV42HourlyDetail();
    setTimeout(bindV42HourlyCards,0);
  }).observe(hourly,{childList:true});
}

function observeV42Place(){
  const place=document.getElementById('placeName');
  if(!place||!('MutationObserver'in window))return;
  let timer=null;
  new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      v42HourlyDetails=null;v42HourlyKey='';closeV42HourlyDetail();
      fetchV42HourlyDetails(true).catch(()=>{});
    },400);
  }).observe(place,{childList:true,characterData:true,subtree:true});
}

async function fetchV42HourlyDetails(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;
  const key=v42PlaceKey();
  if(!force&&v42HourlyDetails&&v42HourlyKey===key)return v42HourlyDetails;
  const url=new URL(V42_FORECAST_URL);
  url.searchParams.set('latitude',currentPlace.latitude);
  url.searchParams.set('longitude',currentPlace.longitude);
  url.searchParams.set('timezone','auto');
  url.searchParams.set('forecast_days','2');
  url.searchParams.set('hourly','temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index');
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Détails horaires ${response.status}`);
  v42HourlyDetails=await response.json();v42HourlyKey=key;
  return v42HourlyDetails;
}

function v42Direction(deg){
  const n=Number(deg);
  if(!Number.isFinite(n))return{short:'--',label:'Indisponible',arrow:'↑'};
  const d=((n%360)+360)%360;
  const dirs=[['N','Nord'],['NE','Nord-Est'],['E','Est'],['SE','Sud-Est'],['S','Sud'],['SO','Sud-Ouest'],['O','Ouest'],['NO','Nord-Ouest']];
  const item=dirs[Math.round(d/45)%8];
  return{short:item[0],label:item[1],arrow:'↑',degrees:Math.round(d)};
}

function v42FindDetailIndex(time){
  const times=v42HourlyDetails?.hourly?.time||[];
  if(!time||!times.length)return-1;
  let exact=times.indexOf(time);if(exact>=0)return exact;
  const target=new Date(time).getTime();let best=-1,diff=Infinity;
  times.forEach((t,i)=>{const d=Math.abs(new Date(t).getTime()-target);if(d<diff){diff=d;best=i;}});
  return best;
}

function v42WeatherLabel(code){
  try{if(typeof weatherInfo==='function')return weatherInfo(Number(code),1)[1];}catch{}
  return'Conditions prévues';
}

function v42HourLabel(time){
  const d=new Date(time);
  return new Intl.DateTimeFormat('fr-FR',{weekday:'long',hour:'2-digit',minute:'2-digit'}).format(d).replace(/^./,c=>c.toUpperCase());
}

async function openV42HourlyDetail(baseIndex,card){
  if(!Number.isFinite(baseIndex)||typeof currentData==='undefined'||!currentData?.hourly?.time?.[baseIndex])return;
  if(v42SelectedIndex===baseIndex&&!document.getElementById('v42HourlyDetail')?.hidden){closeV42HourlyDetail();return;}
  v42SelectedIndex=baseIndex;
  document.querySelectorAll('#hourly .hour-card').forEach(c=>c.classList.toggle('v42-selected',c===card));
  const panel=document.getElementById('v42HourlyDetail');
  if(!panel)return;
  panel.hidden=false;
  const time=currentData.hourly.time[baseIndex];
  const title=document.getElementById('v42DetailTitle'),condition=document.getElementById('v42DetailCondition'),grid=document.getElementById('v42DetailGrid');
  if(title)title.textContent=v42HourLabel(time);
  if(condition)condition.textContent='Chargement des détails…';
  if(grid)grid.innerHTML='<div class="v42-loading">Récupération de la pluie et du vent…</div>';
  try{panel.scrollIntoView({behavior:'smooth',block:'nearest'});}catch{}

  try{
    await fetchV42HourlyDetails(false);
    if(v42SelectedIndex!==baseIndex)return;
    const i=v42FindDetailIndex(time),h=v42HourlyDetails?.hourly;
    if(i<0||!h)throw new Error('Heure introuvable');
    const temp=Number(h.temperature_2m?.[i]),feels=Number(h.apparent_temperature?.[i]),humidity=Number(h.relative_humidity_2m?.[i]);
    const rainProb=Number(h.precipitation_probability?.[i]),precip=Number(h.precipitation?.[i]??0),rain=Number(h.rain?.[i]??0);
    const wind=Number(h.wind_speed_10m?.[i]),gust=Number(h.wind_gusts_10m?.[i]),dir=v42Direction(h.wind_direction_10m?.[i]);
    const uv=Number(h.uv_index?.[i]),weather=v42WeatherLabel(h.weather_code?.[i]);
    if(condition)condition.textContent=weather;
    if(grid)grid.innerHTML=`
      <div class="v42-metric"><span>🌡️ Température</span><strong>${Number.isFinite(temp)?temp.toFixed(1):'--'} °C</strong><small>Ressenti ${Number.isFinite(feels)?feels.toFixed(1):'--'} °C</small></div>
      <div class="v42-metric"><span>🌧️ Pluie prévue</span><strong>${Number.isFinite(precip)?precip.toFixed(1):'--'} mm</strong><small>dont pluie ${Number.isFinite(rain)?rain.toFixed(1):'--'} mm • risque ${Number.isFinite(rainProb)?Math.round(rainProb):'--'} %</small></div>
      <div class="v42-metric"><span>💨 Vitesse du vent</span><strong>${Number.isFinite(wind)?Math.round(wind):'--'} km/h</strong><small>Rafales ${Number.isFinite(gust)?Math.round(gust):'--'} km/h</small></div>
      <div class="v42-metric v42-wind-direction"><span>🧭 Direction du vent</span><strong><b class="v42-wind-arrow" style="transform:rotate(${Number.isFinite(dir.degrees)?dir.degrees:0}deg)">↑</b> ${dir.short}</strong><small>${dir.label}${Number.isFinite(dir.degrees)?` • ${dir.degrees}°`:''}</small></div>
      <div class="v42-metric"><span>💧 Humidité</span><strong>${Number.isFinite(humidity)?Math.round(humidity):'--'} %</strong><small>Humidité relative</small></div>
      <div class="v42-metric"><span>☀️ Indice UV</span><strong>${Number.isFinite(uv)?uv.toFixed(1):'--'}</strong><small>Prévision horaire</small></div>`;
  }catch(error){
    console.error('V4.2 hourly detail',error);
    if(condition)condition.textContent='Détails indisponibles pour cette heure.';
    if(grid)grid.innerHTML='<div class="v42-loading">Impossible de charger les détails météo.</div>';
  }
}

function closeV42HourlyDetail(){
  v42SelectedIndex=-1;
  document.querySelectorAll('#hourly .hour-card').forEach(c=>c.classList.remove('v42-selected'));
  const panel=document.getElementById('v42HourlyDetail');if(panel)panel.hidden=true;
}
