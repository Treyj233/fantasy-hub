export function tradeMatchesTarget(send, receive, positions = []) {
  if (!positions.length) return true;
  return positions.some(position => {
    const incoming = receive.filter(asset => asset.position === position);
    if (!incoming.length) return false;
    const outgoing = send.filter(asset => asset.position === position);
    if (!outgoing.length) return true;
    // Same-position pieces must buy a clear upgrade, not merely tick the filter.
    const bestSent = Math.max(...outgoing.map(asset => asset.value));
    const bestReceived = Math.max(...incoming.map(asset => asset.value));
    return send.some(asset => asset.position !== position) &&
      bestReceived >= bestSent + Math.max(5, bestSent * .08);
  });
}
