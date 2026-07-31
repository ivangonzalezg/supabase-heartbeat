import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import type { WorkflowResponse } from './workflows.types';

function buildSession(role: 'admin' | 'viewer'): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

const sampleWorkflow: WorkflowResponse = {
  id: 'workflow-1',
  projectId: 'project-1',
  name: 'Sample',
  description: null,
  cronExpression: '0 */6 * * *',
  timezone: 'UTC',
  enabled: true,
  overlapPolicy: 'skip',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockWorkflowsService = {
  list: jest.fn<WorkflowsService['list']>(),
  create: jest.fn<WorkflowsService['create']>(),
  findById: jest.fn<WorkflowsService['findById']>(),
  update: jest.fn<WorkflowsService['update']>(),
  delete: jest.fn<WorkflowsService['delete']>(),
};

describe('WorkflowsController', () => {
  let controller: WorkflowsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
      ],
    }).compile();

    controller = module.get<WorkflowsController>(WorkflowsController);
  });

  it('list() delegates to the service with the actor and project ID', async () => {
    mockWorkflowsService.list.mockResolvedValue([sampleWorkflow]);

    const result = await controller.list(buildSession('viewer'), 'project-1');

    expect(mockWorkflowsService.list).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'viewer' },
      'project-1',
    );
    expect(result).toEqual([sampleWorkflow]);
  });

  it('create() delegates to the service with the actor, project ID, and input', async () => {
    mockWorkflowsService.create.mockResolvedValue(sampleWorkflow);
    const input = {
      name: 'Sample',
      cronExpression: '0 */6 * * *',
      timezone: 'UTC',
    };

    const result = await controller.create(
      buildSession('admin'),
      'project-1',
      input,
    );

    expect(mockWorkflowsService.create).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      input,
    );
    expect(result).toEqual(sampleWorkflow);
  });

  it('findById() delegates to the service with the actor, project ID, and workflow ID', async () => {
    mockWorkflowsService.findById.mockResolvedValue(sampleWorkflow);

    const result = await controller.findById(
      buildSession('viewer'),
      'project-1',
      'workflow-1',
    );

    expect(mockWorkflowsService.findById).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'viewer' },
      'project-1',
      'workflow-1',
    );
    expect(result).toEqual(sampleWorkflow);
  });

  it('update() delegates to the service with the actor, project ID, workflow ID, and input', async () => {
    mockWorkflowsService.update.mockResolvedValue(sampleWorkflow);
    const input = { name: 'Renamed' };

    const result = await controller.update(
      buildSession('admin'),
      'project-1',
      'workflow-1',
      input,
    );

    expect(mockWorkflowsService.update).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      'workflow-1',
      input,
    );
    expect(result).toEqual(sampleWorkflow);
  });

  it('delete() delegates to the service with the actor, project ID, and workflow ID', async () => {
    mockWorkflowsService.delete.mockResolvedValue(undefined);

    await controller.delete(buildSession('admin'), 'project-1', 'workflow-1');

    expect(mockWorkflowsService.delete).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      'workflow-1',
    );
  });
});
