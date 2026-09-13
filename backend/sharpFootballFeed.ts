import {secrets} from '@appdeploy/sdk';
import type {ProviderFeed} from './provider';

export const SHARP_LEAGUES=[
 {key:'soccer_epl',label:'Premier League'},
 {key:'soccer_efl_champ',label:'Championship'},
 {key:'soccer_germany_bundesliga',label:'Bundesliga'},
 {key:'soccer_germany_bundesliga2',label:'2. Bundesliga'},
 {key:'soccer_spain_la_liga',label:'La Liga'},
 {key:'soccer_italy_serie_a',label:'Serie A'},
 {key:'soccer_france_ligue_one',label:'Ligue 1'},
 {key:'soccer_netherlands_eredivisie',label:'Eredivisie'},
 {key:'soccer_portugal_primeira_liga',label:'Primeira Liga'},
 {key:'soccer_uefa_champs_league',label:'UEFA Champions League'},
 {key:'soccer_uefa_europa_league',label:'UEFA Europa League'},
 {key:'soccer_uefa_europa_conference_league',label:'UEFA Conference League'},
 {key:'soccer_fa_cup',label:'FA Cup'},
 {key:'soccer_england_efl_cup',label:'EFL Cup'},
 {key:'soccer_england_league1',label:'League One'},
 {key:'soccer_england_league2',label:'League Two'},
 {key:'soccer_germany_dfb_pokal',label:'DFB-Pokal'},
 {key:'soccer_germany_liga3',label:'3. Liga'},
 {key:'soccer_france_ligue_two',label:'Ligue 2'},
 {key:'soccer_italy_serie_b',label:'Serie B'},
 {key:'soccer_spain_segunda_division',label:'La Liga 2'},
 {key:'soccer_spain_copa_del_rey',label:'Copa del Rey'},
 {key:'soccer_spl',label:'Scottish Premiership'},
 {key:'soccer_turkey_super_league',label:'Turkish Süper Lig'},
 {key:'soccer_switzerland_superleague',label:'Swiss Super League'},
 {key:'soccer_denmark_superliga',label:'Danish Superliga'},
 {key:'soccer_greece_super_league',label:'Greek Super League'},
 {key:'soccer_saudi_arabia_pro_league',label:'Saudi Pro League'},
 {key:'soccer_usa_mls',label:'MLS'},
 {key:'soccer_conmebol_copa_libertadores',label:'Copa Libertadores'},
 {key:'soccer_brazil_campeonato',label:'Brazil Série A'},
 {key:'soccer_japan_j_league',label:'J League'},
 {key:'soccer_norway_eliteserien',label:'Eliteserien'},
 {key:'soccer_sweden_allsvenskan',label:'Allsvenskan'},
 {key:'soccer_finland_veikkausliiga',label:'Veikkausliiga'},
 {key:'soccer_league_of_ireland',label:'League of Ireland'},
] as const;

const WINDOW_HOURS=30;
const MAX_CONCURRENT_LEAGUES=4;

type ApiSport={key:string;group?:string;active?:boolean};
type ApiEvent={id:string;commence_time:string;home_team:string;away_team:string};
type ApiOutcome={name:string;price:number;point?:number};
type ApiMarket={key:string;last_update?:string;outcomes?:ApiOutcome[]};
type ApiBookmaker={key:string;title:string;last_update?:string;markets?:ApiMarket[]};
type ApiOddsEvent=ApiEvent&{bookmakers?:ApiBookmaker[]};

function query(params:Record<string,string>){return new URLSearchParams(params).toString()}

async function loadActiveLeagues(apiKey:string){
 const response=await fetch('https://api.the-odds-api.com/v4/sports/?'+query({apiKey}),{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('football sports discovery '+response.status);
 const payload=await response.json() as ApiSport[];
 const activeKeys=new Set((Array.isArray(payload)?payload:[]).filter(s=>s.active!==false&&(s.group==='Soccer'||s.key.startsWith('soccer_'))).map(s=>s.key));
 return SHARP_LEAGUES.filter(league=>activeKeys.has(league.key));
}

async function loadLeague(apiKey:string,league:{key:string;label:string},from:string,to:string){
 const url='https://api.the-odds-api.com/v4/sports/'+league.key+'/odds/?'+query({apiKey,bookmakers:'pinnacle',markets:'h2h,totals',oddsFormat:'decimal',dateFormat:'iso',commenceTimeFrom:from,commenceTimeTo:to});
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('football odds '+league.key+' '+response.status);
 const payload=await response.json() as ApiOddsEvent[];
 return (Array.isArray(payload)?payload:[]).map(event=>{
  const bookmaker=(event.bookmakers||[]).find(item=>item.key==='pinnacle'||item.title.toLowerCase()==='pinnacle');
  const market=bookmaker?.markets?.find(item=>item.key==='h2h');
  const totalMarket=bookmaker?.markets?.find(item=>item.key==='totals');
  const totals=(totalMarket?.outcomes||[]).filter(o=>['Over','Under'].includes(o.name)&&Number.isFinite(o.point)&&Number(o.point)>=0&&Number.isFinite(o.price)&&o.price>1).filter(o=>(totalMarket?.outcomes||[]).some(other=>other.name!==o.name&&['Over','Under'].includes(other.name)&&other.point===o.point&&other.price>1)).map(o=>({selectionKey:o.name.toLowerCase()+'_'+o.point,line:Number(o.point),odds:o.price,updatedAt:Date.parse(totalMarket?.last_update||bookmaker?.last_update||'')}));
  const price=(name:string)=>Number(market?.outcomes?.find(item=>item.name===name)?.price);
  const updatedAt=Date.parse(market?.last_update||bookmaker?.last_update||'');
  return {
   id:event.id,
   totals,
   homeTeam:event.home_team,
   awayTeam:event.away_team,
   league:league.label,
   commenceTime:Date.parse(event.commence_time),
   quotes:bookmaker&&Number.isFinite(updatedAt)?[{bookmaker:'Pinnacle',home:price(event.home_team),draw:price('Draw'),away:price(event.away_team),updatedAt}]:[],
  };
 }).filter(event=>Number.isFinite(event.commenceTime)&&event.commenceTime>Date.now()&&event.quotes.some(quote=>quote.home>1&&quote.draw>1&&quote.away>1));
}

async function loadInBatches<T,R>(items:readonly T[],worker:(item:T)=>Promise<R>){
 const results:PromiseSettledResult<R>[]=[];
 for(let index=0;index<items.length;index+=MAX_CONCURRENT_LEAGUES){
  results.push(...await Promise.allSettled(items.slice(index,index+MAX_CONCURRENT_LEAGUES).map(worker)));
 }
 return results;
}

export async function sharpFootballFeed():Promise<ProviderFeed>{
 let apiKey:string;
 try{apiKey=await secrets.readSecret('THE_ODDS_API_KEY')}catch{throw new Error('Football provider secret is unavailable')}
 const snapshotAt=Date.now();
 const from=new Date(snapshotAt).toISOString().replace(/\.\d{3}Z$/,'Z');
 const to=new Date(snapshotAt+WINDOW_HOURS*3600000).toISOString().replace(/\.\d{3}Z$/,'Z');
 const active=await loadActiveLeagues(apiKey);
 const odds=await loadInBatches(active,league=>loadLeague(apiKey,league,from,to));
 const fixtures=odds.flatMap(result=>result.status==='fulfilled'?result.value:[]);
 const failures=odds.filter(result=>result.status==='rejected').length;
 return {
  mode:'live',
  partial:failures>0,
  source:'The Odds API · Pinnacle · '+active.length+' active configured competitions · '+failures+' league requests unavailable · next '+WINDOW_HOURS+'h',
  snapshotAt,
  fixtures,
 };
}
