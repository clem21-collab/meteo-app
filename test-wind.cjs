const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('v50-radar-layers.js','utf8').replace('  let tries=0;', '  globalThis.test={setMode,renderOverlay,samplePoints,windColor,validWind,fetchPoints};let tries=0;');
const legend={textContent:'',appendChild(){}};let rectangles=[],groups=[],fetchImpl;
const map={getBounds:()=>({getSouth:()=>46,getNorth:()=>48,getWest:()=>4,getEast:()=>6}),getZoom:()=>7,removeLayer(){}};
const L={layerGroup:()=>{const g={layers:[],addTo(){groups.push(this);return this},getLayers(){return this.layers}};return g},rectangle:(bounds,options)=>({bounds,options,bindPopup(html){this.popup=html;return this},addTo(g){g.layers.push(this);rectangles.push(this);return this}})};
const ctx={map,L,window:{L},URL,Map,Date,console,localStorage:{setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},document:{head:{appendChild(){}},createElement:()=>({setAttribute(){}}),getElementById:id=>id==='v50LayerLegend'?legend:null,querySelector:()=>null,querySelectorAll:()=>[]},fetch:(...args)=>fetchImpl(...args)};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
fetchImpl=async u=>({ok:true,json:async()=>Array.from({length:u.searchParams.get('latitude').split(',').length},()=>({current:{wind_speed_10m:45,wind_gusts_10m:72,time:'2026-11-01T12:00'}}))});
ctx.test.setMode('wind');await new Promise(setImmediate);
assert.equal(rectangles.length,25);assert.equal(rectangles[0].options.fillOpacity,.48);assert.equal(rectangles[0].options.fillColor,'#facc15');assert.match(rectangles[0].popup,/72 km\/h/);assert.match(legend.textContent,/AROME France HD/);
assert.equal(ctx.test.validWind({wind_speed_10m:null}),false);assert.equal(ctx.test.validWind({wind_speed_10m:0}),true);
assert.equal(ctx.test.windColor(100),'#a855f7');assert.equal(ctx.test.windColor(20),'#22c55e');
let resolve;fetchImpl=()=>new Promise(r=>resolve=r);map.getBounds=()=>({getSouth:()=>40,getNorth:()=>42,getWest:()=>2,getEast:()=>4});const pending=ctx.test.renderOverlay();ctx.test.setMode('rain');resolve({ok:true,json:async()=>Array.from({length:25},()=>({current:{wind_speed_10m:10}}))});await pending;assert.equal(legend.textContent,'Radar de précipitations en direct.');
const sw=fs.readFileSync('sw.js','utf8');assert.match(sw,/wind-color-2/);assert.match(sw,/v50-radar-layers.js\?v=5.0.2/);console.log('PASS: colored coverage, popup, legend, null/zero values, thresholds, stale request cancellation, cache version');
})().catch(e=>{console.error(e);process.exitCode=1});
