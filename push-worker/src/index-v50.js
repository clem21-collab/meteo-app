import base from "./index-v41.js";
import webpush from "web-push";

const SUB_KEY = "subscription:advanced-v50";
const STATE_PREFIX = "alert:v50:";

function clamp(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function validSubscription(sub){return !!(sub&&typeof sub.endpoint==="string"&&sub.endpoint.startsWith("https://")&&sub.keys?.p256dh&&sub.keys?.auth);}
function configureWebPush(env){if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)throw new Error("VAPID keys are missing");webpush.setVapidDetails(env.VAPID_SUBJECT||env.APP_URL,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);}
async function sendPush(env,record,payload){configureWebPush(env);try{await webpush.sendNotification(record.subscription,JSON.stringify(payload),{TTL:3600,urgency:payload.urgency||"normal"});return true;}catch(error){const status=Number(error?.statusCode||error?.status||0);if(status===404||status===410){await env.PUSH_KV.delete(SUB_KEY);return false;}throw error;}}

function minutesOfDay(value){const m=String(value||"").match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):0;}
function isQuiet(record,currentTime){if(record.settings?.quiet!==true)return false;const t=String(currentTime||"").split("T")[1]?.slice(0,5);if(!t)return false;const now=minutesOfDay(t),start=minutesOfDay(record.settings.quietStart||"22:00"),end=minutesOfDay(record.settings.quietEnd||"07:00");return start===end?true:start<end?(now>=start&&now<end):(now>=start||now<end);}

async function saveSubscription(request,env){
  let body;try{body=await request.clone().json();}catch{return;}
  if(!validSubscription(body?.subscription))return;
  const s=body.settings||{};
  const record={subscription:body.subscription,latitude:Number(body.latitude),longitude:Number(body.longitude),city:String(body.city||"Ma position").slice(0,120),settings:{
    frost:s.frost!==false,frostThreshold:clamp(s.frostThreshold,-15,8,0),
    heat:s.heat!==false,heatThreshold:clamp(s.heatThreshold,20,45,30),
    smartWind:s.smartWind!==false,windThreshold:clamp(s.windThreshold,30,150,60),
    smartStorm:s.smartStorm!==false,smartLeadHours:clamp(s.smartLeadHours||s.leadHours,1,12,6),
    quiet:s.quiet===true,quietStart:String(s.quietStart||"22:00").slice(0,5),quietEnd:String(s.quietEnd||"07:00").slice(0,5)
  },updatedAt:Date.now()};
  if(Number.isFinite(record.latitude)&&Number.isFinite(record.longitude))await env.PUSH_KV.put(SUB_KEY,JSON.stringify(record));
}

async function fetchForecast(record){const u=new URL("https://api.open-meteo.com/v1/forecast");u.searchParams.set("latitude",record.latitude);u.searchParams.set("longitude",record.longitude);u.searchParams.set("timezone","auto");u.searchParams.set("forecast_hours","24");u.searchParams.set("current","temperature_2m,weather_code,wind_gusts_10m");u.searchParams.set("hourly","temperature_2m,weather_code,wind_gusts_10m");const r=await fetch(u,{cf:{cacheTtl:300}});if(!r.ok)throw new Error(`Open-Meteo HTTP ${r.status}`);return r.json();}

function firstFutureIndex(data){const h=data?.hourly;if(!h?.time?.length)return 0;const now=String(data?.current?.time||"");let i=h.time.findIndex(t=>String(t)>=now);return i<0?0:i;}
function withinLead(data,start,leadHours,predicate){const h=data?.hourly,end=Math.min(h?.time?.length||0,start+Math.max(1,leadHours)+1);for(let i=start;i<end;i++)if(predicate(i,h))return i;return-1;}
function hourLabel(iso){return String(iso||"").split("T")[1]?.slice(0,5)||"bientôt";}

async function shouldSend(env,type,fingerprint,cooldownMs){const previous=await env.PUSH_KV.get(`${STATE_PREFIX}${type}`,"json");const now=Date.now();if(previous?.fingerprint===fingerprint||Number(previous?.blockedUntil||0)>now)return false;return true;}
async function markSent(env,type,fingerprint,cooldownMs){const now=Date.now();await env.PUSH_KV.put(`${STATE_PREFIX}${type}`,JSON.stringify({fingerprint,sentAt:now,blockedUntil:now+cooldownMs}));}
async function alertOnce(env,record,type,fingerprint,payload,cooldownMs=6*3600000){if(!(await shouldSend(env,type,fingerprint,cooldownMs)))return;const sent=await sendPush(env,record,payload);if(sent)await markSent(env,type,fingerprint,cooldownMs);}

async function checkV50Alerts(env){
  const record=await env.PUSH_KV.get(SUB_KEY,"json");if(!record?.subscription)return;
  const data=await fetchForecast(record);if(isQuiet(record,data?.current?.time))return;
  const h=data?.hourly;if(!h?.time?.length)return;const start=firstFutureIndex(data),lead=clamp(record.settings?.smartLeadHours,1,12,6),app=env.APP_URL||"https://clem21-collab.github.io/meteo-app/";
  const tasks=[];

  if(record.settings?.frost!==false){const threshold=clamp(record.settings?.frostThreshold,-15,8,0),i=withinLead(data,start,12,(j,x)=>Number(x.temperature_2m?.[j])<=threshold);if(i>=0){const temp=Number(h.temperature_2m[i]),fp=`${record.city}|${h.time[i]}|${threshold}`;tasks.push(alertOnce(env,record,"frost",fp,{title:"❄️ Risque de gel",body:`${Math.round(temp)} °C prévus vers ${hourLabel(h.time[i])} à ${record.city}.`,urgency:"high",tag:"meteo-frost-v50",data:{url:`${app}?tab=alerts`,type:"frost"},icon:`${app}icon.svg`},8*3600000));}}

  if(record.settings?.heat!==false){const threshold=clamp(record.settings?.heatThreshold,20,45,30),i=withinLead(data,start,12,(j,x)=>Number(x.temperature_2m?.[j])>=threshold);if(i>=0){const temp=Number(h.temperature_2m[i]),fp=`${record.city}|${h.time[i]}|${threshold}`;tasks.push(alertOnce(env,record,"heat",fp,{title:"🌡️ Forte chaleur",body:`${Math.round(temp)} °C prévus vers ${hourLabel(h.time[i])} à ${record.city}.`,urgency:"normal",tag:"meteo-heat-v50",data:{url:`${app}?tab=alerts`,type:"heat"},icon:`${app}icon.svg`},8*3600000));}}

  if(record.settings?.smartWind!==false){const threshold=clamp(record.settings?.windThreshold,30,150,60),i=withinLead(data,start,lead,(j,x)=>Number(x.wind_gusts_10m?.[j])>=threshold);if(i>=0){const gust=Number(h.wind_gusts_10m[i]),fp=`${record.city}|${h.time[i]}|${threshold}`;tasks.push(alertOnce(env,record,"wind",fp,{title:"💨 Fortes rafales bientôt",body:`Rafales jusqu’à ${Math.round(gust)} km/h vers ${hourLabel(h.time[i])} à ${record.city}.`,urgency:"high",tag:"meteo-wind-v50",data:{url:`${app}?tab=alerts`,type:"wind"},icon:`${app}icon.svg`},5*3600000));}}

  if(record.settings?.smartStorm!==false){const i=withinLead(data,start,lead,(j,x)=>[95,96,99].includes(Number(x.weather_code?.[j])));if(i>=0){const fp=`${record.city}|${h.time[i]}|storm`;tasks.push(alertOnce(env,record,"storm",fp,{title:"⛈️ Orage possible",body:`Signal orageux prévu vers ${hourLabel(h.time[i])} à ${record.city}.`,urgency:"high",tag:"meteo-storm-v50",data:{url:`${app}?tab=alerts`,type:"storm"},icon:`${app}icon.svg`},5*3600000));}}

  await Promise.allSettled(tasks);
}

export default{
  async fetch(request,env,ctx){const url=new URL(request.url);try{if(request.method==="POST"&&url.pathname==="/subscribe")await saveSubscription(request,env);if(request.method==="POST"&&url.pathname==="/unsubscribe"){await env.PUSH_KV.delete(SUB_KEY);for(const type of ["frost","heat","wind","storm"])await env.PUSH_KV.delete(`${STATE_PREFIX}${type}`);}}catch(error){console.warn("V5 subscription extension",error?.message||error);}return base.fetch(request,env,ctx);},
  async scheduled(controller,env,ctx){if(typeof base.scheduled==="function")base.scheduled(controller,env,ctx);ctx.waitUntil(checkV50Alerts(env));}
};
