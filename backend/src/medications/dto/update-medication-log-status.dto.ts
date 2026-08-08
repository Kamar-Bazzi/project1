import { IsEnum } from 'class-validator';
import { MedicationLogStatus } from '@prisma/client';

export class UpdateMedicationLogStatusDto {
  @IsEnum(MedicationLogStatus)
  status: MedicationLogStatus;
}
