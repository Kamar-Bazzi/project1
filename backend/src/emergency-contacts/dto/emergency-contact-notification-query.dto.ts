import { NotificationDeliveryStatus } from '@prisma/client';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class EmergencyContactNotificationQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  emergencyContactId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(NotificationDeliveryStatus)
  status?: NotificationDeliveryStatus;
}
