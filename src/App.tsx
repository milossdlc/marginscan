import {openingOdds,currentOdds,currentDrop,marketLabel,uniqueMoves,openingDrop,closingOdds,openingToClose,impliedDelta,pathLabel} from './signalMetrics';
import {api,auth} from './client';
import {Fragment,useEffect,useId,useRef,useState} from 'react';
import {Activity,ChartNoAxesCombined,RefreshCw,X} from 'lucide-react';
import BetaReadiness from './BetaReadiness';
import OwnerReview from './OwnerReview';
import {SignalHistory,type LiveSignal} from './LocalComparison';
import './beta-readiness.css';
import './movements.css';

type View='Sharp Scanner'|'Live Watchlist'|'History & Analytics'|'Settings'|'Feedback';
type MatchWindow='today'|'tomorrow'|'date'|'next24'|'all';
type SortMode='drop'|'kickoff'|'odds';
type LiveMeta={live:boolean;note:string;coverage:string;leagues:string[];trackedFixtures:number};

const views:View[]=['Sharp Scanner','Live Watchlist','History & Analytics','Settings','Feedback'];
const sharpThresholds=[5,8,10,12,15];
const providerCopy='Pinnacle prices are collected through an external odds data provider. Scheduled collection runs every 5 minutes. Provider prices may be delayed; this is not a direct Pinnacle feed.';

function Info({label,text}:{label:string;text:string}){
 const id=useId();
 const [active,setActive]=useState(false);
 const root=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  if(!active)return;
  const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setActive(false)};
  document.addEventListener('pointerdown',close);
  return()=>document.removeEventListener('pointerdown',close);
 },[active]);
 return <span className='mv-info' ref={root}>
  <button type='button' aria-label={'About '+label} aria-describedby={active?id:undefined} aria-expanded={active} onClick={()=>setActive(v=>!v)} onMouseEnter={()=>setActive(true)} onMouseLeave={()=>setActive(false)} onFocus={()=>setActive(true)} onBlur={()=>setActive(false)}>ⓘ</button>
  {active&&<span id={id} role='tooltip'>{text}</span>}
 </span>;
}

function readThreshold(){
 try{const value=Number(localStorage.getItem('marginscan-sharp-threshold'));return sharpThresholds.includes(value)?value:8}catch{return 8}
}
function isPinnacle(signal:LiveSignal){return signal.marketSource==='Pinnacle'||signal.source==='Pinnacle via The Odds API'}
const leagueCountries:Record<string,string>={'Premier League':'England','Championship':'England','FA Cup':'England','EFL Cup':'England','League One':'England','League Two':'England','Bundesliga':'Germany','2. Bundesliga':'Germany','3. Liga':'Germany','DFB-Pokal':'Germany','La Liga':'Spain','La Liga 2':'Spain','Copa del Rey':'Spain','Serie A':'Italy','Serie B':'Italy','Ligue 1':'France','Ligue 2':'France','Eredivisie':'Netherlands','Primeira Liga':'Portugal','Scottish Premiership':'Scotland','Turkish Süper Lig':'Turkey','Swiss Super League':'Switzerland','Danish Superliga':'Denmark','Greek Super League':'Greece','Saudi Pro League':'Saudi Arabia','MLS':'USA / Canada','Brazil Série A':'Brazil','J League':'Japan','Eliteserien':'Norway','Allsvenskan':'Sweden','Veikkausliiga':'Finland','League of Ireland':'Ireland'};
function country(signal:LiveSignal){return leagueCountries[signal.league]||(signal.league.startsWith('UEFA')?'Europe':signal.league==='Copa Libertadores'?'South America':'Other / unknown')}
function localDate(timestamp:number){const date=new Date(timestamp);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')}
function sameLocalDay(timestamp?:number){if(!timestamp)return false;return new Date(timestamp).toDateString()===new Date().toDateString()}
function timeLabel(timestamp?:number){if(!timestamp)return '—';return new Date(timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function dateTimeLabel(timestamp?:number){if(!timestamp)return '—';return new Date(timestamp).toLocaleString([],{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function signed(value:number|null,suffix='%'){if(value===null||!Number.isFinite(value))return '—';return `${value>0?'+':''}${value.toFixed(1)}${suffix}`}

function SignalDetails({signal,onClose}:{signal:LiveSignal;onClose:()=>void}){
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{root.current?.scrollIntoView({block:'nearest',behavior:'smooth'});root.current?.focus({preventScroll:true})},[signal.id,signal.key]);
 const close=closingOdds(signal);
 const openClose=openingToClose(signal);
 const probability=impliedDelta(signal);
 return <section ref={root} tabIndex={-1} onKeyDown={event=>{if(event.key==='Escape')onClose()}} className='signal-detail' aria-label='Signal details'>
  <div className='detail-head'>
   <div><p className='eyebrow'>PINNACLE PRICE PATH</p><h2>{signal.homeTeam} – {signal.awayTeam}</h2><p>{signal.league} · {signal.selection} · {marketLabel(signal)}</p></div>
   <button className='icon-button' aria-label='Close details' onClick={onClose}><X size={18}/></button>
  </div>
  <div className='detail-metrics'>
   <div><small>Opening</small><strong>{openingOdds(signal).toFixed(2)}</strong></div>
   <div><small>Signal</small><strong>{signal.toOdds.toFixed(2)}</strong></div>
   <div><small>Closing</small><strong>{close?.toFixed(2)??(['unavailable','calculated'].includes(signal.closing?.status||'')?'N/A':'Pending')}</strong></div>
   <div><small>Opening → signal</small><strong>{signed(-openingDrop(signal))}</strong></div>
   <div><small>Opening → closing</small><strong>{openClose===null?'—':signed(-openClose)}</strong></div>
   <div><small>Implied probability Δ</small><strong>{signed(probability,' pp')}</strong></div>
  </div>
  <p className='detail-note'>Kickoff {dateTimeLabel(signal.commenceTime)} · Path after signal: <b>{pathLabel(signal)}</b>. This records market movement; it is not a live-betting recommendation.</p>
  <SignalHistory key={signal.id||signal.key} signal={signal}/>
 </section>;
}

export default function App(){
 const [watchWindow,setWatchWindow]=useState('all');
 const [service,setService]=useState<{collectorEnabled:boolean;authenticationConfigured:boolean}|null>(null);
 const [view,setView]=useState<View>('Sharp Scanner');
 const [user,setUser]=useState<{userId:string;name?:string;email?:string}|null>(null);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState('');
 const [liveMoves,setLiveMoves]=useState<LiveSignal[]>([]);
 const [liveLoading,setLiveLoading]=useState(false);
 const [liveError,setLiveError]=useState('');
 const [liveMeta,setLiveMeta]=useState<LiveMeta|null>(null);
 const [sharpThreshold,setSharpThreshold]=useState(readThreshold);
 const [matchWindow,setMatchWindow]=useState<MatchWindow>('today');
 const [minOdds,setMinOdds]=useState(1.01);
 const [maxOdds,setMaxOdds]=useState(2.5);
 const [leagueFilter,setLeagueFilter]=useState('all');
 const [marketFilter,setMarketFilter]=useState('all');
 const [countryFilter,setCountryFilter]=useState('all');
 const [groupBy,setGroupBy]=useState('league');
 const [search,setSearch]=useState('');
 const [startWindow,setStartWindow]=useState('all');
 const [scanDate,setScanDate]=useState(localDate(Date.now()));
 const [truncated,setTruncated]=useState(false);
 const [historyTruncated,setHistoryTruncated]=useState(false);
 const [updatedAt,setUpdatedAt]=useState<number|null>(null);
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer)},[]);
 const [sortMode,setSortMode]=useState<SortMode>('drop');
 const [selectedSignal,setSelectedSignal]=useState<LiveSignal|null>(null);
 const [historyDate,setHistoryDate]=useState(new Date().toISOString().slice(0,10));
 const [historyMoves,setHistoryMoves]=useState<LiveSignal[]>([]);
 const [historyLoading,setHistoryLoading]=useState(false);
 const [historyError,setHistoryError]=useState('');
 const sharpRequest=useRef(0);
 const historyRequest=useRef(0);

 useEffect(()=>{
  let active=true;
  api.get('/api/migration/status').then(({data})=>{if(active)setService(data)}).catch(()=>{});
  auth.getUser().then(value=>{if(active)setUser(value)}).catch(()=>{if(active)setError('Account could not be loaded. The scanner remains available without sign-in.')}).finally(()=>{if(active)setReady(true)});
  return()=>{active=false};
 },[]);

 async function signIn(){
  setError('');
  try{const result=await auth.signIn();setUser(result.user)}catch(event){const code=(event as {code?:string}).code;setError(code==='popup_blocked'?'Allow the sign-in popup and try again.':'Sign-in was cancelled or unavailable.')}
 }
 async function signOut(){try{await auth.signOut();setUser(null)}catch{setError('Sign-out failed. Please try again.')}}

 async function loadSharp(){
  const request=++sharpRequest.current;
  setLiveLoading(true);setLiveError('');
  try{
   const {data}=await api.get('/api/sharp/movements?hours=72&minDrop=5');
   if(request!==sharpRequest.current)return;
   const items:LiveSignal[]=Array.isArray(data.items)?data.items:[];
   setLiveMoves(items);setTruncated(data.truncated===true);setUpdatedAt(Date.now());
   setLiveMeta({live:data.live===true,note:String(data.note||''),coverage:String(data.provider?.coverage||'Current football coverage'),leagues:Array.isArray(data.provider?.leagues)?data.provider.leagues.filter((item:unknown):item is string=>typeof item==='string'):[],trackedFixtures:Number(data.health?.fixtureCount||0)});
   setSelectedSignal(previous=>previous?items.find(item=>item.id===previous.id)||previous:null);
  }catch{
   if(request===sharpRequest.current){setLiveMoves([]);setLiveMeta(null);setLiveError('Pinnacle movements could not be loaded. Retry the scan.')}
  }finally{if(request===sharpRequest.current)setLiveLoading(false)}
 }

 async function loadHistory(date=historyDate){
  const request=++historyRequest.current;
  setHistoryLoading(true);setHistoryError('');
  try{
   const {data}=await api.get('/api/sharp/movements?hours=72&minDrop=5&date='+encodeURIComponent(date));
   if(request!==historyRequest.current)return;
   setHistoryMoves(Array.isArray(data.items)?data.items:[]);setHistoryTruncated(data.truncated===true);
  }catch{if(request===historyRequest.current){setHistoryMoves([]);setHistoryError('Historical signals could not be loaded for this date.')}}finally{if(request===historyRequest.current)setHistoryLoading(false)}
 }

 useEffect(()=>{
  if(view!=='Sharp Scanner'&&view!=='Live Watchlist')return;
  void loadSharp();
  const timer=window.setInterval(()=>void loadSharp(),300000);
  return()=>window.clearInterval(timer);
 },[view]);
 useEffect(()=>{if(view==='History & Analytics')void loadHistory()},[view,historyDate]);

 function updateThreshold(value:number){setSharpThreshold(value);try{localStorage.setItem('marginscan-sharp-threshold',String(value))}catch{}}
 function resetFilters(){setCountryFilter('all');setSearch('');setStartWindow('all');setGroupBy('league');setMatchWindow('today');setMinOdds(1.01);setMaxOdds(2.5);setLeagueFilter('all');setMarketFilter('all');setSortMode('drop');updateThreshold(8)}

 const now=clock;
 const pinnacleMoves=uniqueMoves(liveMoves.filter(isPinnacle));
 const leagueOptions=[...new Set([...(liveMeta?.leagues||[]),...pinnacleMoves.map(item=>item.league).filter(Boolean)])].sort();
 const scannerUniverse=pinnacleMoves.filter(item=>{
  if(!item.commenceTime||item.commenceTime<=now)return false;
  if(matchWindow==='today'&&!sameLocalDay(item.commenceTime))return false;
  if(matchWindow==='tomorrow'){const tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);if(localDate(item.commenceTime)!==localDate(tomorrow.getTime()))return false;}
  if(matchWindow==='date'&&localDate(item.commenceTime)!==scanDate)return false;
  if(matchWindow==='next24'&&item.commenceTime>now+86400000)return false;
  return true;
 });
 const scannerRows=scannerUniverse.filter(item=>{
  const current=currentOdds(item);
  return (countryFilter==='all'||country(item)===countryFilter)&&(!search||(item.homeTeam+' '+item.awayTeam+' '+item.league).toLowerCase().includes(search.toLowerCase()))&&(startWindow==='all'||item.commenceTime!<=now+Number(startWindow)*3600000)&&!!item.current&&item.current.observedAt<=now+60000&&item.current.providerUpdatedAt<=now+60000&&now-item.current.observedAt<=600000&&now-item.current.providerUpdatedAt<=600000&&currentDrop(item)>=sharpThreshold&&current>=minOdds&&current<=maxOdds&&(leagueFilter==='all'||item.league===leagueFilter)&&(marketFilter==='all'||item.identity?.marketType===marketFilter);
 }).sort((a,b)=>sortMode==='kickoff'?(a.commenceTime||0)-(b.commenceTime||0):sortMode==='odds'?currentOdds(a)-currentOdds(b):currentDrop(b)-currentDrop(a));
 const groupKey=(item:LiveSignal)=>groupBy==='country'?country(item):groupBy==='league'?country(item)+' · '+item.league:'';
 const groupedRows=groupBy==='none'?scannerRows:[...scannerRows].sort((a,b)=>groupKey(a).localeCompare(groupKey(b)));
 const countryOptions=[...new Set(leagueOptions.map(league=>country({league} as LiveSignal)))].sort();
 const liveWatchlist=pinnacleMoves.filter(item=>!!item.commenceTime&&(item.commenceTime>now||sameLocalDay(item.commenceTime))&&(watchWindow==='all'||(watchWindow==='upcoming'?item.commenceTime>now:item.commenceTime<=now))&&openingDrop(item)>=sharpThreshold&&item.toOdds>=minOdds&&item.toOdds<=maxOdds).sort((a,b)=>openingDrop(b)-openingDrop(a)).slice(0,20);
 const completedHistory=uniqueMoves(historyMoves).filter(item=>isPinnacle(item)&&!!item.commenceTime&&item.commenceTime<=now).sort((a,b)=>(b.commenceTime||0)-(a.commenceTime||0));
 const closedHistory=completedHistory.filter(item=>closingOdds(item)!==null);
 const continued=closedHistory.filter(item=>pathLabel(item)==='Continued').length;
 const reversed=closedHistory.filter(item=>pathLabel(item)==='Reversed').length;
 const followThroughBase=closedHistory.filter(item=>['Continued','Reversed','Flat'].includes(pathLabel(item))).length;
 const averageOpenClose=closedHistory.length?closedHistory.reduce((sum,item)=>sum+(openingToClose(item)??0),0)/closedHistory.length:null;

 return <main className='movement-app'>
  <header className='mv-header'>
   <a className='mv-brand' href='#' onClick={event=>{event.preventDefault();setView('Sharp Scanner')}}><Activity size={25}/><span>Margin<b>Scan</b></span><small>BETA</small></a>
   <div className='header-meta'><span className={liveMeta?.live&&service?.collectorEnabled!==false?'source-status live':'source-status'}>{service?.collectorEnabled===false?'● Collection paused':liveMeta?.live?'● Pinnacle feed active':'Pinnacle market intelligence'}</span>{ready&&(user||service?.authenticationConfigured)&&<button onClick={()=>void(user?signOut():signIn())}>{user?'Sign out':'Sign in'}</button>}</div>
  </header>

  <nav className='mv-nav' aria-label='MarginScan views'>{views.map(item=><button key={item} aria-current={view===item?'page':undefined} onClick={()=>{setSelectedSignal(null);setView(item)}}>{item}</button>)}</nav>
  {error&&<p className='mv-error' role='alert'>{error}<button onClick={()=>setError('')}>Dismiss</button></p>}

  {view==='Sharp Scanner'&&<section className='scanner-page'>
   <div className='page-title'><div><p className='eyebrow'>PINNACLE FOOTBALL SCANNER</p><h1>Pinnacle movements</h1><p>Opening → current · Football · Upcoming only</p></div><button className='refresh-button' onClick={()=>void loadSharp()} disabled={liveLoading}><RefreshCw size={16} className={liveLoading?'spin':''}/>{liveLoading?'Refreshing':'Refresh'}</button></div>
   <div className='date-bar' aria-label='Match date'>
    <button aria-pressed={matchWindow==='today'} onClick={()=>setMatchWindow('today')}>Today</button>
    <button aria-pressed={matchWindow==='tomorrow'} onClick={()=>setMatchWindow('tomorrow')}>Tomorrow</button>
    <label>Kickoff date <input aria-label='Kickoff date' type='date' value={scanDate} min={localDate(now)} onChange={event=>{if(event.target.value){setScanDate(event.target.value);setMatchWindow('date')}}}/></label>
    <span>Opening → Current · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
   </div>
   <div className='scanner-filters'>
    <label>Bookmaker<span className='fixed-filter'>Pinnacle · FT</span></label>
    <label>Matches<select value={matchWindow} onChange={event=>setMatchWindow(event.target.value as MatchWindow)}><option value='today'>Today</option><option value='tomorrow'>Tomorrow</option><option value='date'>Selected date</option><option value='next24'>Next 24 hours</option><option value='all'>All captured upcoming</option></select></label>
    <label>League<select value={leagueFilter} onChange={event=>setLeagueFilter(event.target.value)}><option value='all'>All available</option>{leagueOptions.map(league=><option value={league} key={league}>{league}</option>)}</select></label>
    <label>Market<select value={marketFilter} onChange={event=>setMarketFilter(event.target.value)}><option value='all'>All real markets · FT</option><option value='h2h'>Match winner · FT</option><option value='totals'>Over / Under · FT</option></select></label>
    <label>Odds from<input type='number' min='1.01' step='0.05' value={minOdds} onChange={event=>setMinOdds(Math.min(maxOdds,Math.max(1.01,Number(event.target.value)||1.01)))}/></label>
    <label>Odds to<input type='number' min='1.01' step='0.05' value={maxOdds} onChange={event=>setMaxOdds(Math.max(minOdds,Number(event.target.value)||2.5))}/></label>
    <label>Min drop<select value={sharpThreshold} onChange={event=>updateThreshold(Number(event.target.value))}>{sharpThresholds.map(value=><option value={value} key={value}>≥ {value}%</option>)}</select></label>
    <label>Sort<select value={sortMode} onChange={event=>setSortMode(event.target.value as SortMode)}><option value='drop'>Biggest drop</option><option value='kickoff'>Kickoff</option><option value='odds'>Current odds</option></select></label>
    <button className='reset-button' onClick={resetFilters}>Reset</button>
   </div>
   <div className='secondary-filters'>
    <label>Search<input placeholder='Team or competition' value={search} onChange={event=>setSearch(event.target.value)}/></label>
    <label>Country / region<select value={countryFilter} onChange={event=>{setCountryFilter(event.target.value);setLeagueFilter('all')}}><option value='all'>All countries</option>{countryOptions.map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Starts within<select value={startWindow} onChange={event=>setStartWindow(event.target.value)}><option value='all'>Any kickoff</option><option value='1'>1 hour</option><option value='3'>3 hours</option><option value='6'>6 hours</option><option value='12'>12 hours</option></select></label>
    <label>Group by<select value={groupBy} onChange={event=>setGroupBy(event.target.value)}><option value='league'>Country + league</option><option value='country'>Country / region</option><option value='none'>No grouping</option></select></label>
    <span>{updatedAt?'Updated '+timeLabel(updatedAt):'Awaiting collection'} · Min drop highlights qualifying rows</span>
   </div>
   <div className='scanner-status'>
    <span><b>{scannerRows.length}</b> qualifying movements · <b>{liveMeta?.trackedFixtures??0}</b> upcoming fixtures currently tracked · {scannerUniverse.length} captured movement signals in this window</span>
    <span>{service?.collectorEnabled===false?'● Collection paused':liveMeta?.live?'● Data available':'● Feed delayed / incomplete'} · 5 min cadence <Info label='Pinnacle data' text={providerCopy}/></span>
   </div>
   {service?.collectorEnabled===false&&<p className='analytics-note'>Collection is paused while historical data migration is completed. Saved records remain available in History & Analytics.</p>}
   {truncated&&<p className='analytics-note'>Partial coverage: this response reached its capture limit. Counts describe loaded signals only.</p>}
   {liveError&&<p className='mv-error' role='alert'>{liveError}<button onClick={()=>void loadSharp()}>Retry</button></p>}
   {liveLoading&&!liveMoves.length?<div className='mv-empty'><p>Loading Pinnacle observations…</p></div>:scannerRows.length?<div className='table-shell'><table className={'market-table scanner-table '+(groupBy==='league'?'grouped-leagues':'')}><thead><tr><th>Start</th><th>Match</th><th>Selection</th><th>Opening</th><th>Current</th><th>Drop</th><th>Implied Δ</th><th>State</th><th></th></tr></thead><tbody>{groupedRows.map((item,index)=><Fragment key={item.id||item.key+'-'+item.detectedAt}>{groupBy!=='none'&&(index===0||groupKey(groupedRows[index-1])!==groupKey(item))&&<tr className='league-row'><td colSpan={9}>{groupKey(item)} <span>{scannerRows.filter(row=>groupKey(row)===groupKey(item)).length} movements</span></td></tr>}<tr><td className='time-cell'>{sameLocalDay(item.commenceTime)?timeLabel(item.commenceTime):dateTimeLabel(item.commenceTime)}</td><td className='match-cell'><b>{item.homeTeam} – {item.awayTeam}</b><small>{item.league}</small></td><td><b>{item.selection}</b><small>{marketLabel(item)}</small></td><td className='odds-cell'>{openingOdds(item).toFixed(2)}</td><td className='odds-cell current'>{currentOdds(item).toFixed(2)}</td><td className='drop-cell'>−{currentDrop(item).toFixed(1)}%</td><td>{signed((1/currentOdds(item)-1/openingOdds(item))*100,' pp')}</td><td><span className='path-label'>{item.lifecycle||'Tracking'}</span></td><td><button className='row-action' onClick={()=>setSelectedSignal(item)}>Details</button></td></tr></Fragment>)}</tbody></table></div>:!liveLoading&&<div className='mv-empty'><ChartNoAxesCombined size={28}/><h3>0 of {scannerUniverse.length} captured movements match your filters</h3><p>{scannerUniverse.length?'The data is there, but your current Today / odds / threshold filters hide it. Widen the odds range, lower the drop threshold or choose another match window.':'No qualifying upcoming Pinnacle movement has been captured in this window yet.'}</p>{scannerUniverse.length>0&&<button onClick={resetFilters}>Reset to Today · 1.01–2.50 · ≥8%</button>}</div>}
   <p className='coverage-note'>Opening = first captured price <Info label='opening and coverage' text={'Opening is the first fresh price captured by MarginScan, not a verified bookmaker opening. '+(liveMeta?.coverage||'Football · Pinnacle')+'. Only actual provider markets and matching total lines are tracked.'}/> · Times use your local timezone · Refresh every 5 min</p>
   {selectedSignal&&<SignalDetails key={selectedSignal.id||selectedSignal.key} signal={selectedSignal} onClose={()=>setSelectedSignal(null)}/>}
  </section>}

  {view==='Live Watchlist'&&<section className='scanner-page'>
   <div className='page-title'><div><p className='eyebrow'>PRE-MATCH MOVERS</p><h1>Live Watchlist</h1><p>The strongest Pinnacle moves remain visible after kickoff so their pre-match path can be monitored and studied.</p></div><button className='refresh-button' onClick={()=>void loadSharp()} disabled={liveLoading}><RefreshCw size={16} className={liveLoading?'spin':''}/>Refresh</button></div>
   <div className='date-bar'>{[['all','All movers'],['upcoming','Pre-match'],['started','Started today']].map(([value,label])=><button key={value} aria-pressed={watchWindow===value} onClick={()=>setWatchWindow(value)}>{label}</button>)}</div><p className='analytics-note'>Pre-match prices retained after kickoff · No in-play odds or scores. Threshold and odds range follow your scanner filters.</p>
   <div className='scanner-status'><span><b>{liveWatchlist.length}</b> strongest captured signals · top 20</span><span>Minimum pre-match move ≥{sharpThreshold}% · signal odds {minOdds.toFixed(2)}–{maxOdds.toFixed(2)}</span></div>
   {liveError&&<p className='mv-error' role='alert'>{liveError}</p>}
   {liveWatchlist.length?<div className='table-shell'><table className='market-table watchlist-table'><thead><tr><th>Kickoff</th><th>Match</th><th>Selection</th><th>Opening</th><th>Signal</th><th>CLV price</th><th>O→CLV</th><th>Implied Δ</th><th>Path</th><th></th></tr></thead><tbody>{liveWatchlist.map(item=><tr key={item.id||item.key+'-'+item.detectedAt}><td>{timeLabel(item.commenceTime)}</td><td className='match-cell'><b>{item.homeTeam} – {item.awayTeam}</b><small>{item.league}</small></td><td><b>{item.selection}</b><small>{marketLabel(item)}</small></td><td className='odds-cell'>{openingOdds(item).toFixed(2)}</td><td className='odds-cell'>{item.toOdds.toFixed(2)}</td><td className='odds-cell current'>{closingOdds(item)?.toFixed(2)??(['unavailable','calculated'].includes(item.closing?.status||'')?'N/A':'Pending')}</td><td className='drop-cell'>{openingToClose(item)===null?'—':signed(-openingToClose(item)!)}</td><td>{signed(impliedDelta(item),' pp')}</td><td><span className={'path-label '+pathLabel(item).toLowerCase()}>{pathLabel(item)}</span></td><td><button className='row-action' onClick={()=>setSelectedSignal(item)}>Details</button></td></tr>)}</tbody></table></div>:<div className='mv-empty'><h3>No qualifying movers in this view</h3><p>When a qualifying pre-match signal reaches kickoff it leaves Sharp Scanner and appears here instead of being discarded.</p></div>}
   {selectedSignal&&<SignalDetails key={selectedSignal.id||selectedSignal.key} signal={selectedSignal} onClose={()=>setSelectedSignal(null)}/>}
  </section>}

  {view==='History & Analytics'&&<section className='scanner-page'>
   <div className='page-title'><div><p className='eyebrow'>CLOSING-LINE RESEARCH</p><h1>History & Analytics</h1><p>Study whether a pre-match drop continued into the closing line or reversed before kickoff.</p></div><div className='history-date'><label>Signal date (UTC)<input type='date' value={historyDate} max={new Date().toISOString().slice(0,10)} onChange={event=>{if(event.target.value){setHistoryMoves([]);setSelectedSignal(null);setHistoryDate(event.target.value)}}}/></label><button className='refresh-button' onClick={()=>void loadHistory()} disabled={historyLoading}><RefreshCw size={16} className={historyLoading?'spin':''}/>Refresh</button></div></div>
   <div className='stat-strip'>
    <div><small>Completed signals</small><strong>{completedHistory.length}</strong></div>
    <div><small>Closing captured</small><strong>{closedHistory.length}</strong></div>
    <div><small>Follow-through</small><strong>{followThroughBase?Math.round(continued/followThroughBase*100)+'%':'—'}</strong><span>{continued} continued · {reversed} reversed</span></div>
    <div><small>Avg opening → CLV</small><strong>{averageOpenClose===null?'—':signed(-averageOpenClose)}</strong></div>
   </div>
   <p className='analytics-note'>This is price-path analytics, not profit analytics. Match results and in-play snapshots are not yet used in these statistics.</p>
   <details className='league-analytics'><summary>League follow-through · {closedHistory.length} verified closing observations</summary>
    <p>One latest signal per exact selection and total line. Rates use captured closes only; missing closes are excluded. Small samples are descriptive.</p>
    <div className='table-shell'><table className='market-table'><thead><tr><th>League</th><th>Signals</th><th>Closed</th><th>Continued</th><th>Reversed</th><th>Flat</th><th>Follow-through</th><th>Avg O→CLV</th></tr></thead><tbody>{[...new Set(completedHistory.map(item=>item.league))].sort().map(league=>{const all=completedHistory.filter(item=>item.league===league),closed=all.filter(item=>closingOdds(item)!==null),count=(path:string)=>closed.filter(item=>pathLabel(item)===path).length;return <tr key={league}><td>{league}</td><td>{all.length}</td><td>{closed.length}</td><td>{count('Continued')}</td><td>{count('Reversed')}</td><td>{count('Flat')}</td><td>{closed.length?(count('Continued')/closed.length*100).toFixed(0)+'%':'—'}</td><td>{closed.length?signed(-closed.reduce((sum,item)=>sum+openingToClose(item)!,0)/closed.length):'—'}</td></tr>})}</tbody></table></div>
   </details>
   {historyTruncated&&<p className='analytics-note'>Partial archive: statistics describe loaded records only.</p>}
   {historyError&&<p className='mv-error' role='alert'>{historyError}<button onClick={()=>void loadHistory()}>Retry</button></p>}
   {historyLoading&&!historyMoves.length?<div className='mv-empty'><p>Loading historical signals…</p></div>:completedHistory.length?<div className='table-shell'><table className='market-table history-table'><thead><tr><th>Kickoff</th><th>Match</th><th>Selection</th><th>Opening</th><th>Signal</th><th>CLV price</th><th>O→CLV</th><th>Implied Δ</th><th>Path</th><th></th></tr></thead><tbody>{completedHistory.map(item=><tr key={item.id||item.key+'-'+item.detectedAt}><td>{dateTimeLabel(item.commenceTime)}</td><td className='match-cell'><b>{item.homeTeam} – {item.awayTeam}</b><small>{item.league}</small></td><td>{item.selection}</td><td className='odds-cell'>{openingOdds(item).toFixed(2)}</td><td className='odds-cell'>{item.toOdds.toFixed(2)}</td><td className='odds-cell current'>{closingOdds(item)?.toFixed(2)??(['unavailable','calculated'].includes(item.closing?.status||'')?'N/A':'Pending')}</td><td>{openingToClose(item)===null?'—':signed(-openingToClose(item)!)}</td><td>{signed(impliedDelta(item),' pp')}</td><td><span className={'path-label '+pathLabel(item).toLowerCase()}>{pathLabel(item)}</span></td><td><button className='row-action' onClick={()=>setSelectedSignal(item)}>Details</button></td></tr>)}</tbody></table></div>:!historyLoading&&<div className='mv-empty'><h3>No completed signals for {historyDate}</h3><p>Historical rows are never fabricated. Choose another date after more real Pinnacle movements have been captured.</p></div>}
   {selectedSignal&&<SignalDetails key={selectedSignal.id||selectedSignal.key} signal={selectedSignal} onClose={()=>setSelectedSignal(null)}/>}
  </section>}

  {view==='Settings'&&<section className='settings-page'>
   <div className='page-title'><div><p className='eyebrow'>SCANNER DEFAULTS</p><h1>Settings</h1><p>Set the movement threshold for your market research workflow.</p></div></div>
   <div className='settings-grid'>
    <article><h2>Movement threshold</h2><label>Minimum opening → current drop<select value={sharpThreshold} onChange={event=>updateThreshold(Number(event.target.value))}>{sharpThresholds.map(value=><option value={value} key={value}>≥ {value}%</option>)}</select></label><p>8% remains the default balance between noise and meaningful movement.</p></article>
    <article><h2>Current data coverage</h2><p><b>Bookmaker:</b> Pinnacle<br/><b>Sport:</b> Football<br/><b>Market:</b> Match winner + available Over/Under · full time<br/><b>Collection:</b> Every 5 minutes</p><p>{liveMeta?.coverage||'Current production provider coverage is intentionally shown only when available.'}</p></article>
    <article><h2>Next feed expansion</h2><p>Football competition coverage is now expanded. Over/Under tracks only actual paired Pinnacle prices at the same total line. Asian handicap remains a later expansion. Basketball and tennis remain later phases.</p></article>
    <article><h2>Product mode</h2><p>MarginScan is desktop-first because the main workflow is side-by-side comparison with a local bookmaker. The same scanner remains responsive on mobile for users checking signals away from a desktop.</p></article>
   </div>
  </section>}

  {view==='Feedback'&&<section className='feedback-page'><div className='page-title'><div><p className='eyebrow'>BETA FEEDBACK</p><h1>Help calibrate the product</h1><p>Tell us whether the scanner reduces the time needed to find useful Pinnacle moves.</p></div></div>{user||service?.authenticationConfigured?<BetaReadiness key={user?.userId||'guest'} userId={user?.userId||null} onSignIn={()=>void signIn()}/>:<p className='analytics-note'>Feedback sign-in will be available when account migration is complete.</p>}{user&&<OwnerReview key={user.userId}/>}</section>}

  <footer className='mv-footer'><Activity size={17}/><p>MarginScan tracks Pinnacle market movement and saved pre-kickoff observations. It does not predict match outcomes or recommend bets. Closing-line and follow-through statistics become more useful as the historical sample grows.</p></footer>
 </main>;
}


