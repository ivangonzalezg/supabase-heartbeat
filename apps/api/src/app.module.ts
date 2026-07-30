import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { FrontendModule } from './frontend/frontend.module';

@Module({
  imports: [...(process.env.NODE_ENV === 'production' ? [FrontendModule] : [])],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
