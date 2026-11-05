(function initJournalRadar(){
  const container = document.getElementById('journalRadarMap');
  const status = document.getElementById('journalRadarStatus');
  let preview;
  let position;
  let visible = false;
  let loading = false;
  let updatedAt = 0;
  const refreshInterval = 10 * 60 * 1000;

  async function showObservation(){
    if(!visible || !position) return;
    if(!window.L){
      status.textContent = 'Carte indisponible. Ouvre le radar pour réessayer.';
      return;
    }
    if(!preview){
      const map = L.map(container,{
        attributionControl:true, zoomControl:false, dragging:false,
        scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false,
        keyboard:false, touchZoom:false, tapHold:false
      }).setView(position,7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        className:'journal-basemap'
      }).addTo(map);
      const marker = L.circleMarker(position,{radius:6,color:'#fff7e4',fillColor:'#b33d14',fillOpacity:1}).addTo(map);
      preview = {map, marker, radar:null};
    }else{
      preview.map.invalidateSize({pan:false});
      preview.map.setView(position,7);
      preview.marker.setLatLng(position);
    }
    if(loading || Date.now()-updatedAt<refreshInterval) return;
    loading = true;
    try{
      const {host,frames} = await fetchRadarFrames();
      const latest = frames.reduce((newest,frame)=>frame.time>newest.time?frame:newest);
      const date = new Date(latest.time*1000);
      if(!Number.isFinite(date.getTime())) throw new Error('Date radar indisponible');
      const label = new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);
      const layer = L.tileLayer(host+latest.path+'/256/{z}/{x}/{y}/2/1_1.png',{
        maxNativeZoom:7, opacity:.75,
        attribution:'<a href="https://www.rainviewer.com/">RainViewer</a>'
      });
      layer.on('tileerror',()=>{
        if(preview.radar===layer) status.textContent='Certaines images radar sont indisponibles.';
      });
      preview.radar?.remove();
      preview.radar = layer;
      layer.addTo(preview.map);
      updatedAt = Date.now();
      status.textContent = 'Observation du '+label;
    }catch{
      status.textContent = preview.radar?'Actualisation indisponible. Image précédente affichée.':'Observation radar indisponible.';
    }finally{
      loading = false;
    }
  }

  document.addEventListener('meteo-place-change',()=>{
    position = [currentPlace.latitude,currentPlace.longitude];
    showObservation();
  });
  if(currentPlace) position = [currentPlace.latitude,currentPlace.longitude];
  if('IntersectionObserver' in window){
    new IntersectionObserver(([entry])=>{
      visible = entry.isIntersecting;
      showObservation();
    },{rootMargin:'100px'}).observe(container);
  }else{
    visible = true;
    showObservation();
  }
  setInterval(showObservation,refreshInterval);
})();
