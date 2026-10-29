(function(){const s=document.createElement('style');s.textContent=`.v50-predictive-alerts{padding:18px 20px;border-radius:22px;margin:0 0 18px}.v50-predictive-alerts h3{margin:0}.v50-predictive-alerts .section-heading{align-items:center}.v50-predictive-alerts .section-heading p{margin:.2rem 0 0}.v50-predictive-alerts .secondary-button{min-width:44px}.v50-predictive-row{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-top:8px;border:1px solid var(--border);border-radius:15px;background:var(--soft)}.v50-predictive-row>span{font-size:1.5rem}.v50-predictive-row strong,.v50-predictive-row small{display:block}.v50-predictive-row small{color:var(--muted);margin-top:3px}.v50-predictive-row[data-level="high"]{border-left:4px solid #ef6f6f}.v50-predictive-row[data-level="medium"]{border-left:4px solid #e6b94c}.v50-privacy-card{padding:18px 20px;border-radius:22px;margin-top:18px}.v50-privacy-card h3{margin:.15rem 0 .35rem}.v50-privacy-card p{margin:.25rem 0 .9rem}.v50-privacy-card a{display:inline-flex;align-items:center;gap:6px;text-decoration:none}@media(max-width:600px){.v50-predictive-alerts,.v50-privacy-card{padding:15px}}`;document.head.appendChild(s);})();

(function addPlayStoreFinishing(){
  document.title='Météo V5.0';
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
    const footer=document.querySelector('footer');
    if(footer&&!footer.querySelector('[data-v50-privacy]')){
      const sep=document.createTextNode(' • '),a=document.createElement('a');
      a.dataset.v50Privacy='1';a.href='privacy.html';a.textContent='Confidentialité';a.style.color='inherit';
      footer.append(sep,a);
    }
  };
  inject();setTimeout(inject,700);
})();