// V5.0 finishing layer: branding, display units and radar mode state.
(function finishV50(){
  document.title='Météo V5.0';
  const eyebrow=document.querySelector('.place-block .eyebrow');if(eyebrow)eyebrow.textContent='MÉTÉO V5.0';
  injectV50UnitControls();
  patchV50UnitRenders();
  patchV50RadarModeState();
  applyV50DisplayUnits();
})();

function v50Units(){const s=readV50Settings();return{temp:s.tempUnit==='f'?'f':'c',wind:s.windUnit==='ms'?'ms':'kmh'};}
function v50TempValue(v){const n=Number(v);if(!Number.isFinite(n))return NaN;return v50Units().temp==='f'?n*9/5+32:n;}
function v50WindValue(v){const n=Number(v);if(!Number.isFinite(n))return NaN;return v50Units().wind==='ms'?n/3.6:n;}
function v50TempLabel(v,d=0){const n=v50TempValue(v);return Number.isFinite(n)?`${n.toFixed(d)}°${v50Units().temp==='f'?'F':'C'}`:'--';}
function v50WindLabel(v,d=0){const n=v50WindValue(v);return Number.isFinite(n)?`${n.toFixed(d)} ${v50Units().wind==='ms'?'m/s':'km/h'}`:'--';}

function injectV50UnitControls(){
  const card=document.querySelector('#panel-settings .v50-settings-card');if(!card||document.getElementById('v50TempUnit'))return;
  const theme=document.getElementById('v50Theme')?.closest('label');
  const temp=document.createElement('label');temp.innerHTML='<span><strong>Température</strong><small>Unité d’affichage</small></span><select id="v50TempUnit"><option value="c">Celsius (°C)</option><option value="f">Fahrenheit (°F)</option></select>';
  const wind=document.createElement('label');wind.innerHTML='<span><strong>Vent</strong><small>Unité d’affichage</small></span><select id="v50WindUnit"><option value="kmh">km/h</option><option value="ms">m/s</option></select>';
  theme?.insertAdjacentElement('afterend',temp);temp.insertAdjacentElement('afterend',wind);
  const s=readV50Settings();document.getElementById('v50TempUnit').value=s.tempUnit==='f'?'f':'c';document.getElementById('v50WindUnit').value=s.windUnit==='ms'?'ms':'kmh';
  ['v50TempUnit','v50WindUnit'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{saveV50Settings({tempUnit:document.getElementById('v50TempUnit').value,windUnit:document.getElementById('v50WindUnit').value});applyV50DisplayUnits();renderV50Today?.();refreshV50Compare?.(true);try{refreshV50LongStats?.(typeof v46StatsDays!=='undefined'?v46StatsDays:30);}catch{}}));
}

function applyV50DisplayUnits(){
  const u=v50Units(),d=typeof currentData!=='undefined'?currentData:null;if(!d)return;
  const c=d.current||{};
  const temp=document.getElementById('temperature'),degree=document.querySelector('.temperature-line .degree'),feel=document.getElementById('feelsLike'),wind=document.getElementById('wind'),gust=document.getElementById('gust');
  if(temp)temp.textContent=Number.isFinite(v50TempValue(c.temperature_2m))?Math.round(v50TempValue(c.temperature_2m)):'--';if(degree)degree.textContent=u.temp==='f'?'°F':'°C';if(feel)feel.textContent=`Ressenti ${Number.isFinite(v50TempValue(c.apparent_temperature))?Math.round(v50TempValue(c.apparent_temperature)):'--'} °${u.temp==='f'?'F':'C'}`;if(wind)wind.textContent=v50WindLabel(c.wind_speed_10m);if(gust)gust.textContent=v50WindLabel(c.wind_gusts_10m);
  const h=d.hourly;if(h?.time?.length){const now=new Date(d.current?.time||Date.now()).getTime();let start=h.time.findIndex(t=>new Date(t).getTime()>=now);if(start<0)start=0;document.querySelectorAll('#hourly .hour-card').forEach((card,j)=>{const i=start+j,el=card.querySelector('.temp');if(el&&i<h.time.length){const v=v50TempValue(h.temperature_2m?.[i]);el.textContent=`${Number.isFinite(v)?Math.round(v):'--'}°`;}});}
  const daily=d.daily;document.querySelectorAll('#daily .day-row').forEach((row,i)=>{const el=row.querySelector('.range');if(!el)return;const a=v50TempValue(daily?.temperature_2m_min?.[i]),b=v50TempValue(daily?.temperature_2m_max?.[i]);el.textContent=`${Number.isFinite(a)?Math.round(a):'--'}° / ${Number.isFinite(b)?Math.round(b):'--'}°`;});
  setTimeout(applyV50OpenDetailUnits,30);
}

function applyV50OpenDetailUnits(){
  try{if(typeof v42SelectedIndex!=='undefined'&&v42SelectedIndex>=0&&v42HourlyDetails?.hourly){const time=currentData?.hourly?.time?.[v42SelectedIndex],i=typeof v42FindDetailIndex==='function'?v42FindDetailIndex(time):-1,h=v42HourlyDetails.hourly,p=document.getElementById('v42HourlyDetail');if(i>=0&&p&&!p.hidden){const m=[...p.querySelectorAll('.v42-metric')];const t=m.find(x=>x.textContent.includes('Température')),w=m.find(x=>x.textContent.includes('Vitesse du vent'));if(t){t.querySelector('strong').textContent=v50TempLabel(h.temperature_2m?.[i],1);const s=t.querySelector('small');if(s)s.textContent=`Ressenti ${v50TempLabel(h.apparent_temperature?.[i],1)}`;}if(w){w.querySelector('strong').textContent=v50WindLabel(h.wind_speed_10m?.[i]);const s=w.querySelector('small');if(s)s.textContent=`Rafales ${v50WindLabel(h.wind_gusts_10m?.[i])}`;}}}}catch{}
  try{if(typeof v43SelectedIndex!=='undefined'&&v43SelectedIndex>=0&&v43DailyDetails?.daily){const i=v43SelectedIndex,d=v43DailyDetails.daily,p=document.getElementById('v43DailyDetail');if(p&&!p.hidden){const m=[...p.querySelectorAll('.v43-metric')];const t=m.find(x=>x.textContent.includes('Températures')),w=m.find(x=>x.textContent.includes('Vent maximal'));if(t){t.querySelector('strong').textContent=`${v50TempLabel(d.temperature_2m_min?.[i]).replace(/[CF]$/,'')} → ${v50TempLabel(d.temperature_2m_max?.[i])}`;const s=t.querySelector('small');if(s)s.textContent=`Ressenti ${v50TempLabel(d.apparent_temperature_min?.[i]).replace(/[CF]$/,'')} → ${v50TempLabel(d.apparent_temperature_max?.[i])}`;}if(w){w.querySelector('strong').textContent=v50WindLabel(d.wind_speed_10m_max?.[i]);const s=w.querySelector('small');if(s)s.textContent=`Rafales ${v50WindLabel(d.wind_gusts_10m_max?.[i])}`;}}}}catch{}
}

function v50ConvertRenderedText(root){
  if(!root)return;const u=v50Units();
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{let t=node.nodeValue;if(u.temp==='f')t=t.replace(/(-?\d+(?:\.\d+)?)°(?![FC])/g,(_,n)=>`${Math.round((Number(n)*9/5+32)*10)/10}°`);if(u.wind==='ms')t=t.replace(/(\d+(?:\.\d+)?)\s*km\/h/g,(_,n)=>`${(Number(n)/3.6).toFixed(1)} m/s`);node.nodeValue=t;});
}

function patchV50UnitRenders(){
  try{const oldToday=renderV50Today;renderV50Today=async function(...a){const r=await oldToday(...a);v50ConvertRenderedText(document.getElementById('panel-today'));return r;};}catch{}
  try{const oldCompare=refreshV50Compare;refreshV50Compare=async function(...a){const r=await oldCompare(...a);v50ConvertRenderedText(document.getElementById('panel-compare'));return r;};}catch{}
  document.addEventListener('click',e=>{if(e.target.closest('#hourly .hour-card')||e.target.closest('#daily .day-row'))setTimeout(applyV50OpenDetailUnits,850);});
  try{if(typeof renderCurrent==='function'){const old=renderCurrent;renderCurrent=function(...a){const r=old(...a);applyV50DisplayUnits();return r;};}}catch{}
  try{if(typeof renderHourly==='function'){const old=renderHourly;renderHourly=function(...a){const r=old(...a);applyV50DisplayUnits();return r;};}}catch{}
  try{if(typeof renderDaily==='function'){const old=renderDaily;renderDaily=function(...a){const r=old(...a);applyV50DisplayUnits();return r;};}}catch{}
}

function patchV50RadarModeState(){
  const key='meteo-app-v50-radar-mode';
  const oldSync=typeof syncV50RadarButtons==='function'?syncV50RadarButtons:null;
  try{syncV50RadarButtons=function(){const mode=localStorage.getItem(key)||(readV50Settings().radarSnow?'snow':'rain');document.querySelectorAll('#v50RadarModes [data-radar-mode]').forEach(b=>b.classList.toggle('active',b.dataset.radarMode===mode));};}catch{}
  document.querySelectorAll('#v50RadarModes [data-radar-mode]').forEach(b=>b.addEventListener('click',()=>{localStorage.setItem(key,b.dataset.radarMode);setTimeout(()=>syncV50RadarButtons?.(),0);},true));
  syncV50RadarButtons?.();
}
