const PUSH_BACKEND='https://meteo-push.clemret17.workers.dev';
const PUSH_SETTINGS_KEY='meteo-app-alert-settings-v3';

function vapidKeyToUint8Array(value){const padding='='.repeat((4-(value.length%4))%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function readPushAlertSettings(){let saved={};try{saved=JSON.parse(localStorage.getItem(PUSH_SETTINGS_KEY)||'{}')||{};}catch{}return{rain:saved.rain!==false,rainThreshold:Math.max(20,Math.min(100,Number(saved.rainThreshold??70))),rainSoon:saved.rainSoon!==false,rainSoonMinutes:Math.max(15,Math.min(60,Number(saved.rainSoonMinutes??30))),rainSoonMinMm:[0.1,0.5,1.5].includes(Number(saved.rainSoonMinMm))?Number(saved.rainSoonMinMm):0.1,wind:saved.wind!==false,windThreshold:Math.max(30,Math.min(150,Number(saved.windThreshold??60))),snow:saved.snow!==false,storm:saved.storm!==false,leadHours:Math.max(1,Math.min(12,Number(saved.leadHours??2))),vigilance:saved.vigilance!==false,vigilanceLevel:Math.max(2,Math.min(4,Number(saved.vigilanceLevel??3)))};}
function writePushAlertSettings(patch={}){const next={...readPushAlertSettings(),...patch};localStorage.setItem(PUSH_SETTINGS_KEY,JSON.stringify(next));return next;}

function addAdvancedAlertControls(){
  const rainToggle=document.getElementById('rainAlertToggle'),windThreshold=document.getElementById('windThreshold');if(!rainToggle||!windThreshold)return;
  if(!document.getElementById('rainThreshold')){const rainRow=rainToggle.closest('.setting-row'),block=document.createElement('label');block.className='setting-block';block.htmlFor='rainThreshold';block.innerHTML='<span><strong>Seuil de pluie</strong><small id="rainThresholdLabel">70 %</small></span><input id="rainThreshold" type="range" min="20" max="100" value="70" step="5">';rainRow?.insertAdjacentElement('afterend',block);}
  if(!document.getElementById('leadHours')){const windBlock=windThreshold.closest('.setting-block'),block=document.createElement('label');block.className='setting-block';block.htmlFor='leadHours';block.innerHTML='<span><strong>Anticipation</strong><small id="leadHoursLabel">2 h à l’avance</small></span><input id="leadHours" type="range" min="1" max="12" value="2" step="1">';windBlock?.insertAdjacentElement('afterend',block);}
  const s=readPushAlertSettings(),r=document.getElementById('rainThreshold'),l=document.getElementById('leadHours');if(r)r.value=String(s.rainThreshold);if(l)l.value=String(s.leadHours);const rl=document.getElementById('rainThresholdLabel'),ll=document.getElementById('leadHoursLabel');if(rl)rl.textContent=`${s.rainThreshold} %`;if(ll)ll.textContent=`${s.leadHours} h à l’avance`;
}

function syncAdvancedControlsToStorage(){
  const by=id=>document.getElementById(id),old=readPushAlertSettings();
  return writePushAlertSettings({
    rain:by('rainAlertToggle')?.checked??true,
    rainSoon:by('v41RainSoonToggle')?.checked??by('rainSoonAlertToggle')?.checked??old.rainSoon,
    rainSoonMinutes:Number(by('v41RainSoonWindow')?.value??old.rainSoonMinutes??30),
    rainSoonMinMm:Number(by('v41RainIntensity')?.value??old.rainSoonMinMm??0.1),
    wind:by('windAlertToggle')?.checked??true,
    snow:by('snowAlertToggle')?.checked??true,
    storm:by('stormAlertToggle')?.checked??true,
    rainThreshold:Number(by('rainThreshold')?.value??70),
    windThreshold:Number(by('windThreshold')?.value??60),
    leadHours:Number(by('leadHours')?.value??2),
    vigilance:by('v41VigilanceToggle')?.checked??old.vigilance,
    vigilanceLevel:Number(by('v41VigilanceLevel')?.value??old.vigilanceLevel??3)
  });
}

async function registerAutomaticPush(showConfirmation=true){
  if(!window.isSecureContext)throw new Error('Les notifications automatiques nécessitent HTTPS.');
  if(!('Notification'in window)||!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('Les notifications push ne sont pas prises en charge sur cet appareil.');
  if(typeof currentPlace==='undefined'||!currentPlace)throw new Error('Attends que la météo de la ville soit chargée, puis réessaie.');
  if(Notification.permission==='default'){const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Autorisation de notifications non accordée.');}
  if(Notification.permission!=='granted')throw new Error('Les notifications sont bloquées dans les paramètres du site.');
  const cr=await fetch(`${PUSH_BACKEND}/config`,{cache:'no-store'});if(!cr.ok)throw new Error('Le serveur de notifications n’est pas encore prêt.');const config=await cr.json();if(!config.vapidPublicKey)throw new Error('La clé publique VAPID est absente du serveur.');
  const registration=await navigator.serviceWorker.ready;let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:vapidKeyToUint8Array(config.vapidPublicKey)});
  const response=await fetch(`${PUSH_BACKEND}/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON(),latitude:currentPlace.latitude,longitude:currentPlace.longitude,city:currentPlace.name,department:currentPlace.departmentCode||'',settings:syncAdvancedControlsToStorage(),confirm:showConfirmation})});
  if(!response.ok)throw new Error('Impossible d’enregistrer ce téléphone pour les alertes automatiques.');
  const state=document.getElementById('notificationState'),button=document.getElementById('notificationBtn');if(state)state.textContent='Notifications automatiques activées';if(button)button.textContent='Réenregistrer les alertes';return true;
}

async function refreshPushSettingsSilently(){if(!('Notification'in window)||Notification.permission!=='granted')return;try{const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();if(!subscription)return;await registerAutomaticPush(false);if(typeof setStatus==='function')setStatus('Réglages des alertes enregistrés.');}catch(error){console.error(error);}}

addAdvancedAlertControls();
const pushButton=document.getElementById('notificationBtn');if(pushButton)pushButton.addEventListener('click',async event=>{event.preventDefault();event.stopImmediatePropagation();try{if(typeof setStatus==='function')setStatus('Activation des notifications automatiques…');await registerAutomaticPush(true);if(typeof setStatus==='function')setStatus(`Notifications automatiques activées pour ${currentPlace.name}.`);}catch(error){console.error(error);if(typeof setStatus==='function')setStatus(error.message||'Impossible d’activer les notifications automatiques.',true);}},true);

['rainAlertToggle','rainThreshold','windAlertToggle','windThreshold','snowAlertToggle','stormAlertToggle','leadHours'].forEach(id=>{const element=document.getElementById(id);if(!element)return;const eventName=element.type==='range'?'input':'change';element.addEventListener(eventName,()=>{const s=syncAdvancedControlsToStorage(),rl=document.getElementById('rainThresholdLabel'),wl=document.getElementById('windThresholdLabel'),ll=document.getElementById('leadHoursLabel');if(rl)rl.textContent=`${s.rainThreshold} %`;if(wl)wl.textContent=`${s.windThreshold} km/h`;if(ll)ll.textContent=`${s.leadHours} h à l’avance`;});element.addEventListener('change',()=>refreshPushSettingsSilently());});

let cityRefreshTimer=null;const placeName=document.getElementById('placeName');if(placeName&&'MutationObserver'in window){const observer=new MutationObserver(()=>{clearTimeout(cityRefreshTimer);cityRefreshTimer=setTimeout(()=>refreshPushSettingsSilently(),1500);});observer.observe(placeName,{childList:true,characterData:true,subtree:true});}

function loadEnhancement(src,dataKey,onload){return new Promise(resolve=>{const existing=document.querySelector(`script[${dataKey}]`);if(existing){resolve();return;}const s=document.createElement('script');s.src=src;s.setAttribute(dataKey,'1');s.onload=()=>{try{onload?.();}finally{resolve();}};s.onerror=()=>resolve();document.body.appendChild(s);});}

(async()=>{
  await loadEnhancement('v34.js?v=3.4','data-v34',()=>{const duplicate=document.getElementById('alertHours');if(duplicate&&document.getElementById('leadHours'))duplicate.closest('.setting-block')?.remove();});
  await loadEnhancement('v35.js?v=3.5','data-v35');
  await loadEnhancement('v36.js?v=3.6','data-v36');
  await loadEnhancement('v37.js?v=3.7','data-v37');
  await loadEnhancement('v38.js?v=3.9','data-v38');
  await loadEnhancement('v40.js?v=4.0','data-v40');
  await loadEnhancement('v41.js?v=4.1','data-v41');
  await loadEnhancement('v42.js?v=4.2','data-v42');
})();