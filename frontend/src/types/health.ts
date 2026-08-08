export const wearableProviders = [
  "MOCK",
  "HEALTH_CONNECT",
  "HEALTHKIT",
  "FITBIT",
  "GARMIN",
  "SAMSUNG",
  "OTHER",
] as const;

export type WearableProvider = (typeof wearableProviders)[number];

export const healthMetricTypes = [
  "HEART_RATE",
  "RESTING_HEART_RATE",
  "STEPS",
  "DISTANCE",
  "CALORIES",
  "SLEEP_DURATION",
  "BLOOD_OXYGEN",
  "RESPIRATORY_RATE",
  "BODY_TEMPERATURE",
  "WEIGHT",
] as const;

export type HealthMetricType = (typeof healthMetricTypes)[number];

export type HealthMetricSource =
  | "MOCK"
  | "HEALTH_CONNECT"
  | "HEALTHKIT"
  | "FITBIT"
  | "GARMIN"
  | "SAMSUNG"
  | "MANUAL"
  | "OTHER";

export interface WearableDevice {
  id: string;
  provider: WearableProvider;
  deviceName: string;
  externalDeviceId: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HealthMetric {
  id: string;
  wearableDeviceId: string | null;
  metricType: HealthMetricType;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  source: HealthMetricSource;
  externalRecordId?: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface HealthMetricInput {
  metricType: HealthMetricType;
  value: number;
  secondaryValue?: number | null;
  unit: string;
  measuredAt: string;
  externalRecordId?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthMetricFilters {
  metricType?: HealthMetricType;
  from?: string;
  to?: string;
  limit?: number;
}

export type HealthAlertSeverity = "INFO" | "WARNING" | "URGENT";
export type HealthAlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";

export interface HealthAlert {
  id: string;
  metricType: HealthMetricType;
  severity: HealthAlertSeverity;
  message: string;
  metricId: string | null;
  alertRuleId: string | null;
  status: HealthAlertStatus;
  detectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  metricType: HealthMetricType;
  enabled: boolean;
  minimumValue: number | null;
  maximumValue: number | null;
  consecutiveReadingsRequired: number;
  severity: HealthAlertSeverity;
  notifyEmergencyContacts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRuleInput {
  metricType: HealthMetricType;
  enabled: boolean;
  minimumValue: number | null;
  maximumValue: number | null;
  consecutiveReadingsRequired: number;
  severity: HealthAlertSeverity;
  notifyEmergencyContacts: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyContactInput {
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  active: boolean;
}

interface MetricPresentation {
  label: string;
  shortLabel: string;
  defaultUnit: string;
  decimals: number;
  icon: string;
}

export const healthMetricPresentation: Record<
  HealthMetricType,
  MetricPresentation
> = {
  HEART_RATE: {
    label: "Heart rate",
    shortLabel: "Heart rate",
    defaultUnit: "bpm",
    decimals: 0,
    icon: "♥",
  },
  RESTING_HEART_RATE: {
    label: "Resting heart rate",
    shortLabel: "Resting HR",
    defaultUnit: "bpm",
    decimals: 0,
    icon: "R",
  },
  STEPS: {
    label: "Steps",
    shortLabel: "Steps",
    defaultUnit: "count",
    decimals: 0,
    icon: "S",
  },
  DISTANCE: {
    label: "Distance",
    shortLabel: "Distance",
    defaultUnit: "km",
    decimals: 1,
    icon: "↗",
  },
  CALORIES: {
    label: "Active calories",
    shortLabel: "Calories",
    defaultUnit: "kcal",
    decimals: 0,
    icon: "C",
  },
  SLEEP_DURATION: {
    label: "Sleep duration",
    shortLabel: "Sleep",
    defaultUnit: "min",
    decimals: 0,
    icon: "Zz",
  },
  BLOOD_OXYGEN: {
    label: "Blood oxygen",
    shortLabel: "Blood oxygen",
    defaultUnit: "%",
    decimals: 0,
    icon: "O₂",
  },
  RESPIRATORY_RATE: {
    label: "Respiratory rate",
    shortLabel: "Respiratory rate",
    defaultUnit: "breaths/min",
    decimals: 0,
    icon: "RR",
  },
  BODY_TEMPERATURE: {
    label: "Body temperature",
    shortLabel: "Temperature",
    defaultUnit: "°C",
    decimals: 1,
    icon: "T",
  },
  WEIGHT: {
    label: "Weight",
    shortLabel: "Weight",
    defaultUnit: "kg",
    decimals: 1,
    icon: "W",
  },
};

export const providerLabels: Record<WearableProvider, string> = {
  MOCK: "Demo provider",
  HEALTH_CONNECT: "Android Health Connect",
  HEALTHKIT: "Apple HealthKit",
  FITBIT: "Fitbit",
  GARMIN: "Garmin",
  SAMSUNG: "Samsung Health",
  OTHER: "Other provider",
};

export function formatMetricValue(metric: HealthMetric): string {
  if (metric.metricType === "SLEEP_DURATION" && metric.unit === "min") {
    const minutes = Math.max(0, Math.round(metric.value));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours}h ${remainder}m`;
  }

  const { decimals } = healthMetricPresentation[metric.metricType];
  const value = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(metric.value);

  return metric.unit === "count" ? value : `${value} ${metric.unit}`;
}
