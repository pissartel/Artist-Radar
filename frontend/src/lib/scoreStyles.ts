export function getMatchScoreBadgeClass(score: number): string {
  if (score >= 85) {
    return "text-emerald-400 bg-emerald-400/10 border-emerald-400/25";
  }
  if (score >= 70) {
    return "text-accent-light bg-accent/10 border-accent/25";
  }
  return "text-yellow-400 bg-yellow-400/10 border-yellow-400/25";
}
