export function tradeMatchesTarget(send, receive, positions = []) {
  // Every consolidation suggestion must buy an upgrade, even with Any selected.
  // Do not charge an extra player to replace a better/equal player at the same position.
  if (send.length > 1 && receive.length === 1 && receive[0].position !== 'PICK') {
    const outgoing = send.filter(asset => asset.position === receive[0].position);
    if (outgoing.length) {
      const bestSent = Math.max(...outgoing.map(asset => asset.value));
      if (receive[0].value < bestSent + Math.max(5, bestSent * .08)) return false;
    }
  }
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
