'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {projectionAdapter,type ProjectionSchedule} from './projection-source';
import type {EdgeFeed} from './vegas-edge-model';
import {fetchLiveJson,startVisiblePolling} from './live-polling.mjs';
const off=projectionAdapter(false,[],null);
export const ProjectionSourceContext=createContext(off);
export const useProjectionSource=()=>useContext(ProjectionSourceContext);
export function useProjectionController(allowed:boolean,account:string,season:string) {
  const [preference,setPreference]=useState({account:'',enabled:false});
  const [feed,setFeed]=useState<EdgeFeed|null>(null);
  const [schedule,setSchedule]=useState<ProjectionSchedule|null>(null);
  const [now,setNow]=useState(Date.now);
  const enabled=allowed&&preference.account===account&&preference.enabled;
  useEffect(()=>{let enabled=false;try{enabled=localStorage.getItem(`fantasy-hub:vegas-projections:v1:${account}`)==='on';}catch{}setPreference({account,enabled});setFeed(null);},[account]);
  const toggle=useCallback((on:boolean)=>{if(!allowed)return;setPreference({account,enabled:on});try{localStorage.setItem(`fantasy-hub:vegas-projections:v1:${account}`,on?'on':'off');}catch{}},[allowed,account]);
  useEffect(()=>{
    if(!enabled)return;
    const refresh=async(signal:AbortSignal)=>{
      setNow(Date.now());
      try{
        const [feed,schedule]=await Promise.all([fetchLiveJson('/api/vegas-edge',signal),fetchLiveJson(`/api/nfl-schedule?season=${encodeURIComponent(season)}`,signal)]);
        if(!signal.aborted){setFeed(feed);setSchedule(schedule);}
      }catch{}
    };
    const stop=startVisiblePolling(refresh,600000);
    const tick=setInterval(()=>{if(document.visibilityState==='visible')setNow(Date.now());},60000);
    return()=>{stop();clearInterval(tick);};
  },[enabled,season]);
  const adapter=useMemo(()=>projectionAdapter(enabled,feed?.events??[],schedule,now),[enabled,feed,schedule,now]);
  return {adapter,enabled,toggle,setFeed};
}
