import { getChatGPTUser } from '../../chatgpt-auth';
import { entitlementFor } from '../../entitlements';
import { vegasFeed } from '../../vegas-edge-server';

async function respond(refresh:boolean) {
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:'Sign in required'},{status:401});
  const access=await entitlementFor(user.userId,user.email);
  // Owner-only rollout. Remove this check only with an explicit release request.
  if(!access.owner)return Response.json({error:'Owner preview only'},{status:403});
  if(!access.elite)return Response.json({error:'Fantasy Hub Elite required'},{status:402});
  try{return Response.json(await vegasFeed(refresh),{headers:{'Cache-Control':'private, no-store'}});}
  catch{return Response.json({error:'Markets are unavailable. Please try again.'},{status:503});}
}
export async function GET(){return respond(false);}
export async function POST(request:Request){
  const origin=request.headers.get('origin');
  if(origin && origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403});
  return respond(true);
}
