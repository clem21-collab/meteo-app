const V43_VERSION='4.3';
const V43_FORECAST_URL=typeof FORECAST_URL!=='undefined'?FORECAST_URL:'https://api.open-meteo.com/v1/forecast';
let v43DailyDetails=null;
let v43DailyKey='';
let v43SelectedIndex=-1;

(function initV43(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v43.css?v=${V43_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    const daily=document.getElementById('daily');
    if(!daily||typeof currentPlace==='undefined')return setTimeout(boot,250);
    injectV43DetailPanel(daily);
    bindV43DailyRows();
    observeV43Daily();
    observeV43Place();
    if(typeof currentPlace!=='undefined'&&currentPlace)fetchV43DailyDetails(false).catch(()=>{});
  };
  boot();
})();

function v43PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return`${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

function injectV43DetailPanel(daily){
  if(document.getElementById('v43DailyDetail'))return;
  const panel=document.createElement('div');
  panel.id='v43DailyDetail';
  panel.className='v43-day-detail glass-card';
  panel.hidden=true;
  panel.innerHTML=`
    <div class="v43-detail-head">
      <div>
        <span class="section-label">DÉTAIL DE LA JOURNÉE</span>
        <h3 id="v43DetailTitle">--</h3>
        <p id="v43DetailCondition" class="muted">Chargement…</p>
      </div>
      <button id="v43DetailClose" class="v43-detail-close" type="button" aria-label="Fermer le détail">✕</button>
    </div>
    <div id="v43DetailSummary" class="v43-summary"></div>
    <div id="v43DetailGrid" class="v43-detail-grid"></div>`;
  daily.insertAdjacentElement('afterend',panel);
  document.getElementById('v43DetailClose')?.addEventListener('click',closeV43DailyDetail);
}

function bindV43DailyRows(){
  const daily=document.getElementById('daily');
  if(!daily)return;
  [...daily.querySelectorAll('.day-row')].forEach((row,index)=>{
    row.classList.add('v43-day-clickable');
    row.setAttribute('role','button');
    row.setAttribute('tabindex','0');
    row.setAttribute('aria-label',`${row.querySelector('.day')?.textContent||'Jour'} — afficher les détails`);
    row.dataset.dailyIndex=String(index);
    if(row.dataset.v43Bound==='1')return;
    row.dataset.v43Bound='1';
    row.addEventListener('click',()=>openV43DailyDetail(index,row));
    row.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();openV43DailyDetail(index,row);}
    });
  });
}

function observeV43Daily(){
  const daily=document.getElementById('daily');
  if(!daily||!('MutationObserver'in window))return;
  new MutationObserver(()=>{
    closeV43DailyDetail();
    setTimeout(bindV43DailyRows,0);
  }).observe(daily,{childList:true});
}

function observeV43Place(){
  const place=document.getElementById('placeName');
  if(!place||!('MutationObserver'in window))return;
  let timer=null;
  new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      v43DailyDetails=null;v43DailyKey='';closeV43DailyDetail();
      fetchV43DailyDetails(true).catch(()=>{});
    },400);
  }).observe(place,{childList:true,characterData:true,subtree:true});
}

async function fetchV43DailyDetails(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return null;
  const key=v43PlaceKey();
  if(!force&&v43DailyDetails&&v43DailyKey===key)return v43DailyDetails;
  const url=new URL(V43_FORECAST_URL);
  url.searchParams.set('latitude',currentPlace.latitude);
  url.searchParams.set('longitude',currentPlace.longitude);
  url.searchParams.set('timezone','auto');
  url.searchParams.set('forecast_days','7');
  url.searchParams.set('daily','weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset,daylight_duration,sunshine_duration');
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Détails journaliers ${response.status}`);
  v43DailyDetails=await response.json();v43DailyKey=key;
  return v43DailyDetails;
}

function v43Direction(deg){
  const n=Number(deg);
  if(!Number.isFinite(n))return{short:'--',label:'Indisponible',degrees:null};
  const d=((n%360)+360)%360;
  const dirs=[['N','Nord'],['NE','Nord-Est'],['E','Est'],['SE','Sud-Est'],['S','Sud'],['SO','Sud-Ouest'],['O','Ouest'],['NO','Nord-Ouest']];
  const item=dirs[Math.round(d/45)%8];
  return{short:item[0],label:item[1],degrees:Math.round(d)};
}

function v43WeatherLabel(code){
  try{if(typeof weatherInfo==='function')return weatherInfo(Number(code),1)[1];}catch{}
  return'Conditions prévues';
}

function v43DayLabel(date,index){
  const d=new Date(`${date}T12:00:00`);
  const label=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(d);
  const pretty=label.replace(/^./,c=>c.toUpperCase());
  return index===0?`Aujourd’hui • ${pretty}`:pretty;
}

function v43Hour(iso){
  if(!iso)return'--:--';
  const d=new Date(iso);
  return Number.isNaN(d.getTime())?'--:--':new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(d);
}

function v43Hours(seconds){
  const n=Number(seconds);
  if(!Number.isFinite(n))return'--';
  const hours=Math.floor(n/3600),minutes=Math.round((n%3600)/60);
  return minutes?`${hours} h ${minutes} min`:`${hours} h`;
}

function v43Summary(d,i){
  const rainProb=Number(d.precipitation_probability_max?.[i]||0);
  const precip=Number(d.precipitation_sum?.[i]||0);
  const gust=Number(d.wind_gusts_10m_max?.[i]||0);
  const uv=Number(d.uv_index_max?.[i]||0);
  if(precip>=10)return{emoji:'🌧️',text:`Journée très humide : environ ${precip.toFixed(1)} mm de précipitations prévus.`};
  if(precip>=2)return{emoji:'🌦️',text:`Pluie probable dans la journée : jusqu’à ${Math.round(rainProb)} % de risque.`};
  if(gust>=60)return{emoji:'💨',text:`Journée assez venteuse avec des rafales pouvant atteindre ${Math.round(gust)} km/h.`};
  if(uv>=6)return{emoji:'☀️',text:`UV élevés avec un indice maximal prévu autour de ${uv.toFixed(1)}.`};
  if(rainProb<20)return{emoji:'🌤️',text:'Journée globalement sèche selon les prévisions actuelles.'};
  return{emoji:'🌦️',text:`Conditions variables avec un risque de pluie maximal de ${Math.round(rainProb)} %.`};
}

async function openV43DailyDetail(index,row){
  if(!Number.isFinite(index)||index<0)return;
  const panel=document.getElementById('v43DailyDetail');
  if(!panel)return;
  if(v43SelectedIndex===index&&!panel.hidden){closeV43DailyDetail();return;}
  v43SelectedIndex=index;
  document.querySelectorAll('#daily .day-row').forEach(r=>r.classList.toggle('v43-selected',r===row));
  panel.hidden=false;
  const title=document.getElementById('v43DetailTitle'),condition=document.getElementById('v43DetailCondition'),summary=document.getElementById('v43DetailSummary'),grid=document.getElementById('v43DetailGrid');
  if(title)title.textContent=row?.querySelector('.day')?.textContent||'Prévision du jour';
  if(condition)condition.textContent='Chargement des détails…';
  if(summary)summary.innerHTML='';
  if(grid)grid.innerHTML='<div class="v43-loading">Récupération des prévisions détaillées…</div>';
  try{panel.scrollIntoView({behavior:'smooth',block:'nearest'});}catch{}

  try{
    await fetchV43DailyDetails(false);
    if(v43SelectedIndex!==index)return;
    const d=v43DailyDetails?.daily;
    if(!d?.time?.[index])throw new Error('Jour introuvable');

    const tempMax=Number(d.temperature_2m_max?.[index]),tempMin=Number(d.temperature_2m_min?.[index]);
    const feelsMax=Number(d.apparent_temperature_max?.[index]),feelsMin=Number(d.apparent_temperature_min?.[index]);
    const precip=Number(d.precipitation_sum?.[index]),rain=Number(d.rain_sum?.[index]),showers=Number(d.showers_sum?.[index]),snow=Number(d.snowfall_sum?.[index]);
    const rainHours=Number(d.precipitation_hours?.[index]),rainProb=Number(d.precipitation_probability_max?.[index]);
    const wind=Number(d.wind_speed_10m_max?.[index]),gust=Number(d.wind_gusts_10m_max?.[index]),dir=v43Direction(d.wind_direction_10m_dominant?.[index]);
    const uv=Number(d.uv_index_max?.[index]),sunshine=Number(d.sunshine_duration?.[index]),daylight=Number(d.daylight_duration?.[index]);
    const sunrise=d.sunrise?.[index],sunset=d.sunset?.[index],weather=v43WeatherLabel(d.weather_code?.[index]);
    const daySummary=v43Summary(d,index);

    if(title)title.textContent=v43DayLabel(d.time[index],index);
    if(condition)condition.textContent=weather;
    if(summary)summary.innerHTML=`<span>${daySummary.emoji}</span><strong>${daySummary.text}</strong>`;
    if(grid)grid.innerHTML=`
      <div class="v43-metric"><span>🌡️ Températures</span><strong>${Number.isFinite(tempMin)?Math.round(tempMin):'--'}° → ${Number.isFinite(tempMax)?Math.round(tempMax):'--'}°</strong><small>Ressenti ${Number.isFinite(feelsMin)?Math.round(feelsMin):'--'}° → ${Number.isFinite(feelsMax)?Math.round(feelsMax):'--'}°</small></div>
      <div class="v43-metric"><span>🌧️ Précipitations</span><strong>${Number.isFinite(precip)?precip.toFixed(1):'--'} mm</strong><small>Risque max ${Number.isFinite(rainProb)?Math.round(rainProb):'--'} % • ${Number.isFinite(rainHours)?rainHours.toFixed(1):'--'} h</small></div>
      <div class="v43-metric"><span>💧 Détail pluie</span><strong>${Number.isFinite(rain)?rain.toFixed(1):'--'} mm</strong><small>Averses ${Number.isFinite(showers)?showers.toFixed(1):'--'} mm${Number.isFinite(snow)&&snow>0?` • neige ${snow.toFixed(1)} cm`:''}</small></div>
      <div class="v43-metric"><span>💨 Vent maximal</span><strong>${Number.isFinite(wind)?Math.round(wind):'--'} km/h</strong><small>Rafales ${Number.isFinite(gust)?Math.round(gust):'--'} km/h</small></div>
      <div class="v43-metric v43-wind-direction"><span>🧭 Direction dominante</span><strong><b class="v43-wind-arrow" style="transform:rotate(${Number.isFinite(dir.degrees)?dir.degrees:0}deg)">↑</b> ${dir.short}</strong><small>${dir.label}${Number.isFinite(dir.degrees)?` • ${dir.degrees}°`:''}</small></div>
      <div class="v43-metric"><span>☀️ Indice UV max</span><strong>${Number.isFinite(uv)?uv.toFixed(1):'--'}</strong><small>Maximum prévu dans la journée</small></div>
      <div class="v43-metric"><span>🌅 Lever du soleil</span><strong>${v43Hour(sunrise)}</strong><small>Coucher ${v43Hour(sunset)}</small></div>
      <div class="v43-metric"><span>✨ Ensoleillement</span><strong>${v43Hours(sunshine)}</strong><small>Durée du jour ${v43Hours(daylight)}</small></div>`;
  }catch(error){
    console.error('V4.3 daily detail',error);
    if(condition)condition.textContent='Détails indisponibles pour cette journée.';
    if(grid)grid.innerHTML='<div class="v43-loading">Impossible de charger les détails de cette journée.</div>';
  }
}

function closeV43DailyDetail(){
  v43SelectedIndex=-1;
  document.querySelectorAll('#daily .day-row').forEach(r=>r.classList.remove('v43-selected'));
  const panel=document.getElementById('v43DailyDetail');if(panel)panel.hidden=true;
}
