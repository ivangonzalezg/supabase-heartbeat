import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { WorkflowStepsController } from './workflow-steps.controller';
import { WorkflowStepsService } from './workflow-steps.service';
import type { WorkflowStepResponse } from './workflow-steps.types';

function buildSession(role: 'admin' | 'viewer'): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

const sampleStep: WorkflowStepResponse = {
  id: 'step-1',
  workflowId: 'workflow-1',
  stepKey: 'sign-in',
  type: 'signin',
  position: 0,
  configuration: {},
  enabled: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockWorkflowStepsService = {
  list: jest.fn<WorkflowStepsService['list']>(),
  create: jest.fn<WorkflowStepsService['create']>(),
  findById: jest.fn<WorkflowStepsService['findById']>(),
  update: jest.fn<WorkflowStepsService['update']>(),
  delete: jest.fn<WorkflowStepsService['delete']>(),
};

describe('WorkflowStepsController', () => {
  let controller: WorkflowStepsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowStepsController],
      providers: [
        { provide: WorkflowStepsService, useValue: mockWorkflowStepsService },
      ],
    }).compile();

    controller = module.get<WorkflowStepsController>(WorkflowStepsController);
  });

  it('list() delegates to the service with the actor, project ID, and workflow ID', async () => {
    mockWorkflowStepsService.list.mockResolvedValue([sampleStep]);

    const result = await controller.list(
      buildSession('viewer'),
      'project-1',
      'workflow-1',
    );

    expect(mockWorkflowStepsService.list).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'viewer' },
      'project-1',
      'workflow-1',
    );
    expect(result).toEqual([sampleStep]);
  });

  it('create() delegates to the service with the actor, project ID, workflow ID, and input', async () => {
    mockWorkflowStepsService.create.mockResolvedValue(sampleStep);
    const input = {
      stepKey: 'sign-in',
      type: 'signin' as const,
      configuration: {},
    };

    const result = await controller.create(
      buildSession('admin'),
      'project-1',
      'workflow-1',
      input,
    );

    expect(mockWorkflowStepsService.create).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      'workflow-1',
      input,
    );
    expect(result).toEqual(sampleStep);
  });

  it('findById() delegates to the service with the actor, project ID, workflow ID, and step ID', async () => {
    mockWorkflowStepsService.findById.mockResolvedValue(sampleStep);

    const result = await controller.findById(
      buildSession('viewer'),
      'project-1',
      'workflow-1',
      'step-1',
    );

    expect(mockWorkflowStepsService.findById).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'viewer' },
      'project-1',
      'workflow-1',
      'step-1',
    );
    expect(result).toEqual(sampleStep);
  });

  it('update() delegates to the service with the actor, project ID, workflow ID, step ID, and input', async () => {
    mockWorkflowStepsService.update.mockResolvedValue(sampleStep);
    const input = { enabled: false };

    const result = await controller.update(
      buildSession('admin'),
      'project-1',
      'workflow-1',
      'step-1',
      input,
    );

    expect(mockWorkflowStepsService.update).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      'workflow-1',
      'step-1',
      input,
    );
    expect(result).toEqual(sampleStep);
  });

  it('delete() delegates to the service with the actor, project ID, workflow ID, and step ID', async () => {
    mockWorkflowStepsService.delete.mockResolvedValue(undefined);

    await controller.delete(
      buildSession('admin'),
      'project-1',
      'workflow-1',
      'step-1',
    );

    expect(mockWorkflowStepsService.delete).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      'workflow-1',
      'step-1',
    );
  });
});
