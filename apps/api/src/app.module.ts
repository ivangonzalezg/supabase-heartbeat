import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { WorkflowExecutionModule } from './modules/workflow-execution/workflow-execution.module';
import { FrontendModule } from './frontend/frontend.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    WorkflowsModule,
    WorkflowExecutionModule,
    ...(process.env.NODE_ENV === 'production' ? [FrontendModule] : []),
  ],
})
export class AppModule {}
