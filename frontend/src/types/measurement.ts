export const measurementTypes = [
  "BLOOD_PRESSURE",
  "TEMPERATURE",
  "WEIGHT",
  "BLOOD_GLUCOSE",
  "HEART_RATE",
  "OXYGEN_SATURATION",
] as const;

export type MeasurementType = (typeof measurementTypes)[number];

export interface Measurement {
  id: string;
  patientId?: string;
  type: MeasurementType;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MeasurementInput {
  type: MeasurementType;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
}

export type UpdateMeasurementInput = Partial<MeasurementInput>;

export const measurementMetadata: Record<
  MeasurementType,
  { label: string; unit: string; valueLabel: string; secondaryLabel?: string }
> = {
  BLOOD_PRESSURE: {
    label: "Blood pressure",
    unit: "mmHg",
    valueLabel: "Systolic",
    secondaryLabel: "Diastolic",
  },
  TEMPERATURE: {
    label: "Temperature",
    unit: "°C",
    valueLabel: "Temperature",
  },
  WEIGHT: { label: "Weight", unit: "kg", valueLabel: "Weight" },
  BLOOD_GLUCOSE: {
    label: "Blood glucose",
    unit: "mg/dL",
    valueLabel: "Glucose",
  },
  HEART_RATE: {
    label: "Heart rate",
    unit: "bpm",
    valueLabel: "Heart rate",
  },
  OXYGEN_SATURATION: {
    label: "Oxygen saturation",
    unit: "%",
    valueLabel: "Saturation",
  },
};
