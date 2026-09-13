import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '../db';
import { vegasEdgeCache } from '../db/schema';
import { normalizeEvents, refreshInterval, type EdgeFeed, type EdgeEvent } from './vegas-edge-model';

type State = { events?: EdgeEvent[]; discoveredAt?: number; checkedAt?: string; usage?: number; nextAttempt?: number; message?: string };
const BUDGET=2000; // Leave 500 objects for other usage and provider-account checks.
export async function vegasFeed(refresh=false): Promise<EdgeFeed> {
  let runtime:Record<string,unknown>=process.env;
  try { runtime=(await import('cloudflare:workers')).env as unknown as Record<string,unknown>; } catch {}
  const key=String(runtime.SPORTSGAMEODDS_API_KEY ?? '');
  if(!key) return {configured:false,events:[],message:'Market connection is ready for your API key. No sample odds are being used.',budget:BUDGET};
  const db=await getDb();
  await db.insert(vegasEdgeCache).values({id:'nfl-v1'}).onConflictDoNothing();
  const read=async()=>{const [row]=await db.select().from(vegasEdgeCache).where(eq(vegasEdgeCache.id,'nfl-v1'));return JSON.parse(row.payload) as State;};
  let state=await read();const now=Date.now();
  const output=():EdgeFeed=>({configured:true,events:state.events ?? [],message:state.message ?? 'Ready to check NFL markets.',checkedAt:state.checkedAt,usage:state.usage,budget:BUDGET});
  if(!refresh || (state.nextAttempt ?? 0)>now) return output();
  const token=crypto.randomUUID();
  const lease=await db.update(vegasEdgeCache).set({leaseUntil:now+120000,leaseToken:token}).where(and(eq(vegasEdgeCache.id,'nfl-v1'),lt(vegasEdgeCache.leaseUntil,now))).returning({id:vegasEdgeCache.id});
  if(!lease.length)return {...output(),message:'A shared market refresh is already running.'};
  try {
    state=await read();
    if((state.nextAttempt ?? 0)>now)return output();
    const discover=now-(state.discoveredAt ?? 0)>=43200000;
    const due=(state.events ?? []).filter(e=>!e.locked && now-Date.parse(e.updatedAt)>=refreshInterval(e.startsAt,now));
    if(!discover && !due.length)return output();
    const request=async(path:string,params:Record<string,string>={})=>{
      const url=new URL(`https://api.sportsgameodds.com/v2/${path}/`);
      for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
      const res=await fetch(url,{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000),cache:'no-store'});
      if(!res.ok)throw new Error(res.status===401||res.status===403?'Provider access needs attention. Verify the API key and plan.':res.status===429?'Provider limit reached. Cached lines are preserved.':'Market provider is temporarily unavailable.');
      const data=await res.json() as any;
      if(data.success!==true)throw new Error('Market provider could not complete the request.');
      return data;
    };
    // Verify account-wide usage before spending; fail closed if usage is absent.
    const usage=await request('account/usage');
    const monthly=usage.data?.rateLimits?.['per-month'];
    const used=Number(monthly?.['current-entities']);
    if(!Number.isFinite(used) || used<0)throw new Error('Could not verify provider usage. Market refresh is paused to protect your allowance.');
    state.usage=used;
    const cap=Number(monthly?.['max-entities']);
    const ceiling=Number.isFinite(cap)?Math.min(BUDGET,Math.max(0,cap-100)):BUDGET;
    const limit=discover?32:Math.min(32,due.length);
    if(used+limit>ceiling)throw new Error('Monthly usage reserve reached. Cached lines remain available; new requests are paused.');
    const params:Record<string,string>={leagueID:'NFL',limit:String(limit),includeAltLines:'false'};
    if(discover){params.startsAfter=new Date(now).toISOString();params.startsBefore=new Date(now+7*86400000).toISOString();params.started='false';}
    else params.eventIDs=due.slice(0,32).map(e=>e.id).join(',');
    const data=await request('events',params);
    if(!Array.isArray(data.data))throw new Error('Provider returned an unexpected response. Cached lines are preserved.');
    const fresh=normalizeEvents(data.data,now);
    const merged=new Map((state.events ?? []).filter(e=>Date.parse(e.startsAt)>now-86400000).map(e=>[e.id,e]));
    fresh.forEach(e=>merged.set(e.id,e));
    state={...state,events:[...merged.values()].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)),usage:used+data.data.length,checkedAt:new Date(now).toISOString(),nextAttempt:now+600000,discoveredAt:discover?now:state.discoveredAt,message:data.nextCursor?'Some events remain outside this snapshot. Coverage will be checked before activation.':'Markets checked. Updates are shared across the Hub.'};
  } catch(error) {
    state={...state,nextAttempt:now+600000,message:error instanceof Error?error.message:'Markets unavailable. Try again later.'};
  } finally {
    await db.update(vegasEdgeCache).set({payload:JSON.stringify(state),leaseUntil:0,leaseToken:''}).where(and(eq(vegasEdgeCache.id,'nfl-v1'),eq(vegasEdgeCache.leaseToken,token)));
  }
  return output();
}
