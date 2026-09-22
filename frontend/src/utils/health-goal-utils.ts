import type { HealthGoal, HealthGoalType } from "../types/care";

const goalMetricLabels: Record<HealthGoalType, string> = {
  WEIGHT: "Weight",
  DAILY_STEPS: "Daily steps",
  DAILY_ACTIVITY_MINUTES: "Exercise minutes",
  HEART_RATE: "Heart rate",
  BLOOD_PRESSURE: "Blood pressure",
  BLOOD_GLUCOSE: "Blood glucose",
  OXYGEN_SATURATION: "Oxygen saturation",
  SLEEP_DURATION: "Sleep hours",
  MEDICATION_ADHERENCE: "Medication adherence",
};

export function goalCurrentValue(goal: HealthGoal): number | null {
  return goal.currentProgress?.value ?? goal.progress?.[0]?.value ?? null;
}

export function goalProgress(goal: HealthGoal): number {
  if (
    typeof goal.progressPercent === "number" &&
    Number.isFinite(goal.progressPercent)
  ) {
    return Math.max(0, Math.min(100, goal.progressPercent));
  }
  const current = goalCurrentValue(goal);
  if (current === null) return 0;

  if (goal.targetValue <= 0) return 0;
  if (goal.direction === "AT_LEAST") {
    return Math.max(0, Math.min(100, (current / goal.targetValue) * 100));
  }
  if (goal.direction === "AT_MOST") {
    return current <= goal.targetValue
      ? 100
      : Math.max(0, Math.min(100, (goal.targetValue / current) * 100));
  }
  const upper = goal.targetSecondaryValue ?? goal.targetValue;
  if (current >= goal.targetValue && current <= upper) return 100;
  return current < goal.targetValue
    ? Math.max(0, Math.min(99, (current / goal.targetValue) * 100))
    : Math.max(0, Math.min(99, (upper / current) * 100));
}

export function formatGoalMetric(value: string): string {
  if (value in goalMetricLabels) {
    return goalMetricLabels[value as HealthGoalType];
  }
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
