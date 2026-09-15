import { drawCompactRecap } from './league-recap-compact.mjs';
const clean = value => String(value ?? "").replace(/[–—]/g,"-").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7E\xA0-\xFF]/g,"").trim();

export function recapAwardCards(recap) {
  const gameCard = (id,label,game,winner=false) => {
    if(!game?.teams?.length)return [];
    const sorted=[...game.teams].sort((a,b)=>b.points-a.points);
    if(winner && sorted[0].points===sorted[1].points)return [];
    return [{id,label,recipient:winner?sorted[0].teamName:game.teams.map(t=>t.teamName).join(" vs "),detail:`${Math.abs(sorted[0].points-sorted[1].points).toFixed(2)}-point margin | ${sorted.map(t=>t.points.toFixed(1)).join(" - ")}`}];
  };
  return [...gameCard("photo","PHOTO FINISH",recap.closestGame), ...gameCard("statement","STATEMENT WIN",recap.biggestWin,true), ...(recap.biggestUpset?[{id:"upset",label:"BIGGEST UPSET",recipient:recap.biggestUpset.winner.teamName,detail:`Beat ${recap.biggestUpset.loser.teamName} | ${recap.biggestUpset.seedGap} places higher entering the week`}]:[]), ...(recap.superlatives??[])];
}

export function drawLeagueRecap(pdf,story,options={}) {
  return drawCompactRecap(pdf,story,options,recapAwardCards(story.recap));
}
