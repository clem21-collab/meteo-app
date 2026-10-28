const V37_VERSION='3.7';
const V37_FORECAST_URL=typeof FORECAST_URL!=='undefined'?FORECAST_URL:'https://api.open-meteo.com/v1/forecast';
let v37RainSeries=[];
let v37RainPlaceKey='';

(function initV37(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v37.css?v=${V37_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    if(typeof showUnifiedRadar!=='function'||typeof showUnifiedFrame!=='function'||!document.getElementById('v36TimelineControls')){
      return setTimeout(boot,250);
    }
    injectV37TimelineDetails();
    patchV37UnifiedRadar();
    setTimeout(()=>refreshV37Timeline(false),500);
  };
  boot();
})();

function injectV37TimelineDetails(){
  if(document.getElementById('v37StepStrip'))return;
  const scale=document.querySelector('#v36TimelineControls .v36-scale');
  if(!scale)return;

  const block=document.createElement('div');
  block.className='v37-details';
  block.innerHTML=`
    <div class="v37-details-head">
      <strong>Heure & intensité</strong>
      <small>Fais glisser ou touche une heure</small>
    </div>
    <div id="v37StepStrip" class="v37-step-strip" aria-label="Échéances détaillées du radar"></div>
    <p class="v37-intensity-note">💧 L’intensité est une estimation locale sur 15 min au point de la ville sélectionnée. La carte de prévision reste Météo-France AROME‑PI.</p>`;
  scale.insertAdjacentElement('afterend',block);
}

function v37PlaceKey(){
  if(typeof currentPlace==='undefined'||!currentPlace)return'';
  return `${Number(currentPlace.latitude).toFixed(4)},${Number(currentPlace.longitude).toFixed(4)}`;
}

async function fetchV37RainSeries(force=false){
  if(typeof currentPlace==='undefined'||!currentPlace)return[];
  const key=v37PlaceKey();
  if(!force&&v37RainSeries.length&&v37RainPlaceKey===key)return v37RainSeries;

  const u=new URL(V37_FORECAST_URL);
  u.searchParams.set('latitude',currentPlace.latitude);
  u.searchParams.set('longitude',currentPlace.longitude);
  u.searchParams.set('timezone','GMT');
  u.searchParams.set('minutely_15','precipitation');
  u.searchParams.set('forecast_minutely_15','24');

  try{
    const r=await fetch(u,{cache:'no-store'});
    if(!r.ok)throw new Error(`Prévision locale ${r.status}`);
    const d=await r.json();
    const times=d?.minutely_15?.time||[];
    const values=d?.minutely_15?.precipitation||[];
    v37RainSeries=times.map((t,i)=>({
      timestamp:Date.parse(`${t}Z`),
      mm:Number(values[i])
    })).filter(x=>Number.isFinite(x.timestamp)&&Number.isFinite(x.mm));
    v37RainPlaceKey=key;
  }catch(error){
    console.error('V3.7 rain intensity',error);
    v37RainSeries=[];
    v37RainPlaceKey=key;
  }
  return v37RainSeries;
}

function v37NearestRain(timestamp){
  if(!v37RainSeries.length)return null;
  let best=null,bestDiff=Infinity;
  for(const p of v37RainSeries){
    const diff=Math.abs(p.timestamp-timestamp);
    if(diff<bestDiff){best=p;bestDiff=diff;}
  }
  return bestDiff<=12*60*1000?best:null;
}

function v37Intensity(mm){
  const n=Number(mm);
  if(!Number.isFinite(n))return{label:'--',className:'unknown',emoji:'💧'};
  if(n<0.1)return{label:'Sec',className:'dry',emoji:'○'};
  if(n<0.5)return{label:'Faible',className:'light',emoji:'💧'};
  if(n<1.5)return{label:'Modérée',className:'moderate',emoji:'💧'};
  if(n<4)return{label:'Forte',className:'strong',emoji:'🌧️'};
  return{label:'Très forte',className:'very-strong',emoji:'⛈️'};
}

function v37ExactHour(timestamp){
  const d=new Date(timestamp);
  if(Number.isNaN(d.getTime()))return'--:--';
  return new Intl.DateTimeFormat('fr-FR',{hour:'2-digit',minute:'2-digit'}).format(d);
}

function v37FrameDetail(frame,index){
  if(frame.type==='now')return{label:'Maintenant',sub:'● Maintenant',className:'now'};
  if(frame.type==='observed')return{label:v37ExactHour(frame.timestamp),sub:'📡 Observé',className:'observed'};
  const rain=v37NearestRain(frame.timestamp);
  const intensity=v37Intensity(rain?.mm);
  return{
    label:v37ExactHour(frame.timestamp),
    sub:`${intensity.emoji} ${intensity.label}`,
    className:`forecast ${intensity.className}`,
    title:rain?`${rain.mm.toFixed(1)} mm prévus sur 15 min`:'Intensité locale indisponible'
  };
}

function renderV37Steps(){
  const strip=document.getElementById('v37StepStrip');
  if(!strip||typeof v36Frames==='undefined'||!Array.isArray(v36Frames))return;
  strip.innerHTML='';
  v36Frames.forEach((frame,index)=>{
    const d=v37FrameDetail(frame,index);
    const button=document.createElement('button');
    button.type='button';
    button.className=`v37-step ${d.className}`;
    button.dataset.index=String(index);
    if(d.title)button.title=d.title;
    button.innerHTML=`<strong>${d.label}</strong><small>${d.sub}</small>`;
    button.addEventListener('click',()=>{
      if(typeof stopUnifiedAnimation==='function')stopUnifiedAnimation();
      showUnifiedFrame(index);
    });
    strip.appendChild(button);
  });
  const slider=document.getElementById('v36TimelineSlider');
  updateV37ActiveStep(Number(slider?.value||0),false);
}

function updateV37ActiveStep(index,scroll=true){
  const strip=document.getElementById('v37StepStrip');if(!strip)return;
  strip.querySelectorAll('.v37-step').forEach(b=>b.classList.toggle('active',Number(b.dataset.index)===Number(index)));
  const active=strip.querySelector(`.v37-step[data-index="${Number(index)}"]`);
  if(active&&scroll){
    try{active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});}catch{}
  }
}

async function refreshV37Timeline(force=false){
  await fetchV37RainSeries(force);
  renderV37Steps();
}

function patchV37UnifiedRadar(){
  if(window.__v37RadarPatched)return;
  window.__v37RadarPatched=true;

  const originalShowUnifiedRadar=window.showUnifiedRadar;
  window.showUnifiedRadar=async function(force=false){
    const result=await originalShowUnifiedRadar(force);
    if(typeof v36Mode!=='undefined'&&v36Mode)await refreshV37Timeline(force);
    return result;
  };

  const originalShowUnifiedFrame=window.showUnifiedFrame;
  window.showUnifiedFrame=async function(index){
    const result=await originalShowUnifiedFrame(index);
    updateV37ActiveStep(Number(index),true);
    return result;
  };

  const refresh=document.getElementById('v36Refresh');
  refresh?.addEventListener('click',()=>{v37RainSeries=[];v37RainPlaceKey='';},true);

  const place=document.getElementById('placeName');
  if(place&&'MutationObserver'in window){
    new MutationObserver(()=>{v37RainSeries=[];v37RainPlaceKey='';setTimeout(()=>refreshV37Timeline(true),1000);}).observe(place,{childList:true,characterData:true,subtree:true});
  }
}
