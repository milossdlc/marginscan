import {handler,collectSharpHandler} from '../backend/index';
import {scope,json,readUser} from './server';
export default {
 async fetch(request,env,ctx){return scope.run(env,async()=>{
  try{
   const path=new URL(request.url).pathname;
   if(path==='/api/auth/user')return json({user:await readUser(request)});
   if(path==='/api/auth/login'){
    if(!env.ACCESS_AUD||!env.ACCESS_TEAM_DOMAIN)return json({error:'Account migration is not configured yet'},503);
    return Response.redirect(new URL('/',request.url).href,302);
   }
   if(path==='/api/migration/status'){await env.DB.prepare('SELECT 1 FROM documents LIMIT 1').all();return json({database:'ready',providerSecretConfigured:!!env.THE_ODDS_API_KEY,collectorEnabled:env.COLLECTOR_ENABLED==='true',authenticationConfigured:!!env.ACCESS_AUD&&!!env.ACCESS_TEAM_DOMAIN});}
   if(path.startsWith('/api/'))return await handler(request);
   return env.ASSETS.fetch(request);
  }catch{console.error(JSON.stringify({event:'request_failed',path:new URL(request.url).pathname}));return json({error:'Service temporarily unavailable'},500);}
 });},
 async scheduled(controller,env,ctx){await scope.run(env,async()=>{
  if(env.COLLECTOR_ENABLED!=='true'||!env.THE_ODDS_API_KEY){console.log(JSON.stringify({event:'collector_skipped',reason:'migration_not_enabled'}));return;}
  const owner=crypto.randomUUID();const at=Date.now();
  const lock=await env.DB.prepare('INSERT INTO collector_lock(name,owner,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE collector_lock.expires_at<?').bind('sharp',owner,at+900000,at).run();
  if(lock.meta.changes!==1)return;
  try{await collectSharpHandler();}finally{await env.DB.prepare('DELETE FROM collector_lock WHERE name=? AND owner=?').bind('sharp',owner).run();}
 });}
} satisfies ExportedHandler<Env>;
