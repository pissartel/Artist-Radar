interface StepIndicatorProps {
  step: number;
  totalSteps: number;
  className?: string;
}

export default function StepIndicator({
  step,
  totalSteps,
  className = "",
}: StepIndicatorProps) {
  return (
    <p
      className={`text-xs font-bold text-accent-text tracking-widest uppercase text-center ${className}`}
    >
      Step {step} of {totalSteps}
    </p>
  );
}
