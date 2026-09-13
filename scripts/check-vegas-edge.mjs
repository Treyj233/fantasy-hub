// Read-only provider smoke check. Never prints credentials or account identity.
import fs from 'node:fs';
import ts from 'typescript';
const input=process.env.SPORTSGAMEODDS_API_KEY ? '' : fs.readFileSync('/private/tmp/fantasy-hub-sportsgameodds-key.txt','utf8');
const key=process.env.SPORTSGAMEODDS_API_KEY ?? input.match(/^SPORTSGAMEODDS_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^(["'])(.*)\1$/,'$2');
if(!key)throw new Error('API key is missing');
const request=async(path,params={})=>{
  const url=new URL(`https://api.sportsgameodds.com/v2/${path}/`);
  for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
  const r=await fetch(url,{headers:{'x-api-key':key},signal:AbortSignal.timeout(25000)});
  if(!r.ok){console.log(JSON.stringify({endpoint:path,status:r.status}));process.exit(1);}
  return r.json();
};
try {
  const account=await request('account/usage');
  const month=account.data?.rateLimits?.['per-month'];
  console.log(JSON.stringify({active:account.data?.isActive,tier:account.data?.tier,usage:month?.['current-entities'],limit:month?.['max-entities']}));
  const data=await request('events',{leagueID:'NFL',started:'false',oddsAvailable:'true',startsAfter:new Date().toISOString(),startsBefore:new Date(Date.now()+7*86400000).toISOString(),limit:'1',includeAltLines:'false'});
  const code=ts.transpile(fs.readFileSync(new URL('../app/vegas-edge-model.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
  const {normalizeEvents}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const events=normalizeEvents(data.data);
  for(const raw of data.data??[]) {
    const odds=Object.values(raw.odds??{}), props=odds.filter(o=>o.playerID||!['home','away','all'].includes(o.statEntityID));
    console.log(JSON.stringify({game:raw.eventID,startsAt:raw.status?.startsAt,teams:raw.teams,players:Object.values(raw.players??{}).slice(0,2),marketCount:odds.length,propCount:props.length,stats:[...new Set(props.map(p=>p.statID))],sample:props.slice(0,2),normalized:events.map(e=>({home:e.home,away:e.away,total:e.total,homeSpread:e.homeSpread,players:e.players.length,covered:e.players.filter(p=>p.props.length).length,examples:e.players.filter(p=>p.props.length).slice(0,2)}))}));
  }
  if(!events.length)console.log(JSON.stringify({events:0,success:data.success}));
}catch(e){console.error(e instanceof Error?e.name:'Provider check failed');process.exit(1);}
