const PUSH_BACKEND = 'https://meteo-push.clemret17.workers.dev';
const PUSH_SETTINGS_KEY = 'meteo-app-alert-settings-v3';

function vapidKeyToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function readPushAlertSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PUSH_SETTINGS_KEY) || '{}') || {}; } catch {}
  return {
    rain: saved.rain !== false,
    rainThreshold: Math.max(20, Math.min(100, Number(saved.rainThreshold ?? 70))),
    rainSoon: saved.rainSoon !== false,
    wind: saved.wind !== false,
    windThreshold: Math.max(30, Math.min(150, Number(saved.windThreshold ?? 60))),
    snow: saved.snow !== false,
    storm: saved.storm !== false,
    leadHours: Math.max(1, Math.min(12, Number(saved.leadHours ?? 2))),
  };
}

function writePushAlertSettings(patch = {}) {
  const next = { ...readPushAlertSettings(), ...patch };
  localStorage.setItem(PUSH_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function addAdvancedAlertControls() {
  const rainToggle = document.getElementById('rainAlertToggle');
  const windThreshold = document.getElementById('windThreshold');
  if (!rainToggle || !windThreshold) return;
  if (!document.getElementById('rainThreshold')) {
    const rainRow = rainToggle.closest('.setting-row');
    const block = document.createElement('label');
    block.className = 'setting-block';block.htmlFor = 'rainThreshold';
    block.innerHTML = '<span><strong>Seuil de pluie</strong><small id="rainThresholdLabel">70 %</small></span><input id="rainThreshold" type="range" min="20" max="100" value="70" step="5">';
    rainRow?.insertAdjacentElement('afterend', block);
  }
  if (!document.getElementById('leadHours')) {
    const windBlock = windThreshold.closest('.setting-block');
    const block = document.createElement('label');
    block.className = 'setting-block';block.htmlFor = 'leadHours';
    block.innerHTML = '<span><strong>Anticipation</strong><small id="leadHoursLabel">2 h à l’avance</small></span><input id="leadHours" type="range" min="1" max="12" value="2" step="1">';
    windBlock?.insertAdjacentElement('afterend', block);
  }
  const settings = readPushAlertSettings();
  const rainSlider = document.getElementById('rainThreshold');
  const leadSlider = document.getElementById('leadHours');
  if (rainSlider) rainSlider.value = String(settings.rainThreshold);
  if (leadSlider) leadSlider.value = String(settings.leadHours);
  const rainLabel = document.getElementById('rainThresholdLabel');
  const leadLabel = document.getElementById('leadHoursLabel');
  if (rainLabel) rainLabel.textContent = `${settings.rainThreshold} %`;
  if (leadLabel) leadLabel.textContent = `${settings.leadHours} h à l’avance`;
}

function syncAdvancedControlsToStorage() {
  const rain = document.getElementById('rainAlertToggle');
  const rainSoon = document.getElementById('rainSoonAlertToggle');
  const wind = document.getElementById('windAlertToggle');
  const snow = document.getElementById('snowAlertToggle');
  const storm = document.getElementById('stormAlertToggle');
  const rainThreshold = document.getElementById('rainThreshold');
  const windThreshold = document.getElementById('windThreshold');
  const leadHours = document.getElementById('leadHours');
  return writePushAlertSettings({
    rain: rain ? rain.checked : true,
    rainSoon: rainSoon ? rainSoon.checked : readPushAlertSettings().rainSoon,
    wind: wind ? wind.checked : true,
    snow: snow ? snow.checked : true,
    storm: storm ? storm.checked : true,
    rainThreshold: rainThreshold ? Number(rainThreshold.value) : 70,
    windThreshold: windThreshold ? Number(windThreshold.value) : 60,
    leadHours: leadHours ? Number(leadHours.value) : 2,
  });
}

async function registerAutomaticPush(showConfirmation = true) {
  if (!window.isSecureContext) throw new Error('Les notifications automatiques nécessitent HTTPS.');
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Les notifications push ne sont pas prises en charge sur cet appareil.');
  if (typeof currentPlace === 'undefined' || !currentPlace) throw new Error('Attends que la météo de la ville soit chargée, puis réessaie.');
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Autorisation de notifications non accordée.');
  }
  if (Notification.permission !== 'granted') throw new Error('Les notifications sont bloquées dans les paramètres du site.');
  const configResponse = await fetch(`${PUSH_BACKEND}/config`, { cache: 'no-store' });
  if (!configResponse.ok) throw new Error('Le serveur de notifications n’est pas encore prêt.');
  const config = await configResponse.json();
  if (!config.vapidPublicKey) throw new Error('La clé publique VAPID est absente du serveur.');
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToUint8Array(config.vapidPublicKey) });
  const settingsValue = syncAdvancedControlsToStorage();
  const response = await fetch(`${PUSH_BACKEND}/subscribe`, {
    method: 'POST',headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON(), latitude: currentPlace.latitude, longitude: currentPlace.longitude, city: currentPlace.name, settings: settingsValue, confirm: showConfirmation }),
  });
  if (!response.ok) throw new Error('Impossible d’enregistrer ce téléphone pour les alertes automatiques.');
  const state = document.getElementById('notificationState');
  const button = document.getElementById('notificationBtn');
  if (state) state.textContent = 'Notifications automatiques activées';
  if (button) button.textContent = 'Réenregistrer les alertes';
  return true;
}

async function refreshPushSettingsSilently() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await registerAutomaticPush(false);
    if (typeof setStatus === 'function') setStatus('Réglages des alertes enregistrés.');
  } catch (error) { console.error(error); }
}

addAdvancedAlertControls();
const pushButton = document.getElementById('notificationBtn');
if (pushButton) {
  pushButton.addEventListener('click', async (event) => {
    event.preventDefault();event.stopImmediatePropagation();
    try {
      if (typeof setStatus === 'function') setStatus('Activation des notifications automatiques…');
      await registerAutomaticPush(true);
      if (typeof setStatus === 'function') setStatus(`Notifications automatiques activées pour ${currentPlace.name}.`);
    } catch (error) {
      console.error(error);
      if (typeof setStatus === 'function') setStatus(error.message || 'Impossible d’activer les notifications automatiques.', true);
    }
  }, true);
}

const managedIds = ['rainAlertToggle','rainThreshold','windAlertToggle','windThreshold','snowAlertToggle','stormAlertToggle','leadHours'];
managedIds.forEach((id) => {
  const element = document.getElementById(id);if (!element) return;
  const eventName = element.type === 'range' ? 'input' : 'change';
  element.addEventListener(eventName, () => {
    const settings = syncAdvancedControlsToStorage();
    const rainLabel = document.getElementById('rainThresholdLabel');
    const windLabel = document.getElementById('windThresholdLabel');
    const leadLabel = document.getElementById('leadHoursLabel');
    if (rainLabel) rainLabel.textContent = `${settings.rainThreshold} %`;
    if (windLabel) windLabel.textContent = `${settings.windThreshold} km/h`;
    if (leadLabel) leadLabel.textContent = `${settings.leadHours} h à l’avance`;
  });
  element.addEventListener('change', () => refreshPushSettingsSilently());
});

let cityRefreshTimer = null;
const placeName = document.getElementById('placeName');
if (placeName && 'MutationObserver' in window) {
  const observer = new MutationObserver(() => { clearTimeout(cityRefreshTimer);cityRefreshTimer = setTimeout(() => refreshPushSettingsSilently(), 1500); });
  observer.observe(placeName, { childList: true, characterData: true, subtree: true });
}

if (!document.querySelector('script[data-v34]')) {
  const s=document.createElement('script');
  s.src='v34.js?v=3.4';s.dataset.v34='1';
  s.onload=()=>{
    const duplicate=document.getElementById('alertHours');
    if(duplicate&&document.getElementById('leadHours'))duplicate.closest('.setting-block')?.remove();
  };
  document.body.appendChild(s);
}
