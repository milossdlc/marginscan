export const REFRESH_MS=300000;

export type Quality='fresh'|'stale'|'missing';

export function snapshotQuality(point:{odds?:number|null;observedAt?:number|null;providerUpdatedAt?:number|null}|null,at=Date.now()):Quality{
 if(!point||!Number.isFinite(point.odds)||Number(point.odds)<=1)return 'missing';
 const times=[point.observedAt,point.providerUpdatedAt];
 if(times.some(time=>typeof time!=='number'||!Number.isFinite(time)||time<=0||time>at+60000))return 'missing';
 return times.some(time=>at-Number(time)>REFRESH_MS)?'stale':'fresh';
}

export type ProviderFeed={
 mode:string;
 source:string;
 snapshotAt:number;
 partial?:boolean;
 fixtures:{id:string;homeTeam:string;awayTeam:string;league:string;commenceTime:number;totals?:{selectionKey:string;line:number;odds:number;updatedAt:number}[];quotes:{bookmaker:string;home:number;draw:number;away:number;updatedAt:number}[]}[];
};

export type ProviderDescriptor={
 id:string;
 name:string;
 marketSource:string;
 direct:boolean;
 coverage:string;
 leagues?:string[];
};

export interface OddsProvider{
 descriptor:ProviderDescriptor;
 collect():Promise<ProviderFeed>;
}

export function oddsApiAdapter(transport:()=>Promise<ProviderFeed>,config?:{coverage?:string;leagues?:string[]}):OddsProvider{
 return {
  descriptor:{
   id:'the-odds-api',
   name:'The Odds API',
   marketSource:'Pinnacle',
   direct:false,
   coverage:config?.coverage||'Bundesliga · Match winner · Full time',
   leagues:config?.leagues,
  },
  collect:transport,
 };
}

export function inspectFeed(feed:ProviderFeed,at=Date.now()){
 const counts={fresh:0,stale:0,missing:0};
 let latestProviderUpdate:number|null=null;
 if(feed.mode!=='live')return {counts,quality:'missing' as Quality,latestProviderUpdate:null};
 for(const fixture of feed.fixtures){
  if(fixture.commenceTime<=at)continue;
  const pinnacle=fixture.quotes.find(quote=>quote.bookmaker.toLowerCase()==='pinnacle');
  for(const selection of ['home','draw','away'] as const){
   let quality=snapshotQuality(pinnacle?{odds:pinnacle[selection],observedAt:feed.snapshotAt,providerUpdatedAt:pinnacle.updatedAt}:null,at);
   if(quality==='fresh'&&feed.source.includes('stale cache'))quality='stale';
   counts[quality]++;
  }
  if(pinnacle&&Number.isFinite(pinnacle.updatedAt)&&pinnacle.updatedAt>0&&pinnacle.updatedAt<=at+60000)latestProviderUpdate=Math.max(latestProviderUpdate||0,pinnacle.updatedAt);
 }
 return {counts,quality:(counts.fresh?'fresh':counts.stale?'stale':'missing') as Quality,latestProviderUpdate};
}

