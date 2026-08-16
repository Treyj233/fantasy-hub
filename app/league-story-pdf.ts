import type { LeagueStoryData } from "./FantasyHub";

export type LeagueStoryReportKind = "league" | "rivalry" | "recap" | "trade" | "wrapped";

export type LeagueStoryReportRequest = {
  id: string;
  kind: LeagueStoryReportKind;
  shareText: string;
  rivalryRosterId?: number;
  tradeId?: string;
};

const ascii = (value: string) => value
  .replace(/[–—]/g, "-")
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[^\x20-\x7E]/g, "");

const safeFileName = (value: string) => ascii(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "league-story";

const cssColor = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

const rgb = (color: string, fallback: [number, number, number]): [number, number, number] => {
  const hex = color.match(/^#([\da-f]{6})$/i)?.[1];
  if (hex) return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? channels as [number, number, number] : fallback;
};

const reportContent = (story: LeagueStoryData, request: LeagueStoryReportRequest) => {
  const recap = story.recap;
  const wrapped = story.seasonNarrative.wrapped;
  if (request.kind === "rivalry") {
    const rival = story.rivalries.reports.find((item) => item.rosterId === request.rivalryRosterId);
    return {
      eyebrow: `RIVALRY REPORT - WEEK ${story.league.completedWeek}`,
      title: rival ? `You vs ${rival.teamName}` : "Rivalry report",
      summary: rival?.smackTalk ?? request.shareText,
      metrics: rival ? [[`${rival.wins}-${rival.losses}${rival.ties ? `-${rival.ties}` : ""}`, "HEAD TO HEAD"], [rival.pointsFor.toFixed(1), "YOUR POINTS"], [rival.pointsAgainst.toFixed(1), "THEIR POINTS"]] : [],
      sections: rival ? [["Latest chapter", rival.weeklyNote], ["The receipts", rival.latest ? `Week ${rival.latest.week}: ${rival.latest.yourPoints.toFixed(1)} to ${rival.latest.rivalPoints.toFixed(1)} (${rival.latest.result}).` : "The next head-to-head result is still being written."]] : [],
    };
  }
  if (request.kind === "recap") return {
    eyebrow: `WEEK ${recap.week} RECAP`, title: "The week that was", summary: request.shareText || "Your league's latest completed week.",
    metrics: [[recap.highScore?.points.toFixed(1) ?? "-", "HIGH SCORE"], [recap.closestGame ? Math.abs(recap.closestGame.teams[0].points - recap.closestGame.teams[1].points).toFixed(1) : "-", "CLOSEST MARGIN"], [recap.biggestWin ? Math.abs(recap.biggestWin.teams[0].points - recap.biggestWin.teams[1].points).toFixed(1) : "-", "BIGGEST WIN"]],
    sections: [["High-score honors", recap.highScore ? `${recap.highScore.teamName} led the league with ${recap.highScore.points.toFixed(1)} points.` : "Scoring is not final."], ["Photo finish", recap.closestGame ? `${recap.closestGame.teams.map((team) => team.teamName).join(" vs ")} produced the closest matchup.` : "No completed matchup available."], ["Biggest upset", recap.biggestUpset ? `${recap.biggestUpset.winner.teamName} beat ${recap.biggestUpset.loser.teamName}, overcoming a ${recap.biggestUpset.seedGap}-seed gap.` : "No qualifying upset was observed."]],
  };
  if (request.kind === "trade") {
    const trade = story.trades.find((item) => item.id === request.tradeId);
    return {
      eyebrow: `TRADE WIRE - WEEK ${trade?.week ?? story.league.currentWeek}`, title: trade?.teams.slice(0, 2).join(" x ") || "Completed trade", summary: request.shareText,
      metrics: [[String(trade?.adds.length ?? 0), "PLAYERS MOVED"], [String(trade?.teams.length ?? 0), "TEAMS"], [`W${trade?.week ?? story.league.currentWeek}`, "TRADE WEEK"]],
      sections: (trade?.teams.slice(0, 2) ?? []).map((team) => [team, trade?.adds.filter((item) => item.team === team).map((item) => item.player).join(", ") || "No player assets recorded."]),
    };
  }
  if (request.kind === "wrapped") return {
    eyebrow: wrapped.ready ? "FANTASY WRAPPED" : "SEASON STORY SO FAR", title: wrapped.headline, summary: request.shareText,
    metrics: [[wrapped.record, "RECORD"], [wrapped.points.toFixed(1), "POINTS"], [String(wrapped.closeWins), "CLOSE WINS"]],
    sections: [["Best week", wrapped.bestWeek ? `Week ${wrapped.bestWeek.week}: ${wrapped.bestWeek.yourPoints.toFixed(1)} points.` : "Still waiting for a signature week."], ["Championship path", story.seasonNarrative.championshipPath], ["Turning point", story.seasonNarrative.turningPoint ? `Week ${story.seasonNarrative.turningPoint.week} vs ${story.seasonNarrative.turningPoint.opponent}.` : "The season's turning point is still being written."]],
  };
  return {
    eyebrow: `${story.league.season} LEAGUE PULSE`, title: story.league.name, summary: request.shareText,
    metrics: [[story.playoff.yourRank ? `#${story.playoff.yourRank}` : "-", "YOUR RANK"], [String(story.playoff.weeksRemaining), "WEEKS LEFT"], [String(story.powerRankings.length), "TEAMS RANKED"]],
    sections: [["Playoff picture", story.playoff.summary], ["This week's headline", recap.highScore ? `${recap.highScore.teamName} posted the high score at ${recap.highScore.points.toFixed(1)}.` : "The current week is still in progress."], ["Season trajectory", story.seasonNarrative.championshipPath]],
  };
};

export async function generateLeagueStoryPdf(story: LeagueStoryData, request: LeagueStoryReportRequest) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  const primary = rgb(cssColor("--green", "#087443"), [8, 116, 67]);
  const deep = rgb(cssColor("--deep", "#043923"), [4, 57, 35]);
  const accent = rgb(cssColor("--gold", "#e9a928"), [233, 169, 40]);
  const report = reportContent(story, request);
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 46;

  pdf.setFillColor(...deep); pdf.rect(0, 0, width, height, "F");
  pdf.setFillColor(...primary); pdf.circle(width - 36, 80, 145, "F");
  pdf.setDrawColor(...accent); pdf.setLineWidth(3); pdf.line(margin, 40, width - margin, 40);
  pdf.setTextColor(...accent); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text("FANTASY HUB  /  LEAGUE STORIES", margin, 67);
  pdf.setTextColor(223, 239, 229); pdf.setFontSize(9); pdf.text(ascii(report.eyebrow), margin, 108);
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(28); pdf.text(pdf.splitTextToSize(ascii(report.title), width - margin * 2), margin, 142);
  const titleLines = pdf.splitTextToSize(ascii(report.title), width - margin * 2).length;
  const summaryY = 142 + titleLines * 30;
  pdf.setFont("helvetica", "normal"); pdf.setTextColor(207, 224, 214); pdf.setFontSize(12); pdf.text(pdf.splitTextToSize(ascii(report.summary), width - margin * 2), margin, summaryY);

  const metricY = summaryY + 74;
  const metricWidth = (width - margin * 2 - 20) / 3;
  report.metrics.slice(0, 3).forEach(([value, label], index) => {
    const x = margin + index * (metricWidth + 10);
    pdf.setFillColor(255, 255, 255); pdf.roundedRect(x, metricY, metricWidth, 82, 10, 10, "F");
    pdf.setTextColor(...primary); pdf.setFont("helvetica", "bold"); pdf.setFontSize(22); pdf.text(ascii(value), x + 14, metricY + 34);
    pdf.setTextColor(81, 101, 90); pdf.setFontSize(8); pdf.text(ascii(label), x + 14, metricY + 57);
  });

  let y = metricY + 116;
  report.sections.slice(0, 4).forEach(([heading, body], index) => {
    const lines = pdf.splitTextToSize(ascii(body), width - margin * 2 - 28);
    const boxHeight = Math.max(74, 47 + lines.length * 12);
    pdf.setFillColor(index % 2 ? 16 : 20, index % 2 ? 64 : 72, index % 2 ? 44 : 48); pdf.roundedRect(margin, y, width - margin * 2, boxHeight, 9, 9, "F");
    pdf.setTextColor(...accent); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text(ascii(heading).toUpperCase(), margin + 14, y + 23);
    pdf.setTextColor(235, 244, 238); pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(lines, margin + 14, y + 43);
    y += boxHeight + 10;
  });

  pdf.setDrawColor(...accent); pdf.setLineWidth(1); pdf.line(margin, height - 62, width - margin, height - 62);
  pdf.setTextColor(181, 204, 190); pdf.setFontSize(7); pdf.text(`Generated ${new Date().toLocaleDateString()} from observed ${ascii(story.league.provider)} league data.`, margin, height - 42);
  pdf.text("fantasyhubapp.com  |  Make every week count.", width - margin, height - 42, { align: "right" });
  pdf.setProperties({ title: `${story.league.name} - ${report.title}`, subject: report.eyebrow, author: "Fantasy Hub", creator: "Fantasy Hub League Stories" });

  const fileName = `${safeFileName(story.league.name)}-${safeFileName(request.kind)}-report.pdf`;
  return { blob: pdf.output("blob"), fileName, title: `${story.league.name}: ${report.title}` };
}
