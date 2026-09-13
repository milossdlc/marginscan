import {snapshotQuality,type ProviderFeed,type Quality,type ProviderDescriptor} from './provider';
import {db} from '../platform/server';
import {enqueueClosing} from './closing';
export type MarketIdentity={fixtureId:string;sport:string;marketType:string;period:string;selectionKey:string;line:number|null;rules:string;currency:'decimal'};
export type Observation={observedAt:number;providerUpdatedAt:number;line:number|null;odds:number;source:'Pinnacle';provider:string;inPlay:false;providerId?:string;schemaVersion?:number;qualityAtCollection?:Quality;collectionRunAt?:number;transportSnapshotAt?:number};
export type LocalQuote={identity:MarketIdentity;bookmaker:string;provider:string;odds:number;observedAt:number;providerUpdatedAt:number;inPlay:boolean};
export function compareLocal(identity:MarketIdentity,pin:Observation,local:LocalQuote|null,at=Date.now()){
 if(!local)return {status:'not_connected',label:'Local price not connected',local:null,differencePercent:null};
 const fields:(keyof MarketIdentity)[]=['fixtureId','sport','marketType','period','selectionKey','line','rules','currency'];
 if(fields.some(k=>identity[k]!==local.identity[k]))return {status:'market_mismatch',label:'Markets do not match',local,differencePercent:null};
 if(local.inPlay||!Number.isFinite(local.odds)||local.odds<=1||!Number.isFinite(pin.odds)||pin.odds<=1)return {status:'invalid',label:'Quote unavailable',local:null,differencePercent:null};
 const times=[pin.providerUpdatedAt,local.providerUpdatedAt,pin.observedAt,local.observedAt];
 if(times.some(t=>!Number.isFinite(t)||t>at+60000||at-t>600000)||Math.abs(pin.providerUpdatedAt-local.providerUpdatedAt)>300000)return {status:'stale',label:'Prices are not current enough to compare',local,differencePercent:null};
 return {status:'matched',label:'Matched market',local,differencePercent:Number(((local.odds/pin.odds-1)*100).toFixed(2))};
}
type Feed=ProviderFeed;
type State={key:string;identity:MarketIdentity;last:Observation;peak:Observation;opening:Observation;lowest:Observation;highest:Observation;lastAlertedDrop:number;lastAlertedAt:number;commenceTime:number};
type History={selectionKey:string;identity:MarketIdentity;commenceTime:number;points:Observation[];firstObservedAt:number;lastObservedAt:number};
const day=(t:number)=>new Date(t).toISOString().slice(0,10);
const safe=(id:string)=>encodeURIComponent(id);
export const historyTable=(id:string,date:string)=>'sharp_history_v6:'+safe(id)+':'+date;
const checked=(results:unknown[])=>{if(results.some(x=>!x))throw new Error('Sharp history could not be persisted');};
export async function collectV6(feed:Feed,provider:ProviderDescriptor={id:'the-odds-api',name:'The Odds API',marketSource:'Pinnacle',direct:false,coverage:'Bundesliga · Match winner · Full time'}){
 const at=Date.now();if(feed.mode!=='live'||feed.source.includes('stale cache'))return {mode:'unavailable',source:feed.source,created:0,tracked:0};
 let created=0,tracked=0;
 for(const f of feed.fixtures){
  if(f.commenceTime<=at)continue;
  const pin=f.quotes.find(q=>q.bookmaker.toLowerCase()==='pinnacle');
  if(!pin)continue;
  const table='sharp_state_v6:'+safe(f.id);
  const states=await db.list<State>(table,{limit:100});
  const historyName=historyTable(f.id,day(at));
  const histories=await db.list<History>(historyName,{limit:100});
  const selections=[...(['home','draw','away'] as const).map(selectionKey=>({selectionKey,odds:pin[selectionKey],line:null as number|null,updatedAt:pin.updatedAt})),...(f.totals||[])];
  for(const quote of selections){
   const {selectionKey,odds,line,updatedAt}=quote;if(!Number.isFinite(odds)||odds<=1)continue;
   const previous=states.items.find(s=>s.identity.selectionKey===selectionKey);
   if(previous&&at-previous.last.observedAt<240000)continue;
   const identity:MarketIdentity={fixtureId:f.id,sport:'soccer',marketType:line===null?'h2h':'totals',period:'full_time',selectionKey,line,rules:'regulation_time',currency:'decimal'};
   const point:Observation={observedAt:at,providerUpdatedAt:Number.isFinite(updatedAt)?updatedAt:0,line,odds,source:'Pinnacle',provider:provider.name,providerId:provider.id,schemaVersion:7,collectionRunAt:at,transportSnapshotAt:feed.snapshotAt,qualityAtCollection:snapshotQuality({odds,observedAt:feed.snapshotAt,providerUpdatedAt:updatedAt},at),inPlay:false};
   const oldHistory=histories.items.find(h=>h.selectionKey===selectionKey);
   if(oldHistory?.points.some(p=>at-p.observedAt<240000))continue;
   const history:History={selectionKey,identity,commenceTime:f.commenceTime,points:[...(oldHistory?.points||[]),point],firstObservedAt:oldHistory?.firstObservedAt||at,lastObservedAt:at};
   if(history.points.length>360||new TextEncoder().encode(JSON.stringify(history)).length>240000)throw new Error('Daily history capacity exceeded');
   if(oldHistory)checked(await db.update(historyName,[{id:oldHistory.id,record:history}]));else checked(await db.add(historyName,[history]));
   if(point.qualityAtCollection!=='fresh')continue;
   const resetPeak=!previous||at-previous.peak.observedAt>86400000||odds>previous.peak.odds;
   const peak=resetPeak?point:previous.peak;
   const state:State={key:f.id+'|'+selectionKey,identity,last:point,peak,opening:previous?.opening||point,lowest:!previous||odds<previous.lowest.odds?point:previous.lowest,highest:!previous||odds>previous.highest.odds?point:previous.highest,lastAlertedDrop:previous?.lastAlertedDrop||0,lastAlertedAt:previous?.lastAlertedAt||0,commenceTime:f.commenceTime};
   const drop=(state.opening.odds-odds)/state.opening.odds*100;
   if(previous&&odds<previous.last.odds&&drop>=5&&(!state.lastAlertedAt||drop>=state.lastAlertedDrop+1||[5,8,10,12,15].some(t=>drop>=t&&state.lastAlertedDrop<t))){
    const movement={schemaVersion:6,key:state.key,fixtureId:f.id,homeTeam:f.homeTeam,awayTeam:f.awayTeam,league:f.league,selection:selectionKey==='home'?f.homeTeam:selectionKey==='away'?f.awayTeam:selectionKey==='draw'?'Draw':(selectionKey.startsWith('over_')?'Over ':'Under ')+line,identity,fromOdds:state.opening.odds,toOdds:odds,dropPercent:Number(drop.toFixed(2)),detectedAt:at,signalTimestamp:at,durationMinutes:Number(((at-state.opening.observedAt)/60000).toFixed(1)),source:'Pinnacle via '+provider.name,marketSource:'Pinnacle',providerId:provider.id,status:'active',commenceTime:f.commenceTime,before:previous.last,after:point,fromLine:previous.last.line,toLine:point.line,signalLine:point.line,peak,opening:state.opening,highest:state.highest,lowest:state.lowest,entryOdds:odds,closing:{status:'not_captured',odds:null,line:null,providerUpdatedAt:null,observedAt:null,clvPercent:null,method:null},comparison:compareLocal(identity,point,null)};
    const ids=await db.add('sharp_signals_v6:'+day(at),[movement]);checked(ids);await enqueueClosing(ids[0]!,at,f.commenceTime);created++;state.lastAlertedAt=at;state.lastAlertedDrop=drop;
   }
   if(previous)checked(await db.update(table,[{id:previous.id,record:state}]));else checked(await db.add(table,[state]));
   tracked++;
  }
 }
 return {mode:'live',source:feed.source,created,tracked};
}
export async function recentV6(hours:number,minDrop:number,archiveDate?:string){
 const cutoff=archiveDate?Date.parse(archiveDate+'T00:00:00Z'):Date.now()-hours*3600000;
 const end=archiveDate?cutoff+86400000:Date.now()+1;
 const dates=archiveDate?[archiveDate]:Array.from({length:Math.floor((Date.now()-Date.parse(day(cutoff)+'T00:00:00Z'))/86400000)+1},(_,i)=>day(cutoff+i*86400000));
 const pages=await Promise.all(dates.map(d=>db.list<{detectedAt:number;dropPercent:number;commenceTime:number;signalTimestamp:number;before?:Observation;after?:Observation}>('sharp_signals_v6:'+d,{limit:500})));
 const signals=pages.flatMap(p=>p.items).filter(m=>m.detectedAt>=cutoff&&m.detectedAt<end&&m.dropPercent>=minDrop);
 const statePages=new Map<string,Awaited<ReturnType<typeof db.list<State>>>>();
 if(!archiveDate){
  const ids=[...new Set(signals.map(m=>(m as unknown as {fixtureId:string}).fixtureId))];
  for(const id of ids)statePages.set(id,await db.list<State>('sharp_state_v6:'+safe(id),{limit:100}));
 }
 const items=signals.map(m=>{
  const signal=m as typeof m & {fixtureId:string;identity?:MarketIdentity};
  const state=statePages.get(signal.fixtureId)?.items.find(s=>s.identity.selectionKey===signal.identity?.selectionKey&&s.identity.line===signal.identity?.line);
  return {...m,current:state?.last||null,lifecycle:Date.now()>=m.commenceTime?'Closed':Date.now()-m.signalTimestamp<300000?'New':'Tracking'};
 });
 return {items,truncated:pages.some(p=>!!p.nextToken)};
}
export async function readHistory(fixtureId:string,date:string,selectionKey:string){
 const page=await db.list<History>(historyTable(fixtureId,date),{limit:100});
 const history=page.items.find(h=>h.selectionKey===selectionKey);return history?{...history,points:history.points.map(p=>({...p,qualityAtCollection:p.qualityAtCollection||snapshotQuality(p,p.observedAt),qualityNow:snapshotQuality(p)}))}:null;
}


