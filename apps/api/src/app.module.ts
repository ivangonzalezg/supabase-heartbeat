import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { FrontendModule } from './frontend/frontend.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    ...(process.env.NODE_ENV === 'production' ? [FrontendModule] : []),
  ],
})
export class AppModule {}
