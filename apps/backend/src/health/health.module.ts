import { Module } from '@nestjs/common';
import { HealthController as HealthController } from './health.controller';
import { HealthService as HealthService } from './health.service';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
