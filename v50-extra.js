(function(){const s=document.createElement('style');s.textContent=`.v50-predictive-alerts{padding:18px 20px;border-radius:22px;margin:0 0 18px}.v50-predictive-alerts h3{margin:0}.v50-predictive-alerts .section-heading{align-items:center}.v50-predictive-alerts .section-heading p{margin:.2rem 0 0}.v50-predictive-alerts .secondary-button{min-width:44px}.v50-predictive-row{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-top:8px;border:1px solid var(--border);border-radius:15px;background:var(--soft)}.v50-predictive-row>span{font-size:1.5rem}.v50-predictive-row strong,.v50-predictive-row small{display:block}.v50-predictive-row small{color:var(--muted);margin-top:3px}.v50-predictive-row[data-level="high"]{border-left:4px solid #ef6f6f}.v50-predictive-row[data-level="medium"]{border-left:4px solid #e6b94c}.v50-privacy-card{padding:18px 20px;border-radius:22px;margin-top:18px}.v50-privacy-card h3{margin:.15rem 0 .35rem}.v50-privacy-card p{margin:.25rem 0 .9rem}.v50-privacy-card a{display:inline-flex;align-items:center;gap:6px;text-decoration:none}.v50-premium-card{padding:22px;border-radius:24px;margin:18px 0;background:linear-gradient(135deg,rgba(93,116,232,.18),rgba(132,93,232,.12));border:1px solid rgba(93,116,232,.28)}.v50-premium-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.v50-premium-head h3{font-size:1.35rem;margin:.2rem 0 .35rem}.v50-premium-badge{display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;font-weight:800;font-size:.78rem;background:rgba(93,116,232,.16);white-space:nowrap}.v50-premium-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:16px 0}.v50-premium-feature{padding:11px 12px;border-radius:15px;background:var(--soft);border:1px solid var(--border)}.v50-premium-feature strong{display:block;margin-bottom:3px}.v50-premium-feature small{color:var(--muted)}.v50-premium-prices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:15px 0}.v50-premium-price{padding:13px;border-radius:16px;background:var(--soft);border:1px solid var(--border);text-align:center}.v50-premium-price strong{display:block;font-size:1.1rem;margin-top:3px}.v50-premium-price small{color:var(--muted)}.v50-premium-note{font-size:.9rem;color:var(--muted);margin:.6rem 0 0}.v50-premium-cta{margin-top:14px;width:100%;opacity:.8;cursor:not-allowed}@media(max-width:700px){.v50-premium-list{grid-template-columns:1fr}.v50-premium-prices{grid-template-columns:1fr}.v50-premium-head{align-items:flex-start}.v50-predictive-alerts,.v50-privacy-card,.v50-premium-card{padding:15px}}`;document.head.appendChild(s);})();

(function addPlayStoreFinishing(){
  document.title='Météo';
  const meta=document.querySelector('meta[name="description"]');
  if(meta)meta.setAttribute('content','Prévisions détaillées, radar, vigilance, alertes, statistiques, air et pollen.');
  const inject=()=>{
    const settings=document.getElementById('panel-settings');
    if(settings&&!document.getElementById('v50PrivacyCard')){
      const card=document.createElement('section');
      card.id='v50PrivacyCard';
      card.className='glass-card v50-privacy-card';
      card.innerHTML='<span class="section-label">CONFIDENTIALITÉ</span><h3>Données & confidentialité</h3><p class="muted">Consulte comment la localisation, les notifications et les préférences sont utilisées.</p><a class="secondary-button" href="privacy.html" target="_blank" rel="noopener">🔒 Politique de confidentialité</a>';
      settings.appendChild(card);
    }
    if(!document.getElementById('v50PremiumCard')){
      const premium=document.createElement('section');
      premium.id='v50PremiumCard';
      premium.className='glass-card v50-premium-card';
      premium.innerHTML='<div class="v50-premium-head"><div><span class="section-label">MÉTÉO PREMIUM</span><h3>Plus de confort, plus de contrôle</h3><p class="muted">La météo essentielle restera gratuite. Premium ajoutera surtout des fonctions avancées et de la personnalisation.</p></div><span class="v50-premium-badge">Bientôt disponible</span></div><div class="v50-premium-list"><div class="v50-premium-feature"><strong>⭐ Favoris illimités</strong><small>Garde toutes tes villes importantes sous la main.</small></div><div class="v50-premium-feature"><strong>🔔 Alertes avancées</strong><small>Seuils personnalisés pour pluie, vent, gel, chaleur, neige et orages.</small></div><div class="v50-premium-feature"><strong>📊 Historique & statistiques</strong><small>Analyse plus détaillée des tendances météo.</small></div><div class="v50-premium-feature"><strong>🎨 Personnalisation</strong><small>Options d’affichage et thèmes supplémentaires.</small></div><div class="v50-premium-feature"><strong>📱 Widgets avancés</strong><small>Prévisions et alertes directement sur l’écran d’accueil.</small></div><div class="v50-premium-feature"><strong>🏙️ Comparaisons avancées</strong><small>Compare rapidement plusieurs villes et périodes.</small></div></div><div class="v50-premium-prices"><div class="v50-premium-price"><small>Mensuel</small><strong>1,99 €</strong></div><div class="v50-premium-price"><small>Annuel</small><strong>14,99 €</strong></div><div class="v50-premium-price"><small>À vie</small><strong>24,99 €</strong></div></div><button class="secondary-button v50-premium-cta" type="button" disabled>🔒 Premium bientôt disponible</button><p class="v50-premium-note">Les alertes de sécurité importantes et les fonctions météo essentielles resteront accessibles gratuitement.</p>';
      const target=settings||document.querySelector('footer');
      if(settings)settings.appendChild(premium);else if(target)target.insertAdjacentElement('beforebegin',premium);
    }
    const footer=document.querySelector('footer');
    if(footer&&!footer.querySelector('[data-v50-privacy]')){
      const sep=document.createTextNode(' • '),a=document.createElement('a');
      a.dataset.v50Privacy='1';a.href='privacy.html';a.textContent='Confidentialité';a.style.color='inherit';
      footer.append(sep,a);
    }
  };
  inject();setTimeout(inject,700);setTimeout(inject,1800);
})();

(function loadPremiumGates(){
  if(document.querySelector('script[data-v50-premium-gates]'))return;
  const s=document.createElement('script');
  s.src='v50-premium-gates.js?v=5.0.1';
  s.setAttribute('data-v50-premium-gates','1');
  document.body.appendChild(s);
})();