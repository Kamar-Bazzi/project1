import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { SyncHealthMetricItemDto } from './create-health-metric.dto';
import { MAX_SYNC_MEASUREMENTS } from './health-metric-validation';

export class SyncHealthMetricsDto {
  @IsUUID('4')
  wearableDeviceId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SYNC_MEASUREMENTS)
  @ValidateNested({ each: true })
  @Type(() => SyncHealthMetricItemDto)
  measurements: SyncHealthMetricItemDto[];
}

export class DemoSyncDto {
  @IsUUID('4')
  wearableDeviceId: string;
}
