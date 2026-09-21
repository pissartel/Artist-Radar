export interface WeightedScoreSignal {
  score: number | null;
  weight: number;
}

/** Combines only evidenced signals and renormalizes their configured weights. */
export function calculateAvailableWeightedScore(signals: WeightedScoreSignal[]): number {
  const available = signals.filter((signal): signal is { score: number; weight: number } => signal.score !== null);
  const availableWeight = available.reduce((sum, signal) => sum + signal.weight, 0);
  if (availableWeight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(
    available.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / availableWeight
  )));
}
