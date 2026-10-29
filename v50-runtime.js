// V5.0 runtime refinements loaded after the main V5 layer.
(function initV50Runtime(){
  patchV50CompareFetch();
  patchV50StatsUnits();
  patchV50OfflineSave();
  injectV50AlertPreview();
})();

function patchV50CompareFetch(){
  try{fetchV50ComparePlace=async function(p){const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',p.latitude);u.searchParams.set('longitude',p.longitude);u.searchParams.set('timezone','auto');u.searchParams.set('forecast_days','2');u.searchParams.set('current','temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m');u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum');const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(`Météo indisponible pour ${p.name}`);return{place:p,data:await r.json()};};}catch{}
}

function patchV50StatsUnits(){
  try{
    const original=renderV46Stats;
    renderV46Stats=function(data){
      const u=v50Units(),clone=JSON.parse(JSON.stringify(data||{})),d=clone?.daily||{};
      if(u.temp==='f'){['temperature_2m_min','temperature_2m_max','temperature_2m_mean'].forEach(k=>{if(Array.isArray(d[k]))d[k]=d[k].map(v=>Number.isFinite(Number(v))?Number(v)*9/5+32:v);});}
      if(u.wind==='ms'){['wind_speed_10m_max','wind_gusts_10m_max'].forEach(k=>{if(Array.isArray(d[k]))d[k]=d[k].map(v=>Number.isFinite(Number(v))?Number(v)/3.6:v);});}
      const r=original(clone),panel=document.getElementById('panel-stats');
      if(panel){const walker=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(n=>{let t=n.nodeValue;if(u.temp==='f')t=t.replace(/°C/g,'°F');if(u.wind==='ms')t=t.replace(/km\/h/g,'m/s');n.nodeValue=t;});}
      return r;
    };
  }catch{}
  try{const originalMonth=renderV50MonthComparison;renderV50MonthComparison=function(data){const r=originalMonth(data);v50ConvertRenderedText(document.getElementById('v50MonthCompare'));return r;};}catch{}
}

function patchV50OfflineSave(){
  try{const old=renderCurrent;renderCurrent=function(...args){const r=old(...args);setTimeout(()=>saveV50OfflineSnapshot?.(),0);return r;};}catch{}
}

function injectV50AlertPreview(){
  const panel=document.getElementById('panel-alerts');if(!panel||document.getElementById('v50PredictiveAlerts'))return;
  const card=document.createElement('article');card.id='v50PredictiveAlerts';card.className='glass-card v50-predictive-alerts';card.innerHTML='<div class="section-heading"><div><h3>Alertes intelligentes V5</h3><p class="muted">Gel, chaleur, rafales et orages anticipés</p></div><button id="v50PredictiveRefresh" class="secondary-button" type="button">↻</button></div><div id="v50PredictiveList"><div class="empty-state">Analyse des prochaines heures…</div></div>';
  const grid=panel.querySelector('.alerts-grid');grid?.insertAdjacentElement('beforebegin',card);
  document.getElementById('v50PredictiveRefresh')?.addEventListener('click',refreshV50PredictiveAlerts);
  document.querySelectorAll('[data-tab="alerts"],[data-mobile-tab="alerts"]').forEach(b=>b.addEventListener('click',()=>setTimeout(refreshV50PredictiveAlerts,150)));
  setTimeout(refreshV50PredictiveAlerts,800);
}

async function refreshV50PredictiveAlerts(){
  const box=document.getElementById('v50PredictiveList');if(!box||!currentPlace)return;box.innerHTML='<div class="empty-state">Analyse des prochaines heures…</div>';
  try{
    const data=typeof fetchV42HourlyDetails==='function'?await fetchV42HourlyDetails(false):null,h=data?.hourly;if(!h?.time?.length)throw new Error();
    const s=readV50Settings(),now=Date.now();let start=h.time.findIndex(t=>new Date(t).getTime()>=now-3600000);if(start<0)start=0;const lead=Math.max(1,Math.min(12,Number(s.smartLeadHours||6))),end=Math.min(h.time.length,start+Math.max(12,lead)+1),items=[];
    const first=(limit,pred)=>{for(let i=start;i<Math.min(end,start+limit+1);i++)if(pred(i))return i;return-1;},time=i=>new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(new Date(h.time[i]));
    if(s.frost!==false){const i=first(12,j=>Number(h.temperature_2m?.[j])<=Number(s.frostThreshold??0));if(i>=0)items.push(['❄️','Gel possible',`${Math.round(Number(h.temperature_2m[i]))} °C vers ${time(i)}`,'high']);}
    if(s.heat!==false){const i=first(12,j=>Number(h.temperature_2m?.[j])>=Number(s.heatThreshold??30));if(i>=0)items.push(['🌡️','Chaleur à surveiller',`${Math.round(Number(h.temperature_2m[i]))} °C vers ${time(i)}`,'medium']);}
    if(s.smartWind!==false){const threshold=Number(document.getElementById('windThreshold')?.value||60),i=first(lead,j=>Number(h.wind_gusts_10m?.[j])>=threshold);if(i>=0)items.push(['💨','Fortes rafales',`${Math.round(Number(h.wind_gusts_10m[i]))} km/h vers ${time(i)}`,'high']);}
    if(s.smartStorm!==false){const i=first(lead,j=>[95,96,99].includes(Number(h.weather_code?.[j])));if(i>=0)items.push(['⛈️','Orage possible',`Signal orageux vers ${time(i)}`,'high']);}
    box.innerHTML=items.length?items.map(([icon,title,detail,level])=>`<div class="v50-predictive-row" data-level="${level}"><span>${icon}</span><div><strong>${title}</strong><small>${detail}</small></div></div>`).join(''):'<div class="empty-state">✅ Aucun signal gel/chaleur/vent fort/orage selon tes seuils dans les prochaines heures.</div>';
  }catch{box.innerHTML='<div class="empty-state">Prévisions intelligentes momentanément indisponibles.</div>';}
}
