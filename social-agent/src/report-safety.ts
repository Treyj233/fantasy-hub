export function beneficiaryAvailable(player:{status?:string;injury_status?:string|null}) {
  const status=(player.status??'').trim();
  const injury=(player.injury_status??'').trim();
  return !/\b(DNR|SUS|suspended|suspension|inactive|out|IR|PUP|NFI|injured|questionable|doubtful|did not report|do not report|reserve|retired)\b/i.test(status)
    && (!injury || /^(healthy|active|none)$/i.test(injury));
}
export function recycledReport(text:string,referenceDate?:string,now=Date.now()) {
  const historical=/\b(last (?:year|season|month|week)|years? ago|months? ago|weeks? ago|on this day|throwback|flashback|previously (?:signed|agreed|traded)|signed (?:back )?in 20\d{2})\b/i.test(text);
  const oldReference=Boolean(referenceDate&&(!Number.isFinite(Date.parse(referenceDate))||Date.parse(referenceDate)<now-48*3600000));
  // Fresh commentary alone does not establish a new transaction. Send historical
  // material to review rather than trusting words like "today" or "breaking".
  return historical||oldReference;
}
