// Météo V5 — Premium preview gates. No real purchase flow yet.
(function initV50PremiumGates(){
  const PREMIUM_KEY='meteo-app-premium-active-v1';
  const FREE_FAVORITES_LIMIT=3;
  const isPremium=()=>localStorage.getItem(PREMIUM_KEY)==='1';

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

  function interceptFavoriteButton(){
    if(document.documentElement.dataset.v50FavoriteGateBound==='1')return;
    document.documentElement.dataset.v50FavoriteGateBound='1';
    document.addEventListener('click',e=>{
      const button=e.target.closest('#favoriteBtn');
      if(!button||!freeFavoriteLimitReached())return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      showFavoriteGate();
    },true);
  }

  function patchFavorites(){
    if(typeof window.toggleFavorite!=='function'||window.toggleFavorite.__v50PremiumPatched)return false;
    const original=window.toggleFavorite;
    const patched=function(){
      if(freeFavoriteLimitReached()){showFavoriteGate();return;}
      return original.apply(this,arguments);
    };
    patched.__v50PremiumPatched=true;window.toggleFavorite=patched;
    return true;
  }

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

  function lockAdvancedAlerts(){
    const apply=()=>{
      if(isPremium())return;
      const wind=document.getElementById('windThreshold');
      if(wind&&!wind.dataset.premiumLocked){wind.dataset.premiumLocked='1';wind.disabled=true;wind.closest('label')?.classList.add('v50-premium-locked-control');}
      const advancedIds=['v50FrostThreshold','v50HeatThreshold','v50SmartLeadHours'];
      advancedIds.forEach(id=>{const el=document.getElementById(id);if(el&&!el.dataset.premiumLocked){el.dataset.premiumLocked='1';el.disabled=true;el.closest('label')?.classList.add('v50-premium-locked-control');}});
      ['v50Frost','v50Heat','v50SmartWind','v50SmartStorm'].forEach(id=>{const el=document.getElementById(id);if(el&&!el.dataset.premiumLocked){el.dataset.premiumLocked='1';el.disabled=true;el.closest('label')?.classList.add('v50-premium-locked-control');}});
      document.querySelectorAll('.v50-premium-locked-control').forEach(row=>{if(!row.dataset.gateBound){row.dataset.gateBound='1';row.addEventListener('click',e=>{if(e.target.matches('input,select'))e.preventDefault();showGate('Alertes personnalisées avancées','Les alertes météo importantes restent gratuites. Premium permettra de personnaliser précisément les seuils de vent, gel, chaleur et l’anticipation des alertes.');});}});
    };
    apply();setTimeout(apply,700);setTimeout(apply,1800);
  }

  function decorateStats(){
    const apply=()=>{
      document.querySelectorAll('[data-tab="stats"],[data-mobile-tab="stats"]').forEach(b=>{if(!b.querySelector('.v50-premium-lock')){const s=document.createElement('span');s.className='v50-premium-lock';s.textContent='🔒';b.appendChild(s);}});
    };
    apply();setTimeout(apply,700);setTimeout(apply,1800);
  }

  ensureModal();interceptFavoriteButton();patchFavorites();decorateFavorites();lockStatsClicks();lockAdvancedAlerts();decorateStats();
  let tries=0;const timer=setInterval(()=>{patchFavorites();decorateFavorites();lockAdvancedAlerts();decorateStats();if(++tries>12)clearInterval(timer);},500);
})();
