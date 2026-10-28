const V38_VERSION='3.8';
let v38FallbackFullscreen=false;

(function initV38(){
  const css=document.createElement('link');
  css.rel='stylesheet';css.href=`v38.css?v=${V38_VERSION}`;document.head.appendChild(css);

  const boot=()=>{
    const panel=document.getElementById('panel-radar');
    const header=document.querySelector('#panel-radar .radar-header');
    if(!panel||!header)return setTimeout(boot,250);
    injectRadarFullscreenButton(panel,header);
    bindFullscreenEvents(panel);
  };
  boot();
})();

function injectRadarFullscreenButton(panel,header){
  if(document.getElementById('radarFullscreenBtn'))return;
  const button=document.createElement('button');
  button.id='radarFullscreenBtn';
  button.type='button';
  button.className='secondary-button v38-fullscreen-btn';
  button.textContent='⛶ Plein écran';
  button.setAttribute('aria-label','Afficher le radar en plein écran');

  const existingPlay=document.getElementById('radarPlayBtn');
  if(existingPlay?.parentElement===header)header.appendChild(button);
  else header.appendChild(button);

  const close=document.createElement('button');
  close.id='radarFullscreenClose';
  close.type='button';
  close.className='v38-fullscreen-close';
  close.textContent='✕';
  close.setAttribute('aria-label','Quitter le plein écran');
  close.hidden=true;
  panel.prepend(close);

  button.addEventListener('click',()=>toggleRadarFullscreen(panel));
  close.addEventListener('click',()=>exitRadarFullscreen(panel));
}

function bindFullscreenEvents(panel){
  document.addEventListener('fullscreenchange',()=>syncFullscreenUi(panel));
  document.addEventListener('webkitfullscreenchange',()=>syncFullscreenUi(panel));
  window.addEventListener('resize',()=>invalidateRadarMap());
  window.addEventListener('orientationchange',()=>setTimeout(invalidateRadarMap,250));

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&v38FallbackFullscreen)exitRadarFullscreen(panel);
  });
}

function realFullscreenElement(){
  return document.fullscreenElement||document.webkitFullscreenElement||null;
}

async function toggleRadarFullscreen(panel){
  if(realFullscreenElement()===panel||v38FallbackFullscreen){
    await exitRadarFullscreen(panel);
    return;
  }
  try{
    if(panel.requestFullscreen){
      await panel.requestFullscreen({navigationUI:'hide'});
    }else if(panel.webkitRequestFullscreen){
      panel.webkitRequestFullscreen();
    }else{
      enterFallbackFullscreen(panel);
    }
  }catch(error){
    console.warn('Fullscreen API indisponible, utilisation du mode étendu.',error);
    enterFallbackFullscreen(panel);
  }
  syncFullscreenUi(panel);
  setTimeout(invalidateRadarMap,80);
  setTimeout(invalidateRadarMap,350);
}

function enterFallbackFullscreen(panel){
  v38FallbackFullscreen=true;
  panel.classList.add('v38-fullscreen-fallback');
  document.documentElement.classList.add('v38-no-scroll');
  document.body.classList.add('v38-no-scroll');
  syncFullscreenUi(panel);
}

async function exitRadarFullscreen(panel){
  try{
    if(realFullscreenElement()){
      if(document.exitFullscreen)await document.exitFullscreen();
      else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
    }
  }catch(error){console.warn(error);}
  v38FallbackFullscreen=false;
  panel.classList.remove('v38-fullscreen-fallback');
  document.documentElement.classList.remove('v38-no-scroll');
  document.body.classList.remove('v38-no-scroll');
  syncFullscreenUi(panel);
  setTimeout(invalidateRadarMap,80);
  setTimeout(invalidateRadarMap,350);
}

function syncFullscreenUi(panel){
  const active=realFullscreenElement()===panel||v38FallbackFullscreen;
  panel.classList.toggle('v38-fullscreen-active',active);
  const button=document.getElementById('radarFullscreenBtn');
  const close=document.getElementById('radarFullscreenClose');
  if(button){
    button.textContent=active?'⛶ Quitter le plein écran':'⛶ Plein écran';
    button.setAttribute('aria-label',active?'Quitter le plein écran':'Afficher le radar en plein écran');
  }
  if(close)close.hidden=!active;
  if(!active){
    v38FallbackFullscreen=false;
    panel.classList.remove('v38-fullscreen-fallback');
    document.documentElement.classList.remove('v38-no-scroll');
    document.body.classList.remove('v38-no-scroll');
  }
  invalidateRadarMap();
}

function invalidateRadarMap(){
  try{
    if(typeof map!=='undefined'&&map){
      map.invalidateSize?.({pan:false,animate:false});
    }
  }catch(error){console.warn(error);}
}
