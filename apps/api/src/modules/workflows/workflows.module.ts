import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowStepsController } from './steps/workflow-steps.controller';
import { WorkflowStepsService } from './steps/workflow-steps.service';
import { WorkflowRunsController } from './runs/workflow-runs.controller';
import { WorkflowRunsService } from './runs/workflow-runs.service';

@Module({
  imports: [DatabaseModule, WorkflowExecutionModule],
  controllers: [
    WorkflowsController,
    WorkflowStepsController,
    WorkflowRunsController,
  ],
  providers: [WorkflowsService, WorkflowStepsService, WorkflowRunsService],
  exports: [WorkflowRunsService],
})
export class WorkflowsModule {}
