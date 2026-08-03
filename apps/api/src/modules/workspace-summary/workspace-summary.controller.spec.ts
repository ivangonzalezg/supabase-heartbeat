import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { WorkspaceSummaryController } from './workspace-summary.controller';
import { WorkspaceSummaryService } from './workspace-summary.service';
import type { WorkspaceSummaryResponse } from './workspace-summary.types';

function buildSession(role: 'admin' | 'viewer'): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

const sampleSummary: WorkspaceSummaryResponse = {
  projects: [
    {
      id: 'project-1',
      ownerId: 'user-1',
      name: 'Sample',
      description: null,
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
      enabled: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ],
  workflows: [
    {
      id: 'workflow-1',
      projectId: 'project-1',
      name: 'Workflow',
      description: null,
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      enabled: true,
      overlapPolicy: 'skip',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ],
};

const mockWorkspaceSummaryService = {
  get: jest.fn<WorkspaceSummaryService['get']>(),
};

describe('WorkspaceSummaryController', () => {
  let controller: WorkspaceSummaryController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspaceSummaryController],
      providers: [
        {
          provide: WorkspaceSummaryService,
          useValue: mockWorkspaceSummaryService,
        },
      ],
    }).compile();

    controller = module.get<WorkspaceSummaryController>(
      WorkspaceSummaryController,
    );
  });

  it('get() delegates to the service with the actor derived from the session', async () => {
    mockWorkspaceSummaryService.get.mockResolvedValue(sampleSummary);

    const result = await controller.get(buildSession('viewer'));

    expect(mockWorkspaceSummaryService.get).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'viewer',
    });
    expect(result).toEqual(sampleSummary);
  });
});
