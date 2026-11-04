const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const nodes=new Map(), layers=new Set(), requested=[];
const map={setView(){},invalidateSize(){},getZoom:()=>7,hasLayer:l=>layers.has(l)};
const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:id==='radarOpacityV34'?'68':'0',dataset:{},style:{},classList:{add(){},remove(){}}});
  return nodes.get(id);
};
function makeLayer(url,options){
  const layer={url,options,handlers:{},on(events){this.handlers=events;},off(){this.handlers={};},
    addTo(){layers.add(this);requested.push(this);},remove(){layers.delete(this);},
    setOpacity(opacity){this.opacity=opacity;}};
  return layer;
}
const old=makeLayer('previous',{});
layers.add(old);
const context=vm.createContext({
  window:{meteoRadarShowsRain:()=>true},document:{body:{classList:{contains:()=>false}},getElementById:node,querySelector:()=>null},
  setTimeout,clearTimeout,console,Date,map,marker:null,radarLayer:old,mfForecastLayer:null,currentPlace:{latitude:47,longitude:5},
  stopMfAnimation(){},stopObservedAnimation(){},initMap:()=>true,radarFrames:[],fmtUnixHour:()=> '18:00',localHour:()=> '18:00',
  L:{tileLayer:makeLayer,imageOverlay:makeLayer},
  fetchRadarFrames:async()=>({host:'https://tiles.example',frames:[{time:Math.floor(Date.now()/1000)-60,path:'/rain'}]}),
  fetchMfMeta:async()=>{throw new Error('forecast offline');}
});
vm.runInContext(fs.readFileSync('v36.js','utf8').replace(/\(function initV36\(\)\{[\s\S]*?\n\}\)\(\);/,''),context);
const tick=()=>new Promise(setImmediate);
(async()=>{
  let animation;
  const opening=context.showUnifiedRadar();
  await tick();
  const next=requested.at(-1);
  assert.match(next.url,/\/rain\/256/);
  assert.equal(next.options.opacity,0);
  assert.ok(layers.has(old),'previous frame stays visible while loading');
  next.getContainer=()=>({animate:(frames,options)=>{animation={frames,options,cancel(){this.cancelled=true;}};return animation;}});
  next.handlers.load();
  assert.equal(await opening,true);
  assert.equal(next.opacity,.68);
  assert.equal(animation.options.duration,160);
  assert.ok(layers.has(old),'old frame remains under the fade');
  context.stopUnifiedAnimation();
  assert.ok(animation.cancelled);
  assert.ok(!layers.has(old));
  assert.match(node('radarStatus').textContent,/Observations RainViewer.*prévisions indisponibles/);

  const failed=context.showUnifiedFrame(0);
  const broken=requested.at(-1);
  broken.handlers.tileerror();
  broken.handlers.load();
  assert.equal(await failed,false);
  assert.ok(layers.has(next));
  assert.ok(!layers.has(broken));

  const pending=context.showUnifiedFrame(0);
  const discarded=requested.at(-1);
  context.stopUnifiedAnimation();
  assert.equal(await pending,false);
  assert.ok(layers.has(next));
  assert.ok(!layers.has(discarded));

  vm.runInContext('makeUnifiedFrames([],null)',context);
  assert.equal(vm.runInContext('v36Frames.length',context),0);
  console.log('PASS: observations-only fallback, previous frame retained during load/error, cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
