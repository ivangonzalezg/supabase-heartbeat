import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { FrontendModule } from './frontend/frontend.module';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    ...(process.env.NODE_ENV === 'production' ? [FrontendModule] : []),
  ],
})
export class AppModule {}
