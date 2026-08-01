import { jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { WorkflowRunsController } from './workflow-runs.controller';
import { WorkflowRunsService } from './workflow-runs.service';
import type { WorkflowRunDetailResponse } from './workflow-runs.types';

function buildSession(role: 'admin' | 'viewer'): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

const sampleRun: WorkflowRunDetailResponse = {
  id: 'run-1',
  workflowId: 'workflow-1',
  triggerType: 'manual',
  status: 'success',
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
  finishedAt: new Date('2026-01-01T00:00:05.000Z'),
  error: null,
  stepRuns: [],
};

const mockWorkflowRunsService = {
  executeManual: jest.fn<WorkflowRunsService['executeManual']>(),
};

describe('WorkflowRunsController', () => {
  let controller: WorkflowRunsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowRunsController],
      providers: [
        { provide: WorkflowRunsService, useValue: mockWorkflowRunsService },
      ],
    }).compile();

    controller = module.get<WorkflowRunsController>(WorkflowRunsController);
  });

  it('execute() delegates to the service with the actor, project ID, and workflow ID', async () => {
    mockWorkflowRunsService.executeManual.mockResolvedValue(sampleRun);

    const result = await controller.execute(
      buildSession('admin'),
      'project-1',
      'workflow-1',
    );

    expect(mockWorkflowRunsService.executeManual).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      'workflow-1',
    );
    expect(result).toEqual(sampleRun);
  });

  it('execute() delegates exactly once', async () => {
    mockWorkflowRunsService.executeManual.mockResolvedValue(sampleRun);

    await controller.execute(buildSession('admin'), 'project-1', 'workflow-1');

    expect(mockWorkflowRunsService.executeManual).toHaveBeenCalledTimes(1);
  });

  it('execute() forwards the service response unchanged, including a failed run', async () => {
    const failedRun: WorkflowRunDetailResponse = {
      ...sampleRun,
      status: 'failed',
      error: 'Workflow run failed: Step "a" (signin) failed: bad credentials',
    };
    mockWorkflowRunsService.executeManual.mockResolvedValue(failedRun);

    const result = await controller.execute(
      buildSession('admin'),
      'project-1',
      'workflow-1',
    );

    expect(result).toEqual(failedRun);
  });

  it('propagates project ID and workflow ID exactly as received', async () => {
    mockWorkflowRunsService.executeManual.mockResolvedValue(sampleRun);

    await controller.execute(
      buildSession('admin'),
      'a-specific-project-id',
      'a-specific-workflow-id',
    );

    expect(mockWorkflowRunsService.executeManual).toHaveBeenCalledWith(
      expect.anything(),
      'a-specific-project-id',
      'a-specific-workflow-id',
    );
  });

  it('declares admin-only role metadata on the execute() route', () => {
    const reflector = new Reflector();
    const controllerPrototype = Object.getPrototypeOf(controller) as {
      execute: (...args: unknown[]) => unknown;
    };
    const requiredRoles = reflector.get<string[]>(
      'ROLES',
      controllerPrototype.execute,
    );

    expect(requiredRoles).toEqual(['admin']);
  });
});
