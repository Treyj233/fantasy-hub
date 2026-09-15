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

/** Vector text stays crisp when a recap is zoomed or shared. Every award is paginated.
 * @param {any} pdf
 * @param {any} story
 * @param {{accent?: number[], primary?: number[], logo?: Uint8Array}} options
 */
export function drawLeagueRecap(pdf, story, { accent=[242,185,58], primary=[16,90,160], logo }={}) {
  const W=612,H=792,M=36,CW=262,GAP=16,navy=[10,20,38],ink=[21,35,54];
  const bright=accent.map(v=>Math.round(v*.65+255*.35));
  const cards=recapAwardCards(story.recap);
  const text=(value,x,y,size,color,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(clean(value),x,y);};
  const wrap=(value,width,size,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);return pdf.splitTextToSize(clean(value),width);};
  const base=(cover=false)=>{
    pdf.setFillColor(...navy);pdf.rect(0,0,W,H,"F");
    pdf.setFillColor(...primary);pdf.rect(W-12,0,12,H,"F");
    pdf.setFillColor(...bright);pdf.rect(0,0,W,5,"F");
    if(logo){pdf.addImage(logo,"PNG",M,22,36,36);}
    text("FANTASY HUB",logo?M+47:M,39,13,[255,255,255],true);
    text("LEAGUE STORIES / WEEKLY EDITION",logo?M+47:M,53,7.5,bright,true);
    pdf.setFontSize(8);pdf.setTextColor(...bright);pdf.text(`${story.league.season} / WEEK ${String(story.recap.week).padStart(2,"0")}`,W-M,40,{align:"right"});
    if(!cover){text("THE HONOR ROLL",M,91,26,[255,255,255],true);}
  };
  base(true);
  text("THE WEEK.",M,109,43,[255,255,255],true);
  text("THE BRAGGING RIGHTS.",M,146,28,bright,true);
  const leagueLines=wrap(story.league.name,W-2*M,12,true);
  pdf.setTextColor(214,223,237);pdf.text(leagueLines,M,173);
  let y=183+leagueLines.length*14;
  const name=wrap(story.recap.highScore?.teamName??"Results pending",W-2*M-38,21,true);
  const heroHeight=110+name.length*24;
  pdf.setFillColor(...bright);pdf.roundedRect(M,y,W-2*M,heroHeight,12,12,"F");
  text("01 / HIGH-SCORE HONORS",M+19,y+24,9,ink,true);
  pdf.setFontSize(21);pdf.setFont("helvetica","bold");pdf.setTextColor(...ink);pdf.text(name,M+19,y+52);
  const scoreY=y+81+name.length*24;
  text(story.recap.highScore?story.recap.highScore.points.toFixed(1):"--",M+19,scoreY,42,ink,true);
  text("FANTASY POINTS",M+175,scoreY,9,ink,true);
  y+=heroHeight+28;
  text("THE MOMENTS THAT MADE THE WEEK",M,y-7,9,bright,true);
  // Split unusually long shared-winner panels into readable continuation panels.
  const panels=cards.flatMap((card,index)=>{
    const names=wrap(card.recipient,CW-30,14,true);
    const details=wrap(card.detail,CW-30,9.5);
    const content=[...names.map(line=>({line,name:true})),...details.map(line=>({line,name:false}))];
    const chunks=[];
    for(let start=0;start<content.length;start+=23)chunks.push({label:card.label,index:index+2,continued:start>0,lines:content.slice(start,start+23)});
    return chunks;
  });
  for(let i=0;i<panels.length;i+=2){
    const row=panels.slice(i,i+2);
    const heights=row.map(p=>52+p.lines.reduce((sum,l)=>sum+(l.name?17:12),0));
    const rowHeight=Math.max(118,...heights);
    if(y+rowHeight>H-64){pdf.addPage();base();y=119;}
    row.forEach((panel,col)=>{
      const x=M+col*(CW+GAP);
      const spotlight = panel.index % 4 === 0;
      pdf.setFillColor(...(spotlight ? [28,47,73] : [245,247,251]));pdf.roundedRect(x,y,CW,rowHeight,9,9,"F");
      pdf.setFillColor(...bright);pdf.rect(x+15,y+15,23,3,"F");
      text(`${String(panel.index).padStart(2,"0")} / ${panel.label}${panel.continued?" (CONT.)":""}`,x+15,y+33,7.5,spotlight?bright:ink,true);
      let lineY=y+54;
      panel.lines.forEach(l=>{text(l.line,x+15,lineY,l.name?14:9.5,spotlight?(l.name?[255,255,255]:[206,218,234]):(l.name?ink:[76,90,108]),l.name);lineY+=l.name?17:12;});
    });
    y+=rowHeight+14;
  }
  const count=pdf.getNumberOfPages();
  for(let i=1;i<=count;i++){
    pdf.setPage(i);pdf.setDrawColor(58,76,102);pdf.setLineWidth(.5);pdf.line(M,H-47,W-M,H-47);
    text("REAL RESULTS. LEAGUE-WIDE BRAGGING RIGHTS.",M,H-32,7,bright,true);
    text("fantasyhubapp.com",M,H-19,7,[195,207,222]);
    pdf.setFontSize(8);pdf.setTextColor(195,207,222);pdf.text(`${i} / ${count}`,W-M,H-23,{align:"right"});
  }
  pdf.setProperties({title:`${clean(story.league.name)} - Week ${story.recap.week} Recap`,author:"Fantasy Hub",subject:"League Stories weekly awards",creator:"Fantasy Hub"});
  return {pageCount:count,awardCount:cards.length};
}
