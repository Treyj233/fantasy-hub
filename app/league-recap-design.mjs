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
export function drawLeagueRecap(pdf, story, { accent=[255,190,38], primary=[19,67,161], logo }={}) {
  const W=612,H=792,M=36,CW=262,GAP=16,navy=[6,17,39],ink=[21,35,54];
  const bright=accent;
  const cards=recapAwardCards(story.recap);
  const text=(value,x,y,size,color,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(clean(value),x,y);};
  const wrap=(value,width,size,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);return pdf.splitTextToSize(clean(value),width);};
  const base=(cover=false)=>{
    pdf.setFillColor(...navy);pdf.rect(0,0,W,H,"F");
    pdf.setFillColor(...primary);pdf.triangle(320,0,W,0,W,340,"F");
    pdf.setDrawColor(35,75,139);pdf.setLineWidth(.5);
    for(let j=0;j<6;j++)pdf.line(410+j*30,0,230+j*30,300);
    pdf.setFillColor(...bright);pdf.rect(0,0,160,6,"F");
    if(logo){pdf.addImage(logo,"PNG",M,22,42,42);}
    text("FANTASY HUB",logo?M+54:M,40,14,[255,255,255],true);
    text("THE LEAGUE STORIES EDITION",logo?M+54:M,55,7.5,bright,true);
    pdf.setFontSize(8);pdf.setTextColor(...bright);pdf.text(`${story.league.season} / WEEK ${String(story.recap.week).padStart(2,"0")}`,W-M,40,{align:"right"});
    if(!cover){text("THE HONOR ROLL",M,107,32,[255,255,255],true);pdf.setFillColor(...bright);pdf.rect(M,123,54,4,"F");}
  };
  base(true);
  pdf.setFont("helvetica","bolditalic");pdf.setFontSize(44);pdf.setTextColor(255,255,255);pdf.text("WEEK IN THE",M,114);
  pdf.setTextColor(...bright);pdf.text("SPOTLIGHT.",M,158);
  const leagueLines=wrap(story.league.name,W-2*M,12,true);
  pdf.setTextColor(214,223,237);pdf.text(leagueLines,M,184);
  let y=199+leagueLines.length*14;
  const name=wrap(story.recap.highScore?.teamName??"Results pending",W-2*M-40,23,true);
  const heroHeight=139+name.length*27;
  pdf.setFillColor(...primary);pdf.rect(M,y,W-2*M,heroHeight,"F");
  pdf.setFillColor(...bright);pdf.rect(M,y,5,heroHeight,"F");
  text("HIGH-SCORE HONORS / THE TEAM TO BEAT",M+20,y+25,9,bright,true);
  pdf.setFontSize(23);pdf.setFont("helvetica","bold");pdf.setTextColor(255,255,255);pdf.text(name,M+20,y+56);
  const scoreY=y+112+name.length*27;
  text(story.recap.highScore?story.recap.highScore.points.toFixed(1):"--",M+20,scoreY,66,[255,255,255],true);
  text("POINTS",M+245,scoreY-6,12,bright,true);
  y+=heroHeight+28;
  text("THE RESULTS. THE REACTIONS. THE RECEIPTS.",M,y-7,9,bright,true);
  // Split unusually long shared-winner panels into readable continuation panels.
  const panels=cards.flatMap((card,index)=>{
    const featured=index%5===0;
    const names=wrap(card.recipient,featured?W-2*M-40:CW-30,featured?22:14,true);
    const details=wrap(card.detail,featured?W-2*M-40:CW-30,featured?11:9.5);
    const content=[...names.map(line=>({line,name:true})),...details.map(line=>({line,name:false}))];
    const chunks=[];
    const limit=featured?17:23;
    for(let start=0;start<content.length;start+=limit)chunks.push({label:card.label,index:index+2,featured,continued:start>0,lines:content.slice(start,start+limit)});
    return chunks;
  });
  for(let i=0;i<panels.length;){
    const row=panels.slice(i,i+(panels[i].featured||panels[i+1]?.featured?1:2));
    i+=row.length;
    const heights=row.map(p=>52+p.lines.reduce((sum,l)=>sum+(l.name?(p.featured?26:17):14),0));
    const rowHeight=Math.max(118,...heights);
    if(y+rowHeight>H-64){pdf.addPage();base();y=150;}
    row.forEach((panel,col)=>{
      const x=M+col*(CW+GAP);
      const panelWidth=panel.featured?W-2*M:CW;
      const spotlight = panel.index % 4 === 0;
      if(spotlight||panel.featured){pdf.setFillColor(...primary);pdf.rect(x,y,panelWidth,rowHeight,"F");}
      else {pdf.setFillColor(13,30,55);pdf.rect(x,y,panelWidth,rowHeight,"F");}
      pdf.setDrawColor(...(spotlight||panel.featured?bright:[49,79,117]));pdf.setLineWidth(1);pdf.line(x,y,x+panelWidth,y);
      text(`${String(panel.index).padStart(2,"0")} / ${panel.label}${panel.continued?" (CONT.)":""}`,x+15,y+29,7.5,bright,true);
      let lineY=y+54;
      panel.lines.forEach(l=>{text(l.line,x+15,lineY,l.name?(panel.featured?22:14):(panel.featured?11:9.5),l.name?[255,255,255]:[192,210,235],l.name);lineY+=l.name?(panel.featured?26:17):14;});
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
