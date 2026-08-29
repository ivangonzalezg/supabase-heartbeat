import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [DatabaseModule, WorkflowsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
