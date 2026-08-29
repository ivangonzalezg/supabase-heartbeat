import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import type { OverviewResponse } from './overview.types';

function buildSession(role: 'admin' | 'viewer'): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

const sampleOverview: OverviewResponse = {
  metrics: {
    totalProjects: 1,
    activeWorkflows: 1,
    totalRuns: 0,
    failedRuns: 0,
    lastActivity: null,
    nextRun: null,
    nextRunWorkflowName: null,
    nextRunProjectName: null,
  },
  projects: [],
  recentRuns: [],
  upcomingRuns: [],
};

const mockOverviewService = {
  get: jest.fn<OverviewService['get']>(),
};

describe('OverviewController', () => {
  let controller: OverviewController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OverviewController],
      providers: [{ provide: OverviewService, useValue: mockOverviewService }],
    }).compile();

    controller = module.get<OverviewController>(OverviewController);
  });

  it('get() delegates to the service with the actor derived from the session', async () => {
    mockOverviewService.get.mockResolvedValue(sampleOverview);

    const result = await controller.get(buildSession('viewer'));

    expect(mockOverviewService.get).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'viewer',
    });
    expect(result).toEqual(sampleOverview);
  });
});
