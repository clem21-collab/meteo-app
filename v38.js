const V38_VERSION='3.9';
let v38FallbackFullscreen=false;
let v38Stage=null;

(function initV38(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v38.css?v=${V38_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    const panel=document.getElementById('panel-radar');
    const header=document.querySelector('#panel-radar .radar-header');
    const radarMap=document.getElementById('radarMap');
    if(!panel||!header||!radarMap)return setTimeout(boot,250);
    v38Stage=buildRadarFullscreenStage(radarMap);
    injectRadarFullscreenButton(header,v38Stage);
    bindFullscreenEvents(v38Stage);
    patchFullscreenTimeline();
  };
  boot();
})();

function buildRadarFullscreenStage(radarMap){
  let stage=document.getElementById('radarFullscreenStage');
  if(stage)return stage;

  stage=document.createElement('div');
  stage.id='radarFullscreenStage';
  stage.className='v38-radar-stage';
  radarMap.parentNode.insertBefore(stage,radarMap);
  stage.appendChild(radarMap);

  const overlay=document.createElement('div');
  overlay.id='radarFullscreenOverlay';
  overlay.className='v38-map-overlay';
  overlay.innerHTML=`
    <div class="v38-overlay-top">
      <div class="v38-overlay-info">
        <strong id="v38FullscreenTitle">Radar pluie</strong>
        <small id="v38FullscreenSub">Maintenant</small>
      </div>
      <div class="v38-overlay-actions">
        <button id="v38FullscreenPlay" type="button" aria-label="Lire ou mettre en pause">▶</button>
        <button id="radarFullscreenClose" type="button" aria-label="Quitter le plein écran">✕</button>
      </div>
    </div>
    <div id="v38FullscreenTimeline" class="v38-overlay-timeline">
      <input id="v38FullscreenSlider" type="range" min="0" max="0" value="0" step="1" aria-label="Timeline du radar plein écran">
      <div class="v38-overlay-scale"><span>Passé</span><span>Maintenant</span><span>Futur</span></div>
    </div>`;
  stage.appendChild(overlay);

  document.getElementById('radarFullscreenClose').addEventListener('click',()=>exitRadarFullscreen(stage));
  document.getElementById('v38FullscreenPlay').addEventListener('click',()=>toggleFullscreenAnimation());
  document.getElementById('v38FullscreenSlider').addEventListener('input',event=>{
    if(typeof stopUnifiedAnimation==='function')stopUnifiedAnimation();
    const i=Number(event.target.value||0);
    if(typeof v36Mode!=='undefined'&&v36Mode&&typeof showUnifiedFrame==='function')showUnifiedFrame(i);
  });
  return stage;
}

function injectRadarFullscreenButton(header,stage){
  if(document.getElementById('radarFullscreenBtn'))return;
  const button=document.createElement('button');
  button.id='radarFullscreenBtn';
  button.type='button';
  button.className='secondary-button v38-fullscreen-btn';
  button.textContent='⛶ Agrandir le radar';
  button.setAttribute('aria-label','Afficher uniquement la carte radar en plein écran');
  header.appendChild(button);
  button.addEventListener('click',()=>toggleRadarFullscreen(stage));
}

function bindFullscreenEvents(stage){
  document.addEventListener('fullscreenchange',()=>syncFullscreenUi(stage));
  document.addEventListener('webkitfullscreenchange',()=>syncFullscreenUi(stage));
  window.addEventListener('resize',()=>invalidateRadarMap());
  window.addEventListener('orientationchange',()=>setTimeout(invalidateRadarMap,250));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&v38FallbackFullscreen)exitRadarFullscreen(stage);
  });
}

function patchFullscreenTimeline(){
  if(window.__v38FullscreenPatched)return;
  window.__v38FullscreenPatched=true;
  if(typeof window.showUnifiedFrame==='function'){
    const original=window.showUnifiedFrame;
    window.showUnifiedFrame=async function(index){
      const result=await original(index);
      syncFullscreenTimeline(Number(index));
      return result;
    };
  }
}

function realFullscreenElement(){
  return document.fullscreenElement||document.webkitFullscreenElement||null;
}

async function toggleRadarFullscreen(stage){
  if(realFullscreenElement()===stage||v38FallbackFullscreen){
    await exitRadarFullscreen(stage);
    return;
  }
  prepareFullscreenTimeline();
  try{
    if(stage.requestFullscreen){
      await stage.requestFullscreen({navigationUI:'hide'});
    }else if(stage.webkitRequestFullscreen){
      stage.webkitRequestFullscreen();
    }else{
      enterFallbackFullscreen(stage);
    }
  }catch(error){
    console.warn('Fullscreen API indisponible, utilisation du mode carte étendue.',error);
    enterFallbackFullscreen(stage);
  }
  syncFullscreenUi(stage);
  setTimeout(invalidateRadarMap,80);
  setTimeout(invalidateRadarMap,350);
}

function prepareFullscreenTimeline(){
  const slider=document.getElementById('v38FullscreenSlider');
  const timeline=document.getElementById('v38FullscreenTimeline');
  const unified=typeof v36Mode!=='undefined'&&v36Mode&&Array.isArray(v36Frames)&&v36Frames.length;
  if(timeline)timeline.hidden=!unified;
  if(!unified||!slider)return;
  const source=document.getElementById('v36TimelineSlider');
  slider.max=String(v36Frames.length-1);
  slider.value=String(source?.value||v36NowIndex||0);
  syncFullscreenTimeline(Number(slider.value));
}

function syncFullscreenTimeline(index){
  const slider=document.getElementById('v38FullscreenSlider');
  if(slider&&Array.isArray(v36Frames)&&v36Frames.length){
    slider.max=String(v36Frames.length-1);
    slider.value=String(Math.max(0,Math.min(v36Frames.length-1,Number(index)||0)));
  }
  const title=document.getElementById('v38FullscreenTitle');
  const sub=document.getElementById('v38FullscreenSub');
  const mainTitle=document.getElementById('v36TimelineTitle');
  const mainLead=document.getElementById('v36TimelineLead');
  if(title)title.textContent=mainTitle?.textContent||'Radar pluie';
  if(sub)sub.textContent=mainLead?.textContent||document.getElementById('radarTime')?.textContent||'Maintenant';
  syncFullscreenPlayButton();
}

function toggleFullscreenAnimation(){
  if(typeof v36Mode!=='undefined'&&v36Mode&&typeof toggleUnifiedAnimation==='function'){
    toggleUnifiedAnimation();
  }else if(typeof mfForecastMode!=='undefined'&&mfForecastMode){
    document.getElementById('mfForecastPlay')?.click();
  }else{
    document.getElementById('radarPlayBtn')?.click();
  }
  setTimeout(syncFullscreenPlayButton,30);
}

function syncFullscreenPlayButton(){
  const b=document.getElementById('v38FullscreenPlay');if(!b)return;
  let playing=false;
  try{playing=Boolean(v36Timer||mfForecastTimer||radarTimer);}catch{}
  b.textContent=playing?'⏸':'▶';
}

function enterFallbackFullscreen(stage){
  v38FallbackFullscreen=true;
  stage.classList.add('v38-fullscreen-fallback');
  document.documentElement.classList.add('v38-no-scroll');
  document.body.classList.add('v38-no-scroll');
  syncFullscreenUi(stage);
}

async function exitRadarFullscreen(stage){
  try{
    if(realFullscreenElement()===stage){
      if(document.exitFullscreen)await document.exitFullscreen();
      else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
    }
  }catch(error){console.warn(error);}
  v38FallbackFullscreen=false;
  stage.classList.remove('v38-fullscreen-fallback');
  document.documentElement.classList.remove('v38-no-scroll');
  document.body.classList.remove('v38-no-scroll');
  syncFullscreenUi(stage);
  setTimeout(invalidateRadarMap,80);
  setTimeout(invalidateRadarMap,350);
}

function syncFullscreenUi(stage){
  const active=realFullscreenElement()===stage||v38FallbackFullscreen;
  stage.classList.toggle('v38-fullscreen-active',active);
  const button=document.getElementById('radarFullscreenBtn');
  if(button){
    button.textContent=active?'⛶ Réduire le radar':'⛶ Agrandir le radar';
    button.setAttribute('aria-label',active?'Quitter le plein écran du radar':'Afficher uniquement la carte radar en plein écran');
  }
  if(!active){
    v38FallbackFullscreen=false;
    stage.classList.remove('v38-fullscreen-fallback');
    document.documentElement.classList.remove('v38-no-scroll');
    document.body.classList.remove('v38-no-scroll');
  }else{
    prepareFullscreenTimeline();
  }
  invalidateRadarMap();
}

function invalidateRadarMap(){
  try{
    if(typeof map!=='undefined'&&map)map.invalidateSize?.({pan:false,animate:false});
  }catch(error){console.warn(error);}
}
