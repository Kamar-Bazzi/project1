import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';

@Module({
  imports: [AuthModule],
  controllers: [MeasurementsController],
  providers: [MeasurementsService],
})
export class MeasurementsModule {}
