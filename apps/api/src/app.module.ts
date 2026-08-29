import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { WorkflowExecutionModule } from './modules/workflow-execution/workflow-execution.module';
import { WorkspaceSummaryModule } from './modules/workspace-summary/workspace-summary.module';
import { OverviewModule } from './modules/overview/overview.module';
import { FrontendModule } from './frontend/frontend.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    WorkflowsModule,
    WorkflowExecutionModule,
    WorkspaceSummaryModule,
    OverviewModule,
    ...(process.env.NODE_ENV === 'production' ? [FrontendModule] : []),
  ],
})
export class AppModule {}
