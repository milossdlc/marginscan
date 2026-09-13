import {AsyncLocalStorage} from 'node:async_hooks';
import {createRemoteJWKSet,jwtVerify} from 'jose';
export const scope=new AsyncLocalStorage<Env>();
export function environment(){const value=scope.getStore();if(!value)throw new Error('Missing request context');return value;}
type RecordValue=Record<string,any>;
type Stored<T>=T&{id:string};
export const db={
 async list<T=RecordValue>(collection:string,options:{limit?:number;nextToken?:string}={}){
  const limit=Math.max(1,Math.min(500,options.limit||100));
  let after=0;
  if(options.nextToken){const cursor=JSON.parse(atob(options.nextToken));if(cursor.collection!==collection||!Number.isSafeInteger(cursor.seq)||cursor.seq<0)throw new Error('Invalid cursor');after=cursor.seq;}
  const result=await environment().DB.prepare('SELECT seq,id,data FROM documents WHERE collection=? AND seq>? ORDER BY seq ASC LIMIT ?').bind(collection,after,limit+1).all<{seq:number;id:string;data:string}>();
  const rows=result.results.slice(0,limit);
  return {items:rows.map(r=>({...JSON.parse(r.data),id:r.id}) as Stored<T>),nextToken:result.results.length>limit?btoa(JSON.stringify({collection,seq:rows[rows.length-1].seq})):undefined};
 },
 async get<T=RecordValue>(collection:string,ids:string[]):Promise<(Stored<T>|null)[]>{return Promise.all(ids.map(async id=>{const row=await environment().DB.prepare('SELECT data FROM documents WHERE collection=? AND id=?').bind(collection,id).first<{data:string}>();return row?{...JSON.parse(row.data),id}:null;}));},
 async add(collection:string,records:RecordValue[]){const ids=records.map(()=>crypto.randomUUID());if(records.length)await environment().DB.batch(records.map((r,i)=>environment().DB.prepare('INSERT INTO documents(collection,id,data) VALUES(?,?,?)').bind(collection,ids[i],JSON.stringify(r))));return ids;},
 async update(collection:string,records:{id:string;record:RecordValue}[]){if(!records.length)return [];const results=await environment().DB.batch(records.map(r=>environment().DB.prepare('UPDATE documents SET data=? WHERE collection=? AND id=?').bind(JSON.stringify(r.record),collection,r.id)));return results.map(r=>r.meta.changes===1);},
 async delete(collection:string,ids:string[]){if(!ids.length)return [];const results=await environment().DB.batch(ids.map(id=>environment().DB.prepare('DELETE FROM documents WHERE collection=? AND id=?').bind(collection,id)));return results.map(r=>r.meta.changes===1);}
};
export const secrets={async listSecretNames(){return environment().THE_ODDS_API_KEY?['THE_ODDS_API_KEY']:[];},async readSecret(name:string){if(name!=='THE_ODDS_API_KEY'||!environment().THE_ODDS_API_KEY)throw new Error('Provider secret unavailable');return environment().THE_ODDS_API_KEY;}};
export const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export type User={userId:string;email:string;name?:string};
type Context={request:Request;query:Record<string,string>;params:Record<string,string>;body:any;user:User|null};
type RouteHandler=(context:Context)=>Promise<Response|void>|Response|void;
export async function readUser(request:Request):Promise<User|null>{
 const env=environment();if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return null;
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))throw new Error('Invalid Access domain');
 const token=request.headers.get('Cf-Access-Jwt-Assertion')||request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('CF_Authorization='))?.slice(17);
 if(!token)return null;
 try{const issuer='https://'+env.ACCESS_TEAM_DOMAIN;const jwks=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));const {payload}=await jwtVerify(token,jwks,{issuer,audience:env.ACCESS_AUD});if(!payload.sub||typeof payload.email!=='string')return null;const mapping=await env.DB.prepare('SELECT appdeploy_user_id FROM identity_map WHERE access_sub=?').bind(payload.sub).first<{appdeploy_user_id:string}>();return {userId:mapping?.appdeploy_user_id||'access:'+payload.sub,email:payload.email};}catch{return null;}
}
export const requireAuth=():RouteHandler=>({user})=>{if(!user)return json({error:'Sign in required'},401);};
export const requireAdminEmailAllowlist=(emails:string[]):RouteHandler=>({user})=>{if(!user||!emails.includes(user.email.toLowerCase()))return json({error:'Forbidden'},403);};
export function router(routes:Record<string,RouteHandler[]>){return async(request:Request)=>{
 const url=new URL(request.url);
 for(const [key,handlers] of Object.entries(routes)){
  const [method,path]=key.split(' ');if(method!==request.method)continue;
  const names:string[]=[];const expression=path.split('/').map(p=>p.startsWith(':')?(names.push(p.slice(1)),'([^/]+)'):p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');const match=url.pathname.match(new RegExp('^'+expression+'$'));if(!match)continue;
  const user=await readUser(request);let body=null;
  if(!['GET','HEAD'].includes(method)){
   if(request.headers.get('Origin')!==url.origin)return json({error:'Origin rejected'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
   const text=await request.text();if(text.length>65536)return json({error:'Request too large'},413);try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}
  }
  const context={request,query:Object.fromEntries(url.searchParams),params:Object.fromEntries(names.map((n,i)=>[n,decodeURIComponent(match[i+1])])),body,user};
  for(const h of handlers){const result=await h(context);if(result)return result;}return json({error:'No response'},500);
 }
 return json({error:'Not found'},404);
};}
