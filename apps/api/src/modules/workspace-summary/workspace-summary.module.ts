import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { WorkspaceSummaryController } from './workspace-summary.controller';
import { WorkspaceSummaryService } from './workspace-summary.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkspaceSummaryController],
  providers: [WorkspaceSummaryService],
})
export class WorkspaceSummaryModule {}
