export function getMatchScoreBadgeClass(score: number): string {
  if (score >= 85) {
    return "text-success-text bg-success-tint border-success-tint";
  }
  if (score >= 70) {
    return "text-accent-text bg-accent-tint border-accent-tint";
  }
  return "text-warning-text bg-warning-tint border-warning-tint";
}

export function getMatchScoreColor(score: number): string {
  if (score >= 85) return "#4ADE80";
  if (score >= 70) return "#C084FC";
  return "#FB923C";
}
