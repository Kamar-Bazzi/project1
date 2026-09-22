import { Type } from 'class-transformer';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';

export class SecurityDashboardQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  hours = 24;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
