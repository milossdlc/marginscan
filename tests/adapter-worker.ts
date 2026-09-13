import {scope,db} from '../platform/server';
import worker from '../platform/worker';
export default {async fetch(request:Request,env:Env,ctx:ExecutionContext){if(new URL(request.url).pathname==='/test/db')return scope.run(env,async()=>{const op=await request.json() as {operation:'add'|'get'|'list'|'update'|'delete';collection:string;args:any};const result=await db[op.operation](op.collection,op.args);return Response.json(result);});return worker.fetch(request,env,ctx);},scheduled:worker.scheduled};
