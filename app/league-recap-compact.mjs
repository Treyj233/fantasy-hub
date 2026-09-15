const clean=v=>String(v??'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[^\x20-\x7e\xa0-\xff]/g,'').trim();

/** Three fixed editorial pages. Overflow is explicitly linked to the full in-app report. */
export function drawCompactRecap(pdf,story,{primary=[19,67,161],accent=[255,190,38],deep=[6,17,39],logo,portraits={}}={},cards=[]){
  const W=612,M=32,B=728,white=[255,255,255];
  const luminance=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const darken=(c,max)=>{c=[...c];while(luminance(c)>max)c=c.map(v=>Math.floor(v*.9));return c;};
  primary=darken(primary,.10);deep=darken(deep,.025);
  accent=[...accent];while((luminance(accent)+.05)/(luminance(primary)+.05)<4.5)accent=accent.map(v=>Math.min(255,Math.ceil(v+(255-v)*.15)));
  const muted=[210,216,228],surface=deep.map((v,i)=>Math.round(v*.65+primary[i]*.35));
  const text=(s,x,y,size=12,color=white,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(clean(s),x,y);};
  const lines=(s,x,y,width,size=12,max=2,color=white,bold=false)=>{
    pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
    let ls=pdf.splitTextToSize(clean(s),width);
    if(ls.length>max){ls=ls.slice(0,max);let last=ls[max-1];while(pdf.getTextWidth(last+'...')>width)last=last.slice(0,-1);ls[max-1]=last+'...';}
    ls.forEach((l,i)=>text(l,x,y+i*(size+3),size,color,bold));
  };
  const panel=(x,y,w,h,color=surface)=>{pdf.setFillColor(...color);pdf.roundedRect(x,y,w,h,7,7,'F');};
  const page=(title,n)=>{
    if(n>1)pdf.addPage();pdf.setFillColor(...deep);pdf.rect(0,0,612,792,'F');
    pdf.setFillColor(...primary);pdf.triangle(370,0,612,0,612,240,'F');pdf.setFillColor(...accent);pdf.rect(0,0,150,5,'F');
    if(logo){pdf.saveGraphicsState();pdf.roundedRect(M,22,36,36,8,8,null);pdf.clip();pdf.discardPath();pdf.addImage(logo,'PNG',M,22,36,36);pdf.restoreGraphicsState();}
    text('FANTASY HUB',logo?M+46:M,38,15,white,true);text(`WEEK ${story.recap.week} / ${story.league.season}`,W-145,38,10,accent,true);
    lines(story.league.name,logo?M+46:M,54,380,10,1,muted);
    text(title,M,96,27,white,true);pdf.setFillColor(...accent);pdf.rect(M,107,46,3,'F');
    text('Full stories, shared honors and details at fantasyhubapp.com',M,755,9,muted);
    pdf.link(M,742,460,20,{url:'https://fantasyhubapp.com'});text(`${n} / 3`,W-56,755,10,accent,true);
  };
  const visual=story.recap.visual??{starters:[],bench:[],efficiency:[],standings:[]};
  page('THE WEEK IN FOCUS',1);
  panel(M,122,548,80,primary);text('HIGH-SCORE HONORS',M+14,141,10,accent,true);
  lines(story.recap.highScore?.teamName??'Results pending',M+14,163,360,18,2,white,true);
  text(story.recap.highScore?.points.toFixed(2)??'--',W-145,175,30,white,true);
  let y=222,omitted=0;
  for(const [title,players] of [['IMPACT STARTERS',visual.starters],['BENCH FIREPOWER',visual.bench]]){
    text(title,M,y,13,accent,true);y+=12;
    const shown=players.slice(0,6);omitted+=Math.max(0,players.length-6);
    shown.forEach((p,i)=>{
      const x=M+(i%3)*185,top=y+Math.floor(i/3)*113;
      panel(x,top,178,105);
      pdf.setFillColor(...primary);pdf.circle(x+27,top+27,19,'F');
      const photo=portraits[p.image];
      let photoDrawn=false;
      if(photo){pdf.saveGraphicsState();pdf.circle(x+27,top+27,19,null);pdf.clip();pdf.discardPath();try{pdf.addImage(photo,photo[0]===137?'PNG':'JPEG',x+8,top+8,38,38);photoDrawn=true;}catch{/* Keep position fallback. */}pdf.restoreGraphicsState();}
      if(!photoDrawn)text(p.position,x+14,top+31,10,accent,true);
      text(p.points.toFixed(2),x+58,top+27,20,white,true);text(`${p.position} / ${p.nflTeam||'NFL'}${p.shared?' / TIED':''}`,x+58,top+42,8,accent,true);
      lines(p.name,x+10,top+62,158,12,2,white,true);lines(p.teamName,x+10,top+95,158,9,1,muted);
    });
    if(!shown.length)text('Confirmed player scoring unavailable.',M,y+30,12,muted);
    y+=226+20;
  }
  if(omitted)text(`${omitted} additional position leaders or shared winners in the full report.`,M,724,9,muted);
  page('THE HONOR ROLL',2);
  const awards=cards.slice(0,24),rows=Math.max(1,Math.ceil(awards.length/3)),height=Math.min(112,(B-124)/rows-7);
  awards.forEach((a,i)=>{
    const x=M+(i%3)*185,y=124+Math.floor(i/3)*(height+7);
    panel(x,y,178,height,i%4===0?primary:surface);
    lines(a.label,x+10,y+16,158,8.5,2,accent,true);
    lines(a.recipient,x+10,y+42,158,12,height<78?1:2,white,true);
    // Dense award editions use a one-line receipt; complete descriptions stay in the app.
    lines(a.detail,x+10,y+height-12,158,9,1,muted);
  });
  if(!awards.length)text('Awards will appear when qualifying results are available.',M,150,12,muted);
  if(cards.length>24)text(`${cards.length-24} additional awards in the full report.`,M,735,9,muted);
  page('THE LEAGUE LADDER',3);
  text('Record, scoring and lineup efficiency in one view.',M,126,11,muted);
  const standings=visual.standings.slice(0,32),columns=standings.length>16?2:1;
  const perColumn=Math.ceil(standings.length/columns),width=columns===1?548:268;
  const rowHeight=Math.min(43,548/Math.max(1,perColumn));
  const efficiency=new Map(visual.efficiency.map(t=>[t.rosterId,t]));
  standings.forEach((t,i)=>{
    const col=Math.floor(i/perColumn),x=M+col*280,y=145+(i%perColumn)*rowHeight;
    if(t.isMine)panel(x-2,y,width+2,rowHeight-2,primary);
    const e=efficiency.get(t.rosterId),small=columns===2;
    text(t.rank,x+4,y+15,11,accent,true);
    lines(t.teamName,x+28,y+15,small?140:250,small?10:12,1,white,true);
    const record=`${t.wins}-${t.losses}${t.ties?`-${t.ties}`:''}${!t.complete?' *':''}`;
    text(record,x+28,y+29,9,muted);
    text(`${t.pf.toFixed(1)} PF / ${t.pa.toFixed(1)} PA`,x+(small?62:103),y+29,small?8:9,muted);
    const barX=x+width-(small?70:137),barW=small?64:128;
    text(e?.percent!=null?`${e.percent.toFixed(1)}%`:'--',barX,y+15,small?10:13,accent,true);
    pdf.setFillColor(...surface);pdf.rect(barX,y+23,barW,4,'F');
    if(e?.percent!=null){pdf.setFillColor(...accent);pdf.rect(barX,y+23,barW*e.percent/100,4,'F');}
  });
  if(!standings.length)text('Confirmed standings unavailable.',M,160,12,muted);
  text('Efficiency: starter points / best legal lineup. Hindsight, not a decision grade.',M,712,9,muted);
  text(`-- means incomplete lineup scoring. * means partial history.${visual.standings.length>32?' Full league in app.':''}`,M,727,9,muted);
  pdf.setProperties({title:`${clean(story.league.name)} - Week ${story.recap.week} Recap`,author:'Fantasy Hub',creator:'Fantasy Hub'});
  return {pageCount:3,awardCount:awards.length};
}
