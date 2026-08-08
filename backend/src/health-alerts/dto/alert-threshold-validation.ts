import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

interface ThresholdCarrier {
  minimumValue?: number | null;
  maximumValue?: number | null;
}

@ValidatorConstraint({ name: 'hasValidAlertThresholds', async: false })
export class HasValidAlertThresholdsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, arguments_: ValidationArguments): boolean {
    const object = arguments_.object as ThresholdCarrier;
    const minimum = object.minimumValue;
    const maximum = object.maximumValue;

    return (
      (minimum != null || maximum != null) &&
      (minimum == null || maximum == null || minimum < maximum)
    );
  }

  defaultMessage(): string {
    return 'at least one threshold is required and minimumValue must be less than maximumValue';
  }
}
