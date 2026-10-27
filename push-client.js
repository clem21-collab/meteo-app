const PUSH_BACKEND = 'https://meteo-push.clemret17.workers.dev';

function vapidKeyToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registerAutomaticPush(showConfirmation = true) {
  if (!window.isSecureContext) throw new Error('Les notifications automatiques nécessitent HTTPS.');
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Les notifications push ne sont pas prises en charge sur cet appareil.');
  }
  if (typeof currentPlace === 'undefined' || !currentPlace) {
    throw new Error('Attends que la météo de la ville soit chargée, puis réessaie.');
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Autorisation de notifications non accordée.');
  }
  if (Notification.permission !== 'granted') {
    throw new Error('Les notifications sont bloquées dans les paramètres du site.');
  }

  const configResponse = await fetch(`${PUSH_BACKEND}/config`, { cache: 'no-store' });
  if (!configResponse.ok) throw new Error('Le serveur de notifications n’est pas encore prêt.');
  const config = await configResponse.json();
  if (!config.vapidPublicKey) throw new Error('La clé publique VAPID est absente du serveur.');

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyToUint8Array(config.vapidPublicKey),
    });
  }

  const settingsValue = typeof getAlertSettings === 'function'
    ? getAlertSettings()
    : { rain: true, wind: true, windThreshold: 60, snow: true, storm: true };

  const response = await fetch(`${PUSH_BACKEND}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      latitude: currentPlace.latitude,
      longitude: currentPlace.longitude,
      city: currentPlace.name,
      settings: settingsValue,
    }),
  });
  if (!response.ok) throw new Error('Impossible d’enregistrer ce téléphone pour les alertes automatiques.');

  const state = document.getElementById('notificationState');
  const button = document.getElementById('notificationBtn');
  if (state) state.textContent = 'Notifications automatiques activées';
  if (button) button.textContent = 'Réenregistrer les alertes';

  if (showConfirmation) {
    try {
      await registration.showNotification('🌤️ Météo', {
        body: `Alertes automatiques activées pour ${currentPlace.name}.`,
        icon: 'icon.svg',
        badge: 'icon.svg',
        tag: 'meteo-push-ready',
        data: { url: './?tab=alerts' },
      });
    } catch {}
  }
  return true;
}

const pushButton = document.getElementById('notificationBtn');
if (pushButton) {
  pushButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
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

['rainAlertToggle', 'windAlertToggle', 'snowAlertToggle', 'stormAlertToggle', 'windThreshold'].forEach((id) => {
  const element = document.getElementById(id);
  if (!element) return;
  element.addEventListener('change', () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      registerAutomaticPush(false).catch(console.error);
    }
  });
});
