// Météo V5 — accès Premium vérifié par le Worker.
(function initV50PremiumGates(){
  const TOKEN_KEY='meteo-creator-device-v1';
  const FREE_FAVORITES_LIMIT=3;
  const form=document.getElementById('creatorForm');
  const input=document.getElementById('creatorCode');
  const status=document.getElementById('creatorStatus');
  const disconnect=document.getElementById('creatorDisconnect');
  const readToken=()=>{try{return localStorage.getItem(TOKEN_KEY)||'';}catch{return '';}};
  let token=readToken(),active=false,attempt=0;
  const isPremium=()=>active;
  const authorization=value=>({'Authorization':'Bearer '+value});
  window.meteoPremium=Object.freeze({
    isActive:isPremium,
    requestHeaders:()=>active?authorization(token):{}
  });

  function setAccess(value){
    const changed=active!==value;
    active=value;
    disconnect.hidden=!token;
    status.textContent=value?'Accès Créateur actif • Premium inclus':'';
    updateControls();
    if(!value&&document.getElementById('panel-stats')?.hidden===false){
      switchTab('weather');
    }
    if(changed&&typeof refreshV50PredictiveAlerts==='function')refreshV50PredictiveAlerts();
  }

  async function verify(){
    if(!token||form.querySelector('[type=submit]').disabled)return;
    const id=++attempt;
    try{
      const response=await fetch(PUSH_BACKEND+'/creator/status',{
        method:'POST',headers:authorization(token),cache:'no-store',signal:AbortSignal.timeout(8000)
      });
      const verified=response.ok&&(await response.json()).premium===true;
      if(id===attempt)setAccess(verified);
    }catch{if(id===attempt)setAccess(false);}
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const code=input.value.trim();
    input.value='';
    const id=++attempt,button=form.querySelector('[type=submit]');
    button.disabled=true;
    try{
      const response=await fetch(PUSH_BACKEND+'/creator/pair',{
        method:'POST',body:code,cache:'no-store',signal:AbortSignal.timeout(8000)
      });
      if(id!==attempt)return;
      if(response.status===401){status.textContent='Code Créateur incorrect.';return;}
      if(!response.ok)throw Error();
      const result=await response.json();
      if(id!==attempt)return;
      if(result.premium!==true||!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(result.token))throw Error();
      token=result.token;
      try{localStorage.setItem(TOKEN_KEY,token);}catch{}
      setAccess(true);
    }catch{if(id===attempt)status.textContent='Association indisponible. Réessaie en ligne.';}
    finally{button.disabled=false;}
  });

  disconnect.addEventListener('click',()=>{
    attempt++;
    token='';
    try{localStorage.removeItem(TOKEN_KEY);}catch{}
    setAccess(false);
  });
  window.addEventListener('storage',event=>{
    if(event.key!==TOKEN_KEY&&event.key!==null)return;
    attempt++;
    token=readToken();
    setAccess(false);
    verify();
  });
  window.addEventListener('online',verify);
  window.addEventListener('offline',()=>{attempt++;setAccess(false);});
  window.addEventListener('pageshow',verify);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)verify();});
  setInterval(()=>{if(!document.hidden)verify();},60000);

  const css=document.createElement('style');
  css.textContent=`
    .v50-premium-lock{display:inline-flex;align-items:center;gap:5px;margin-left:6px;padding:3px 7px;border-radius:999px;font-size:.7rem;font-weight:800;background:rgba(93,116,232,.15);vertical-align:middle}
    .v50-premium-locked-control{position:relative;opacity:.68}
    .v50-premium-locked-control::after{content:'PREMIUM';font-size:.65rem;font-weight:900;margin-left:8px;padding:3px 6px;border-radius:999px;background:rgba(93,116,232,.15)}
    .v50-premium-modal{position:fixed;inset:0;z-index:99999;display:grid;place-items:end center;padding:18px;background:rgba(7,12,28,.48);backdrop-filter:blur(8px)}
    .v50-premium-modal[hidden]{display:none}
    .v50-premium-sheet{width:min(560px,100%);padding:22px;border-radius:26px;background:var(--card,#fff);box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .v50-premium-sheet h2{margin:.3rem 0 .45rem}.v50-premium-sheet p{margin:.35rem 0 1rem}.v50-premium-sheet ul{margin:0 0 18px;padding-left:20px}.v50-premium-sheet li{margin:7px 0}.v50-premium-sheet-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.v50-premium-sheet-actions button{width:100%}
    .v50-free-limit-note{margin:10px 0 0;font-size:.85rem;color:var(--muted)}
    @media(max-width:600px){.v50-premium-modal{padding:0;align-items:end}.v50-premium-sheet{border-radius:26px 26px 0 0;padding:20px}.v50-premium-sheet-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  function ensureModal(){
    if(document.getElementById('v50PremiumGateModal'))return;
    const modal=document.createElement('div');
    modal.id='v50PremiumGateModal';modal.className='v50-premium-modal';modal.hidden=true;
    modal.innerHTML=`<section class="glass-card v50-premium-sheet" role="dialog" aria-modal="true" aria-labelledby="v50PremiumGateTitle"><span class="section-label">MÉTÉO PREMIUM</span><h2 id="v50PremiumGateTitle">Fonction Premium</h2><p id="v50PremiumGateText" class="muted"></p><ul id="v50PremiumGateBenefits"><li>⭐ Favoris illimités</li><li>📊 Historique et statistiques avancés</li><li>🔔 Alertes personnalisées avancées</li></ul><div class="v50-premium-sheet-actions"><button id="v50PremiumGateClose" class="secondary-button" type="button">Continuer gratuitement</button><button type="button" disabled>🔒 Premium bientôt disponible</button></div></section>`;
    document.body.appendChild(modal);
    const close=()=>{modal.hidden=true;document.body.style.overflow='';};
    document.getElementById('v50PremiumGateClose')?.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
  }

  function showGate(title,text){
    ensureModal();
    const modal=document.getElementById('v50PremiumGateModal');
    document.getElementById('v50PremiumGateTitle').textContent=title;
    document.getElementById('v50PremiumGateText').textContent=text;
    modal.hidden=false;document.body.style.overflow='hidden';
  }

  function freeFavoriteLimitReached(){
    try{
      if(isPremium()||typeof currentPlace==='undefined'||!currentPlace||typeof loadFavorites!=='function'||typeof isFavorite!=='function')return false;
      if(isFavorite(currentPlace))return false;
      const favs=loadFavorites();
      return Array.isArray(favs)&&favs.length>=FREE_FAVORITES_LIMIT;
    }catch{return false;}
  }

  function showFavoriteGate(){
    showGate('Favoris illimités',`La version gratuite permet jusqu’à ${FREE_FAVORITES_LIMIT} villes favorites. Aucun de tes favoris actuels n’est supprimé. Premium permettra d’en enregistrer autant que tu veux.`);
  }

  window.meteoCanAddFavorite=()=>{
    if(!freeFavoriteLimitReached())return true;
    showFavoriteGate();
    return false;
  };

  function decorateFavorites(){
    const panel=document.getElementById('panel-favorites');if(!panel||document.getElementById('v50FreeFavLimit'))return;
    const note=document.createElement('p');note.id='v50FreeFavLimit';note.className='v50-free-limit-note';note.textContent=`Version gratuite : jusqu’à ${FREE_FAVORITES_LIMIT} favoris • Premium : favoris illimités.`;
    panel.querySelector('.section-heading')?.insertAdjacentElement('afterend',note);
  }

  function lockStatsClicks(){
    document.addEventListener('click',e=>{
      if(isPremium())return;
      const target=e.target.closest('[data-tab="stats"],[data-mobile-tab="stats"],#v46StatsBtn,#v50StatsBtn');
      if(!target)return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      showGate('Historique & statistiques avancés','Les statistiques détaillées et l’historique météo sont prévus pour Météo Premium. La météo actuelle, les prévisions et le radar restent gratuits.');
    },true);
  }

  function updateControls(){
    const locked=!isPremium();
    const ids=['windThreshold','v50FrostThreshold','v50HeatThreshold','v50SmartLead',
      'v50Frost','v50Heat','v50SmartWind','v50SmartStorm','v50Quiet','v50QuietStart','v50QuietEnd','v50SavePush'];
    for(const id of ids){
      const el=document.getElementById(id);
      if(!el)continue;
      el.disabled=locked;
      el.closest('label')?.classList.toggle('v50-premium-locked-control',locked);
    }
    document.querySelectorAll('[data-tab="stats"],[data-mobile-tab="stats"]').forEach(button=>{
      const badge=button.querySelector('.v50-premium-lock');
      if(!locked){badge?.remove();return;}
      if(badge)return;
      const span=document.createElement('span');
      span.className='v50-premium-lock';
      span.textContent='🔒';
      button.appendChild(span);
    });
    const note=document.getElementById('v50FreeFavLimit');
    if(note)note.hidden=!locked;
  }

  document.addEventListener('click',event=>{
    if(isPremium()||!event.target.closest('.v50-premium-locked-control'))return;
    event.preventDefault();
    showGate('Alertes personnalisées avancées','Les alertes météo importantes restent gratuites. L’accès Premium permet de personnaliser les seuils et l’anticipation.');
  });
  ensureModal();
  decorateFavorites();
  lockStatsClicks();
  updateControls();
  const observer=new MutationObserver(records=>{
    if(records.some(record=>Array.from(record.addedNodes).some(node=>node.nodeType===1&&
      (node.matches('input,button,[data-mobile-tab="stats"]')||node.querySelector('input,[data-tab="stats"],[data-mobile-tab="stats"]'))))){
      updateControls();
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  disconnect.hidden=!token;
  verify();
})();
