import { WearableSyncStatus } from '@prisma/client';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class WearableSyncHistoryQueryDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  wearableDeviceId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(WearableSyncStatus)
  status?: WearableSyncStatus;
}
