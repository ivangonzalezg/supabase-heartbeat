import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import type { ProjectResponse } from './projects.types';

function buildSession(role: 'admin' | 'viewer'): UserSession {
  return {
    user: { id: 'user-1', role },
    session: {},
  } as unknown as UserSession;
}

const sampleProject: ProjectResponse = {
  id: 'project-1',
  ownerId: 'user-1',
  name: 'Sample',
  description: null,
  supabaseUrl: 'https://example.supabase.co',
  publishableKey: 'sb_publishable_example',
  enabled: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockProjectsService = {
  list: jest.fn<ProjectsService['list']>(),
  create: jest.fn<ProjectsService['create']>(),
  findById: jest.fn<ProjectsService['findById']>(),
  update: jest.fn<ProjectsService['update']>(),
  delete: jest.fn<ProjectsService['delete']>(),
};

describe('ProjectsController', () => {
  let controller: ProjectsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: mockProjectsService }],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('list() delegates to the service with the actor derived from the session', async () => {
    mockProjectsService.list.mockResolvedValue([sampleProject]);

    const result = await controller.list(buildSession('viewer'));

    expect(mockProjectsService.list).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'viewer',
    });
    expect(result).toEqual([sampleProject]);
  });

  it('create() delegates to the service with the actor and input', async () => {
    mockProjectsService.create.mockResolvedValue(sampleProject);
    const input = {
      name: 'Sample',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    };

    const result = await controller.create(buildSession('admin'), input);

    expect(mockProjectsService.create).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      input,
    );
    expect(result).toEqual(sampleProject);
  });

  it('findById() delegates to the service with the actor and project ID', async () => {
    mockProjectsService.findById.mockResolvedValue(sampleProject);

    const result = await controller.findById(
      buildSession('viewer'),
      'project-1',
    );

    expect(mockProjectsService.findById).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'viewer' },
      'project-1',
    );
    expect(result).toEqual(sampleProject);
  });

  it('update() delegates to the service with the actor, project ID, and input', async () => {
    mockProjectsService.update.mockResolvedValue(sampleProject);
    const input = { name: 'Renamed' };

    const result = await controller.update(
      buildSession('admin'),
      'project-1',
      input,
    );

    expect(mockProjectsService.update).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
      input,
    );
    expect(result).toEqual(sampleProject);
  });

  it('delete() delegates to the service with the actor and project ID', async () => {
    mockProjectsService.delete.mockResolvedValue(undefined);

    await controller.delete(buildSession('admin'), 'project-1');

    expect(mockProjectsService.delete).toHaveBeenCalledWith(
      { userId: 'user-1', role: 'admin' },
      'project-1',
    );
  });
});
