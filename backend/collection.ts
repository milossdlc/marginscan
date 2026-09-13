import {db} from '@appdeploy/sdk';
import {collectV6} from './sharp';
import {inspectFeed,REFRESH_MS,type OddsProvider,type Quality} from './provider';
import {finalizeRecentClosings} from './closing';

type Health={
 lastAttemptAt:number;
 lastSuccessfulCollection:number|null;
 lastStatus:string;
 counts:{fresh:number;stale:number;missing:number};
 latestProviderUpdate:number|null;
 lastError:string|null;
 provider:OddsProvider['descriptor'];
 fixtureCount:number;
};

const table='sharp_collection_health_v71';

export async function readCollectionHealth(){
 const page=await db.list<Health>(table,{limit:1});
 const health=page.items[0];
 const at=Date.now();
 const lastSuccessfulCollection=health?.lastSuccessfulCollection||null;
 const emptyFresh=health?.lastStatus==='success'&&health.fixtureCount===0&&!!lastSuccessfulCollection&&at-lastSuccessfulCollection<=REFRESH_MS;
 const quality:Quality=!lastSuccessfulCollection?'missing':at-lastSuccessfulCollection>REFRESH_MS||health?.lastStatus!=='success'?'stale':emptyFresh?'fresh':!health?.latestProviderUpdate||at-health.latestProviderUpdate>REFRESH_MS?'stale':'fresh';
 return {...(health||{}),lastSuccessfulCollection,lastAttemptAt:health?.lastAttemptAt||null,quality,refreshMinutes:5,checkedAt:at};
}

export async function runCollection(provider:OddsProvider){
 const page=await db.list<Health>(table,{limit:1});
 const previous=page.items[0];
 const at=Date.now();
 let failure:unknown=null;
 let health:Health={lastAttemptAt:at,lastSuccessfulCollection:previous?.lastSuccessfulCollection||null,lastStatus:'unavailable',counts:{fresh:0,stale:0,missing:0},latestProviderUpdate:previous?.latestProviderUpdate||null,lastError:null,provider:provider.descriptor,fixtureCount:0};
 try{
  const feed=await provider.collect();
  const inspection=inspectFeed(feed,at);
  health={...health,...inspection,fixtureCount:feed.fixtures.length};
  await collectV6(feed,provider.descriptor);
  health.lastStatus=feed.partial?'partial':feed.mode==='live'&&feed.fixtures.length===0?'success':inspection.quality==='fresh'?'success':inspection.quality;
  if(health.lastStatus==='success')health.lastSuccessfulCollection=Date.now();
 }catch(error){
  failure=error;
  health.lastStatus='failed';
  health.lastError='Collection failed; last successful collection retained.';
 }
 try{await finalizeRecentClosings(at)}catch(error){failure=failure||error;health.lastStatus='failed';health.lastError='Closing finalization failed; pending signals will be retried.'}
 const saved=previous?await db.update(table,[{id:previous.id,record:health}]):await db.add(table,[health]);
 if(saved.some(result=>!result))throw new Error('Collection health persistence failed');
 const audit=await db.add('sharp_collection_runs_v71:'+new Date(at).toISOString().slice(0,10),[health]);
 if(audit.some(result=>!result))throw new Error('Collection audit persistence failed');
 if(failure)throw failure;
 return health;
}

