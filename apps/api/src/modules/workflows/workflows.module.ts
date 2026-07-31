import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowStepsController } from './steps/workflow-steps.controller';
import { WorkflowStepsService } from './steps/workflow-steps.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkflowsController, WorkflowStepsController],
  providers: [WorkflowsService, WorkflowStepsService],
})
export class WorkflowsModule {}
