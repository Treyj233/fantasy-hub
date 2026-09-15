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
 * @param {{accent?: number[], primary?: number[], deep?: number[], logo?: Uint8Array}} options
 */
export function drawLeagueRecap(pdf, story, { accent=[255,190,38], primary=[19,67,161], deep=[6,17,39], logo }={}) {
  const W=612,H=792,M=36,CW=262,GAP=16;
  const luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const darken=(color,max)=>{let c=[...color];while(luminance(c)>max)c=c.map(v=>Math.floor(v*.9));return c;};
  const navy=darken(deep,.025);
  primary=darken(primary,.12);
  let bright=[...accent];
  while((luminance(bright)+.05)/(luminance(primary)+.05)<4.5)bright=bright.map(v=>Math.min(255,Math.ceil(v+(255-v)*.12)));
  const surface=navy.map((v,i)=>Math.round(v*.7+primary[i]*.3));
  const muted=primary.map(v=>Math.round(v*.2+255*.8));
  const cards=recapAwardCards(story.recap);
  const text=(value,x,y,size,color,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(clean(value),x,y);};
  const wrap=(value,width,size,bold=false)=>{pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(size);return pdf.splitTextToSize(clean(value),width);};
  const base=(cover=false)=>{
    pdf.setFillColor(...navy);pdf.rect(0,0,W,H,"F");
    pdf.setFillColor(...primary);pdf.triangle(320,0,W,0,W,340,"F");
    pdf.setDrawColor(...primary.map(v=>Math.min(255,v+25)));pdf.setLineWidth(.5);
    for(let j=0;j<6;j++)pdf.line(410+j*30,0,230+j*30,300);
    pdf.setFillColor(...bright);pdf.rect(0,0,160,6,"F");
    if(logo){pdf.addImage(logo,"PNG",M,22,42,42);}
    text("FANTASY HUB",logo?M+54:M,40,17,[255,255,255],true);
    text("THE LEAGUE STORIES EDITION",logo?M+54:M,57,10,bright,true);
    pdf.setFontSize(10);pdf.setTextColor(...bright);pdf.text(`${story.league.season} / WEEK ${String(story.recap.week).padStart(2,"0")}`,W-M,40,{align:"right"});
    if(!cover){text("THE HONOR ROLL",M,107,32,[255,255,255],true);pdf.setFillColor(...bright);pdf.rect(M,123,54,4,"F");}
  };
  base(true);
  pdf.setFont("helvetica","bolditalic");pdf.setFontSize(44);pdf.setTextColor(255,255,255);pdf.text("WEEK IN THE",M,114);
  pdf.setTextColor(...bright);pdf.text("SPOTLIGHT.",M,158);
  const leagueLines=wrap(story.league.name,W-2*M,16,true);
  pdf.setTextColor(...muted);pdf.text(leagueLines,M,184);
  let y=199+leagueLines.length*19;
  const name=wrap(story.recap.highScore?.teamName??"Results pending",W-2*M-40,28,true);
  const heroHeight=155+name.length*32;
  pdf.setFillColor(...primary);pdf.rect(M,y,W-2*M,heroHeight,"F");
  pdf.setFillColor(...bright);pdf.rect(M,y,5,heroHeight,"F");
  text("HIGH-SCORE HONORS / THE TEAM TO BEAT",M+20,y+25,11,bright,true);
  pdf.setFontSize(28);pdf.setFont("helvetica","bold");pdf.setTextColor(255,255,255);pdf.text(name,M+20,y+61);
  const scoreY=y+122+name.length*32;
  text(story.recap.highScore?story.recap.highScore.points.toFixed(1):"--",M+20,scoreY,72,[255,255,255],true);
  text("POINTS",M+270,scoreY-6,14,bright,true);
  y+=heroHeight+28;
  text("THE RESULTS. THE REACTIONS. THE RECEIPTS.",M,y-7,11,bright,true);
  // Split unusually long shared-winner panels into readable continuation panels.
  const panels=cards.flatMap((card,index)=>{
    const featured=index%5===0;
    const names=wrap(card.recipient,featured?W-2*M-40:CW-30,featured?26:18,true);
    const details=wrap(card.detail,featured?W-2*M-40:CW-30,featured?13:12);
    const content=[...names.map(line=>({line,name:true})),...details.map(line=>({line,name:false}))];
    const chunks=[];
    const limit=featured?14:19;
    for(let start=0;start<content.length;start+=limit){
      const heading=wrap(`${String(index+2).padStart(2,"0")} / ${card.label}${start>0?" (CONT.)":""}`,featured?W-2*M-40:CW-30,10,true);
      chunks.push({heading,index:index+2,featured,continued:start>0,lines:content.slice(start,start+limit)});
    }
    return chunks;
  });
  for(let i=0;i<panels.length;){
    const row=panels.slice(i,i+(panels[i].featured||panels[i+1]?.featured?1:2));
    i+=row.length;
    const heights=row.map(p=>44+p.heading.length*13+p.lines.reduce((sum,l)=>sum+(l.name?(p.featured?31:22):17),0));
    const rowHeight=Math.max(118,...heights);
    if(y+rowHeight>H-64){pdf.addPage();base();y=150;}
    row.forEach((panel,col)=>{
      const x=M+col*(CW+GAP);
      const panelWidth=panel.featured?W-2*M:CW;
      const spotlight = panel.index % 4 === 0;
      if(spotlight||panel.featured){pdf.setFillColor(...primary);pdf.rect(x,y,panelWidth,rowHeight,"F");}
      else {pdf.setFillColor(...surface);pdf.rect(x,y,panelWidth,rowHeight,"F");}
      pdf.setDrawColor(...(spotlight||panel.featured?bright:primary));pdf.setLineWidth(1);pdf.line(x,y,x+panelWidth,y);
      panel.heading.forEach((line,j)=>text(line,x+15,y+27+j*13,10,bright,true));
      let lineY=y+45+panel.heading.length*13;
      panel.lines.forEach(l=>{text(l.line,x+15,lineY,l.name?(panel.featured?26:18):(panel.featured?13:12),l.name?[255,255,255]:muted,l.name);lineY+=l.name?(panel.featured?31:22):17;});
    });
    y+=rowHeight+14;
  }
  const count=pdf.getNumberOfPages();
  for(let i=1;i<=count;i++){
    pdf.setPage(i);pdf.setDrawColor(...primary);pdf.setLineWidth(.5);pdf.line(M,H-47,W-M,H-47);
    text("REAL RESULTS. LEAGUE-WIDE BRAGGING RIGHTS.",M,H-32,9,bright,true);
    text("fantasyhubapp.com",M,H-19,9,muted);
    pdf.setFontSize(10);pdf.setTextColor(...muted);pdf.text(`${i} / ${count}`,W-M,H-23,{align:"right"});
  }
  pdf.setProperties({title:`${clean(story.league.name)} - Week ${story.recap.week} Recap`,author:"Fantasy Hub",subject:"League Stories weekly awards",creator:"Fantasy Hub"});
  return {pageCount:count,awardCount:cards.length};
}
