const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync('v50-radar-layers.js', 'utf8').replace(
  '  let tries=0;',
  '  globalThis.test={setMode,renderOverlay,fieldValue,showWeatherDetails};let tries=0;'
);
const legend = {textContent: '', appendChild(child) { this.scale = child; }};
const panel = {dataset: {}};
const layers = [];
let pixels, popup, fetchImpl, rainStarts = 0, rainStops = 0;
let offset = 0;
const map = {
  getBounds: () => ({getNorthWest: () => [2 + offset, 48], getSouthEast: () => [4 + offset, 46]}),
  getZoom: () => 7,
  project: ([lon, lat]) => ({x: lon, y: -lat}),
  unproject: ([lng, y]) => ({lng, lat: -y}),
  wrapLatLng: point => point
};
const L = {
  layerGroup: () => ({addTo() { return this; }, remove() { layers.length = 0; }}),
  imageOverlay: (url, bounds, options) => ({addTo() { layers.push({url, bounds, options}); }}),
  popup: () => ({
    setLatLng() { return this; },
    setContent(detail) { popup = detail.textContent; return this; },
    openOn() { return this; },
    remove() { popup = null; }
  })
};
const context = {
  map, L, URL, AbortController, AbortSignal, window: {L},
  localStorage: {setItem() {}},
  setInterval() {}, clearTimeout() {},
  showUnifiedRadar() { rainStarts++; }, stopUnifiedAnimation() { rainStops++; },
  document: {
    head: {appendChild() {}},
    createElement: tag => tag === 'canvas' ? {
      getContext: () => ({
        createImageData: (w, h) => ({data: new Uint8ClampedArray(w * h * 4)}),
        putImageData: image => { pixels = image.data; }
      }),
      toDataURL: () => 'data:image/png;base64,test'
    } : {style: {}, setAttribute() {}},
    getElementById: id => ({'v50LayerLegend': legend, 'panel-radar': panel})[id],
    querySelectorAll: () => []
  },
  fetch: (...args) => fetchImpl(...args)
};
vm.createContext(context);
vm.runInContext(source, context);
const tick = () => new Promise(setImmediate);
const rows = (url, current) => ({
  ok: true, json: async () => url.searchParams.get('latitude').split(',').map((_, i) => ({current: current(i)}))
});
const sample = (speed, gust = 72) => ({wind_speed_10m: speed, wind_gusts_10m: gust, time: '2026-11-04T19:00'});

(async () => {
  const calls = [];
  fetchImpl = async url => {
    calls.push(url);
    if (calls.length === 1) return rows(url, i => i === 0 ? sample(null) : sample(45));
    if (calls.length === 2) return {ok: false, status: 503};
    return rows(url, () => sample(0, 0));
  };
  context.test.setMode('wind');
  await tick();
  assert.equal(rainStops, 1);
  assert.deepEqual(calls.map(url => url.searchParams.get('latitude').split(',').length), [25, 1, 1]);
  assert.deepEqual(calls.map(url => url.searchParams.get('models')), ['meteofrance_arome_france_hd', 'meteofrance_seamless', null]);
  assert.equal(calls[0].searchParams.get('current'), 'wind_speed_10m,wind_gusts_10m');
  assert.equal(layers.length, 1);
  assert.equal(layers[0].options.opacity, .48);
  assert.equal(layers[0].options.interactive, false);
  assert.deepEqual([...pixels.slice(0, 4)], [37, 99, 235, 255]);
  assert.deepEqual([...pixels.slice(-4)], [250, 204, 21, 255]);
  assert.match(legend.textContent, /AROME France HD/);
  assert.match(legend.textContent, /Open-Meteo secours/);
  assert.match(legend.scale.innerHTML, /100\+ km\/h/);
  context.test.showWeatherDetails({latlng: [3, 47]});
  assert.match(popup, /45 km\/h.*\n.*72 km\/h.*\n.*AROME France HD.*\n.*19:00/);
  assert.equal(context.test.fieldValue({size: 2, data: [sample(0), sample(40), sample(0), sample(40)]}, .5, .5), 20);
  assert.equal(context.test.fieldValue({size: 2, data: [sample(null), sample(40), sample(0), sample(40)]}, .1, .1), null);
  await context.test.renderOverlay();
  assert.equal(calls.length, 3, 'the same viewport reuses cached samples');

  let release, signal;
  fetchImpl = (url, options) => {
    signal = options.signal;
    return new Promise(resolve => { release = () => resolve(rows(url, () => sample(10))); });
  };
  offset = 10;
  const pending = context.test.renderOverlay();
  context.test.setMode('rain');
  assert.equal(signal.aborted, true);
  release();
  await pending;
  assert.equal(layers.length, 0);
  assert.equal(rainStarts, 1);
  assert.equal(legend.textContent, 'Radar de précipitations en direct.');

  const snowEnd = (Math.floor(Date.now()/3600000)+1)*3600;
  offset = 0;
  const snowCalls = [];
  fetchImpl = async url => {
    snowCalls.push(url);
    const count = url.searchParams.get('latitude').split(',').length;
    return {ok:true,json:async()=>Array.from({length:count},(_,i)=>({
      hourly:{time:[snowEnd-3600,snowEnd,snowEnd+3600],snowfall:[8,i===0&&count===25?null:i===1?0:1.2,9]}
    }))};
  };
  context.test.setMode('snow');
  await tick();
  assert.deepEqual(snowCalls.map(url=>url.searchParams.get('latitude').split(',').length),[25,1]);
  assert.equal(snowCalls[0].searchParams.get('hourly'),'snowfall');
  assert.equal(snowCalls[0].searchParams.get('timeformat'),'unixtime');
  assert.equal(snowCalls[0].searchParams.get('current'),null);
  assert.equal(layers.length,1);
  assert.deepEqual([...pixels.slice(0,4)],[56,89,223,255]);
  assert.equal(pixels[38*4+3],0,'a dry cell stays transparent');
  context.test.showWeatherDetails({latlng:[3,47]});
  assert.match(popup,/1,2 cm/);
  assert.match(popup,/Cumul de/);
  assert.match(popup,/AROME France HD/);
  assert.match(legend.scale.innerHTML,/2 et \+ cm/);
  context.test.setMode('rain');
  assert.equal(layers.length,0);

  fetchImpl = async url => {
    assert.equal(url.searchParams.get('current'),'temperature_2m');
    return rows(url,i=>({temperature_2m:i===0?-15:i===24?32:0,time:'2026-11-04T19:00'}));
  };
  context.test.setMode('temp');
  await tick();
  assert.equal(layers.length,1);
  assert.deepEqual([...pixels.slice(0,4)],[81,70,184,255]);
  assert.deepEqual([...pixels.slice(-4)],[234,88,12,255]);
  assert.match(legend.scale.innerHTML,/0 à < 10 °C/);
  context.test.showWeatherDetails({latlng:[3,47]});
  assert.match(popup,/0 °C.*\n.*19:00.*\n.*AROME France HD/);
  assert.equal(context.test.fieldValue({size:1,data:[{temperature_2m:null}],layerMode:'temp'},.5,.5),null);
  context.test.setMode('rain');
  assert.equal(layers.length,0);

  let cloudCalls = 0;
  fetchImpl = async url => {
    cloudCalls++;
    assert.equal(url.pathname, '/v1/forecast');
    assert.equal(url.searchParams.get('current'), 'cloud_cover');
    return rows(url,i=>({cloud_cover:i===0?null:i===24?80:50}));
  };
  context.test.setMode('cloud');
  await tick();
  assert.equal(layers.length,1);
  assert.equal(pixels[3],0,'missing cloud coverage stays transparent');
  assert.deepEqual([...pixels.slice(-4)],[224,232,239,255]);
  assert.match(legend.textContent,/24\/25 points/);
  assert.match(legend.scale.innerHTML,/75–100 %/);
  context.test.showWeatherDetails({latlng:[3,47]});
  assert.match(popup,/50 %.*\n.*Open-Meteo/);
  await context.test.renderOverlay();
  assert.equal(cloudCalls,2,'only the missing sample is retried');
  context.test.setMode('rain');
  assert.equal(layers.length,0);

  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.match(sw, /wind-field-2/);
  for (const file of ['index.html', 'push-client.js']) {
    const entry = fs.readFileSync(file, 'utf8');
    for (const url of entry.matchAll(/['"]([\w-]+\.js\?v=[\d.]+)['"]/g)) {
      assert.ok(sw.includes("'./" + url[1] + "'"), url[1] + ' must be precached');
    }
  }
  console.log('PASS: wind, snow and temperature rasters, hourly snow, tap details, interpolation, fallback, request abort, cache and return to rain');
})().catch(error => { console.error(error); process.exitCode = 1; });
