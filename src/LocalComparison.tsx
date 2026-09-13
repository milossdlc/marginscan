import {useEffect,useState} from 'react';
import {api} from '@appdeploy/client';

export type Point={observedAt:number;providerUpdatedAt:number;line:number|null;odds:number;qualityAtCollection?:string;qualityNow?:string};
export type LiveSignal={id?:string;key:string;fixtureId:string;homeTeam:string;awayTeam:string;league:string;selection:string;fromOdds:number;toOdds:number;dropPercent:number;detectedAt:number;durationMinutes:number;source:string;marketSource?:string;status:string;schemaVersion?:number;signalTimestamp?:number;commenceTime?:number;lifecycle?:string;identity?:{selectionKey:string;marketType:string;period:string;line:number|null};opening?:Point;current?:Point|null;before?:Point;after?:Point;closing?:{status:string;odds:number|null;line:number|null;providerUpdatedAt:number|null;observedAt:number|null;clvPercent:number|null;method:string|null;version:string|null};};

const date=(timestamp:number)=>new Date(timestamp).toISOString().slice(0,10);
function exactTime(timestamp:number){if(!Number.isFinite(timestamp)||timestamp<=0)return '—';return new Date(timestamp).toLocaleString([],{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})}

export function SignalHistory({signal}:{signal:LiveSignal}){
 const [selectedDay,setSelectedDay]=useState(date(signal.detectedAt));
 const [points,setPoints]=useState<Point[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;
  setPoints([]);setError('');
  if(!signal.identity)return;
  setLoading(true);
  const refresh=()=>api.get('/api/sharp/history?fixtureId='+encodeURIComponent(signal.fixtureId)+'&selection='+signal.identity!.selectionKey+'&date='+selectedDay).then(({data})=>{if(active){setPoints(data.history?.points||[]);setError('')}}).catch(()=>{if(active)setError('Price history could not be loaded.')}).finally(()=>{if(active)setLoading(false)});
  void refresh();
  const timer=window.setInterval(()=>void refresh(),300000);
  return()=>{active=false;window.clearInterval(timer)};
 },[signal.fixtureId,signal.identity?.selectionKey,selectedDay,retry]);
 const closing=signal.closing?.status==='calculated'&&signal.closing.odds?signal.closing.odds:null;
 return <section className='price-history'>
  <div className='history-head'><div><h3>Price history</h3><p>Opening is the first price captured by MarginScan, not a verified bookmaker opening. Closing requires a fresh snapshot within 10 minutes before kickoff.</p></div><label>Day<input type='date' value={selectedDay} max={date(Date.now())} onChange={event=>event.target.value&&setSelectedDay(event.target.value)}/></label></div>
  <div className='history-summary'><span>Opening <b>{signal.opening?.odds?.toFixed(2)??signal.fromOdds.toFixed(2)}</b></span><span>Signal <b>{signal.toOdds.toFixed(2)}</b></span><span>Closing <b>{closing?.toFixed(2)??(signal.closing?.status==='unavailable'?'N/A':'Pending')}</b></span><span>Signal time <b>{exactTime(signal.signalTimestamp||signal.detectedAt)}</b></span></div>
  {loading?<p role='status'>Loading saved snapshots…</p>:error?<p role='alert' className='history-error'>{error} <button onClick={()=>setRetry(value=>value+1)}>Retry</button></p>:!points.length?<p className='history-empty'>No stored snapshots for this day.</p>:<div className='history-scroll'><table className='history-points'><thead><tr><th>Observed</th><th>Pinnacle update</th><th>Odds</th><th>Collection quality</th></tr></thead><tbody>{points.map((point,index)=><tr key={point.observedAt+'-'+index}><td>{exactTime(point.observedAt)}</td><td>{exactTime(point.providerUpdatedAt)}</td><td><b>{point.odds.toFixed(3)}</b></td><td>{point.qualityAtCollection||'unknown'}</td></tr>)}</tbody></table></div>}
  <p className='history-footnote'>Snapshots are recorded every five minutes when available. Gaps are not interpolated and missing closing prices are not reconstructed.</p>
 </section>;
}

