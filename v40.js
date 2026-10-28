const V40_VERSION='4.0';
const V40_LAST_LOCATION_KEY='meteo-app-current-location-v1';
const V40_AUTO_LOCATION_KEY='meteo-app-auto-location-v1';
let v40LocationRequest=false;

(function initV40(){
  // Cette application privilégie désormais la position réelle au démarrage.
  // Le navigateur garde le contrôle de l'autorisation GPS.
  if(localStorage.getItem(V40_AUTO_LOCATION_KEY)===null){
    localStorage.setItem(V40_AUTO_LOCATION_KEY,'1');
  }

  const locationButton=document.getElementById('locationBtn');
  locationButton?.addEventListener('click',()=>{
    localStorage.setItem(V40_AUTO_LOCATION_KEY,'1');
  },{capture:true});

  // Chargé après les autres améliorations : on laisse l'initialisation historique
  // se terminer puis on remplace Dijon par la dernière position / le GPS actuel.
  setTimeout(()=>restoreCurrentLocation(),350);
})();

function readV40LastLocation(){
  try{
    const value=JSON.parse(localStorage.getItem(V40_LAST_LOCATION_KEY)||'null');
    if(!value)return null;
    const latitude=Number(value.latitude),longitude=Number(value.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
    return{latitude,longitude,updatedAt:Number(value.updatedAt||0)};
  }catch{return null;}
}

function saveV40LastLocation(latitude,longitude){
  try{
    localStorage.setItem(V40_LAST_LOCATION_KEY,JSON.stringify({
      latitude:Number(latitude),
      longitude:Number(longitude),
      updatedAt:Date.now()
    }));
  }catch{}
}

async function loadV40Position(latitude,longitude,message='Position actuelle'){
  if(typeof window.loadWeather!=='function')return;
  await window.loadWeather(Number(latitude),Number(longitude),null);
  if(typeof setStatus==='function'&&message)setStatus(message);
}

async function restoreCurrentLocation(){
  if(localStorage.getItem(V40_AUTO_LOCATION_KEY)!=='1')return;
  if(!navigator.geolocation)return;
  if(v40LocationRequest)return;
  v40LocationRequest=true;

  const last=readV40LastLocation();
  // Affiche immédiatement la dernière position connue pendant l'acquisition GPS.
  if(last){
    try{await loadV40Position(last.latitude,last.longitude,'Mise à jour de ta position…');}catch{}
  }else if(typeof setStatus==='function'){
    setStatus('Recherche automatique de ta position…');
  }

  navigator.geolocation.getCurrentPosition(async position=>{
    v40LocationRequest=false;
    const latitude=position.coords.latitude;
    const longitude=position.coords.longitude;
    saveV40LastLocation(latitude,longitude);
    try{
      await loadV40Position(latitude,longitude,'Météo mise à jour avec ta position actuelle.');
    }catch(error){console.error('Position automatique V4.0',error);}
  },async error=>{
    v40LocationRequest=false;
    console.warn('Position automatique indisponible',error);
    if(last){
      if(typeof setStatus==='function')setStatus('GPS indisponible : dernière position connue utilisée.');
      return;
    }
    // Sans dernière position, l'initialisation Dijon existante reste le dernier secours.
    if(typeof setStatus==='function')setStatus('Position indisponible : Dijon utilisé par défaut.');
  },{
    enableHighAccuracy:true,
    timeout:12000,
    maximumAge:60000
  });
}
