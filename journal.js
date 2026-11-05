(function initJournalRadar(){
  const container = document.getElementById('journalRadarMap');
  const status = document.getElementById('journalRadarStatus');
  const slider = document.getElementById('journalRadarTime');
  const play = document.getElementById('journalRadarPlay');
  const forecastPhase = document.getElementById('journalForecastPhase');
  const refreshInterval = 10 * 60 * 1000;
  const timeFormat = new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  let preview, position, playback;
  let frames = [];
  let visible = false;
  let loading = false;
  let updatedAt = 0;
  let frameRevision = 0;
  let frameTimeout;

  function stop(){
    clearInterval(playback);
    playback = null;
    play.textContent = '▶ Animer';
    status.setAttribute('aria-live','polite');
  }

  function showFrame(index){
    const frame = frames[index];
    if(!frame) return;
    const revision = ++frameRevision;
    clearTimeout(frameTimeout);
    slider.value = index;
    const label = (frame.bounds?'Prévision AROME‑PI · ':'Observation RainViewer · ')+timeFormat.format(frame.time);
    slider.setAttribute('aria-valuetext',label);
    status.textContent = label;
    preview.pending?.remove();
    const layer = frame.bounds
      ? L.imageOverlay(frame.url,frame.bounds,{opacity:0,interactive:false,alt:''})
      : L.tileLayer(frame.url,{opacity:0,maxNativeZoom:7});
    preview.pending = layer;
    let loadedTile = false;
    layer.on('tileload',()=>{loadedTile=true;});
    function failed(){
      if(revision!==frameRevision) return;
      clearTimeout(frameTimeout);
      layer.remove();
      preview.pending = null;
      stop();
      status.textContent = 'Image indisponible pour '+label.toLowerCase()+'.';
    }
    layer.once('load',()=>{
      if(revision!==frameRevision) return;
      if(!frame.bounds&&!loadedTile){failed();return;}
      clearTimeout(frameTimeout);
      layer.setOpacity(.75);
      preview.radar?.remove();
      preview.radar = layer;
      preview.pending = null;
    });
    if(frame.bounds) layer.once('error',failed);
    frameTimeout = setTimeout(failed,8000);
    layer.addTo(preview.map);
  }

  async function showObservation(){
    if(!visible || document.hidden || !position) return;
    if(!window.L){
      status.textContent = 'Carte indisponible. Ouvre le radar pour réessayer.';
      return;
    }
    if(!preview){
      const map = L.map(container,{
        zoomControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false,
        boxZoom:false, keyboard:false, touchZoom:false, tapHold:false
      }).setView(position,7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        className:'journal-basemap'
      }).addTo(map);
      const marker = L.circleMarker(position,{radius:6,color:'#fff7e4',fillColor:'#b33d14',fillOpacity:1}).addTo(map);
      preview = {map, marker};
    }else{
      preview.map.invalidateSize({pan:false});
      preview.map.setView(position,7);
      preview.marker.setLatLng(position);
    }
    if(loading || playback || Date.now()-updatedAt<refreshInterval) return;
    loading = true;
    const forecastReady = typeof fetchMfMeta === "function";
    try{
      const [observed,forecast] = await Promise.allSettled([
        fetchRadarFrames(),
        forecastReady ? fetchMfMeta(true) : Promise.resolve(null)
      ]);
      const past = (observed.value?.frames??[]).map(frame=>({
        time:Number(frame.time)*1000,
        url:observed.value.host+frame.path+'/256/{z}/{x}/{y}/2/1_1.png'
      })).filter(frame=>Number.isFinite(frame.time)).sort((a,b)=>a.time-b.time);
      const meta = forecast.value;
      const now = Date.now();
      const future = meta?.bounds ? meta.frames.map(frame=>({
        time:Date.parse(frame.time),url:mfImageUrl(frame),bounds:meta.bounds
      })).filter(frame=>frame.time>now&&frame.time<=now+3*60*60*1000).sort((a,b)=>a.time-b.time) : [];
      if(!past.length&&!future.length) throw new Error('Aucune image disponible');
      frames = [...past,...future];
      forecastPhase.hidden = !future.length;
      slider.max = frames.length-1;
      slider.disabled = play.disabled = frames.length<2;
      if(past.length&&!preview.observedCredit){preview.map.attributionControl.addAttribution('<a href="https://www.rainviewer.com/">RainViewer</a>');preview.observedCredit=true;}
      if(future.length&&!preview.forecastCredit){preview.map.attributionControl.addAttribution('Météo‑France AROME‑PI');preview.forecastCredit=true;}
      updatedAt = Date.now();
      if(!forecastReady) setTimeout(()=>{if(typeof fetchMfMeta==="function"){updatedAt=0;showObservation();}},3000);
      showFrame(Math.max(0,past.length-1));
    }catch{
      status.textContent = preview.radar?'Actualisation indisponible. Image précédente affichée.':'Carte pluie indisponible.';
    }finally{
      loading = false;
    }
  }

  slider.addEventListener('input',()=>{stop();showFrame(Number(slider.value));});
  play.addEventListener('click',()=>{
    if(playback){stop();return;}
    if(frames.length<2) return;
    play.textContent = 'Ⅱ Pause';
    status.setAttribute('aria-live','off');
    let index = Number(slider.value);
    const advance=()=>{
      if(preview.pending) return;
      index=(index+1)%frames.length;
      showFrame(index);
    };
    advance();
    playback=setInterval(advance,1000);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();else showObservation();});
  document.addEventListener('meteo-place-change',()=>{
    position = [currentPlace.latitude,currentPlace.longitude];
    showObservation();
  });
  if(currentPlace) position = [currentPlace.latitude,currentPlace.longitude];
  if('IntersectionObserver' in window){
    new IntersectionObserver(([entry])=>{
      visible = entry.isIntersecting;
      if(visible) showObservation();
      else stop();
    },{rootMargin:'100px'}).observe(container);
  }else{
    visible = true;
    showObservation();
  }
  setInterval(showObservation,refreshInterval);
})();
