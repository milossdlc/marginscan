import {db} from '../platform/server';
type Point={observedAt:number;providerUpdatedAt:number;line:number|null;odds:number;qualityAtCollection?:string};
type Closing={status:'calculated'|'unavailable';odds:number|null;line:number|null;providerUpdatedAt:number|null;observedAt:number|null;clvPercent:number|null;method:string|null;version:'CLV_V1'|null};
type Signal={id:string;fixtureId:string;commenceTime:number;detectedAt:number;entryOdds:number;closing?:Closing;identity:{selectionKey:string;line?:number|null}};
type History={selectionKey:string;points:Point[]};
type Pending={signalId:string;detectedAt:number;commenceTime:number};
type Progress={migrationDay:string;migrationToken?:string;queueToken?:string};
const day=(t:number)=>new Date(t).toISOString().slice(0,10);
const historyTable=(id:string,date:string)=>'sharp_history_v6:'+encodeURIComponent(id)+':'+date;
const signalTable=(t:number)=>'sharp_signals_v6:'+day(t);
const queue='sharp_closing_pending_v43',progressTable='sharp_closing_progress_v43';
const checked=(r:unknown[])=>{if(r.some(x=>!x))throw new Error('Closing persistence failed')};
export async function enqueueClosing(signalId:string,detectedAt:number,commenceTime:number){checked(await db.add(queue,[{signalId,detectedAt,commenceTime}]))}
export function resolveClosing(signal:Signal,points:Point[]):Closing{
 const point=points.filter(p=>p.observedAt>=signal.commenceTime-600000&&p.providerUpdatedAt>=signal.commenceTime-600000&&p.observedAt>=signal.detectedAt&&p.observedAt<signal.commenceTime&&Number.isFinite(p.odds)&&p.odds>1&&Number.isFinite(p.providerUpdatedAt)&&p.providerUpdatedAt>0&&p.providerUpdatedAt<signal.commenceTime&&p.qualityAtCollection==='fresh'&&p.line===(signal.identity.line??null)).sort((a,b)=>b.observedAt-a.observedAt)[0];
 if(!point||!Number.isFinite(signal.entryOdds)||signal.entryOdds<=1)return {status:'unavailable',odds:null,line:null,providerUpdatedAt:null,observedAt:null,clvPercent:null,method:null,version:null};
 return {status:'calculated',odds:point.odds,line:point.line,providerUpdatedAt:point.providerUpdatedAt,observedAt:point.observedAt,clvPercent:Number(((signal.entryOdds/point.odds-1)*100).toFixed(2)),method:'last_valid_pre_kickoff_observation',version:'CLV_V1'};
}
export async function finalizeRecentClosings(at=Date.now()){
 const statePage=await db.list<Progress>(progressTable,{limit:1});
 const saved=statePage.items[0];
 // One-time archive backfill starts at the app's first release date. Each run advances one page.
 const progress:Progress=saved?{...saved}:{migrationDay:'2026-09-08'};
 if(progress.migrationDay<day(at)){
  const t=Date.parse(progress.migrationDay+'T00:00:00Z');
  const page=await db.list<Signal>(signalTable(t),{limit:25,...(progress.migrationToken?{nextToken:progress.migrationToken}:{})});
  for(const s of page.items){if(Number.isFinite(s.commenceTime)&&s.commenceTime>0&&s.identity&&!['calculated','unavailable'].includes(s.closing?.status||''))await enqueueClosing(s.id,s.detectedAt,s.commenceTime)}
  progress.migrationToken=page.nextToken;
  if(!page.nextToken)progress.migrationDay=day(t+86400000);
 }
 const pending=await db.list<Pending>(queue,{limit:25,...(progress.queueToken?{nextToken:progress.queueToken}:{})});
 let finalized=0,unavailable=0;
 for(const item of pending.items){
  if(item.commenceTime>at)continue;
  const [record]=await db.get<Omit<Signal,'id'>>(signalTable(item.detectedAt),[item.signalId]);
  if(!record||['calculated','unavailable'].includes(record.closing?.status||'')){checked(await db.delete(queue,[item.id]));continue}
  const signal={...record,id:item.signalId};
  const dates=[...new Set([day(signal.commenceTime),day(signal.commenceTime-86400000),day(signal.detectedAt)])];
  const pages=await Promise.all(dates.map(d=>db.list<History>(historyTable(signal.fixtureId,d),{limit:100})));
  const points=pages.flatMap(p=>p.items).filter(h=>h.selectionKey===signal.identity.selectionKey).flatMap(h=>h.points);
  const closing=resolveClosing(signal,points);
  checked(await db.update(signalTable(signal.detectedAt),[{id:signal.id,record:{...record,closing}}]));
  checked(await db.delete(queue,[item.id]));
  if(closing.status==='calculated')finalized++;else unavailable++;
 }
 progress.queueToken=pending.nextToken;
 if(saved)checked(await db.update(progressTable,[{id:saved.id,record:progress}]));else checked(await db.add(progressTable,[progress]));
 return {finalized,unavailable};
}


