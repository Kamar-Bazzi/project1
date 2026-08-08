import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@ValidatorConstraint({ name: 'endDateOnOrAfterStartDate', async: false })
export class EndDateOnOrAfterStartDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, validationArguments: ValidationArguments) {
    if (endDate === undefined || endDate === null) {
      return true;
    }

    const startDate = (validationArguments.object as { startDate?: unknown })
      .startDate;

    if (
      typeof startDate !== 'string' ||
      typeof endDate !== 'string' ||
      !DATE_ONLY_PATTERN.test(startDate) ||
      !DATE_ONLY_PATTERN.test(endDate)
    ) {
      return true;
    }

    return endDate >= startDate;
  }

  defaultMessage() {
    return 'endDate must be on or after startDate';
  }
}
