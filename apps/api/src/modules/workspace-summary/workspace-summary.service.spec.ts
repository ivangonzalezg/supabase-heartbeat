import { join } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../../database/schema';
import type { AppDatabase } from '../../database/database.types';
import type { AuthenticatedActor } from '../../lib/authorization/authorization.types';
import { WorkspaceSummaryService } from './workspace-summary.service';

function createTestDb(): { db: AppDatabase; connection: Database.Database } {
  const connection = new Database(':memory:');
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection, { schema }) as AppDatabase;
  migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });

  return { db, connection };
}

async function createUser(
  db: AppDatabase,
  role: 'admin' | 'viewer',
  overrides: Partial<schema.NewUser> = {},
) {
  const [user] = await db
    .insert(schema.users)
    .values({
      id: crypto.randomUUID(),
      name: 'Test User',
      email: `${crypto.randomUUID()}@example.com`,
      emailVerified: false,
      role,
      ...overrides,
    })
    .returning();
  return user;
}

function actorFor(user: {
  id: string;
  role: string | null;
}): AuthenticatedActor {
  return { userId: user.id, role: user.role as 'admin' | 'viewer' };
}

async function createProject(
  db: AppDatabase,
  ownerId: string,
  overrides: Partial<schema.NewProject> = {},
) {
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: crypto.randomUUID(),
      ownerId,
      name: 'Project',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
      ...overrides,
    })
    .returning();
  return project;
}

async function createWorkflow(
  db: AppDatabase,
  projectId: string,
  overrides: Partial<schema.NewWorkflow> = {},
) {
  const [workflow] = await db
    .insert(schema.workflows)
    .values({
      id: crypto.randomUUID(),
      projectId,
      name: 'Workflow',
      cronExpression: '0 * * * *',
      timezone: 'UTC',
      ...overrides,
    })
    .returning();
  return workflow;
}

describe('WorkspaceSummaryService', () => {
  let db: AppDatabase;
  let connection: Database.Database;
  let service: WorkspaceSummaryService;
  let owner: Awaited<ReturnType<typeof createUser>>;
  let otherOwner: Awaited<ReturnType<typeof createUser>>;
  let ownerActor: AuthenticatedActor;

  beforeEach(async () => {
    ({ db, connection } = createTestDb());
    service = new WorkspaceSummaryService({ db } as never);

    owner = await createUser(db, 'admin');
    otherOwner = await createUser(db, 'admin');
    ownerActor = actorFor(owner);
  });

  afterEach(() => {
    connection.close();
  });

  it('returns an empty summary for a user with no projects', async () => {
    const result = await service.get(ownerActor);

    expect(result).toEqual({ projects: [], workflows: [] });
  });

  it('returns only the actor own projects, with the full field set', async () => {
    const owned = await createProject(db, owner.id, { name: 'Mine' });
    await createProject(db, otherOwner.id, { name: 'Not mine' });

    const result = await service.get(ownerActor);

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toEqual({
      id: owned.id,
      ownerId: owner.id,
      name: 'Mine',
      description: owned.description,
      supabaseUrl: owned.supabaseUrl,
      publishableKey: owned.publishableKey,
      enabled: true,
      createdAt: owned.createdAt,
      updatedAt: owned.updatedAt,
    });
  });

  it('returns only workflows belonging to the actor own projects, with the full field set', async () => {
    const ownedProject = await createProject(db, owner.id);
    const otherProject = await createProject(db, otherOwner.id);
    const ownedWorkflow = await createWorkflow(db, ownedProject.id, {
      name: 'Mine',
    });
    await createWorkflow(db, otherProject.id, { name: 'Not mine' });

    const result = await service.get(ownerActor);

    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0]).toEqual({
      id: ownedWorkflow.id,
      projectId: ownedProject.id,
      name: 'Mine',
      description: ownedWorkflow.description,
      cronExpression: ownedWorkflow.cronExpression,
      timezone: ownedWorkflow.timezone,
      enabled: true,
      overlapPolicy: ownedWorkflow.overlapPolicy,
      createdAt: ownedWorkflow.createdAt,
      updatedAt: ownedWorkflow.updatedAt,
    });
  });

  it('includes workflows across all of the actor own projects', async () => {
    const projectA = await createProject(db, owner.id, { name: 'A' });
    const projectB = await createProject(db, owner.id, { name: 'B' });
    await createWorkflow(db, projectA.id, { name: 'Workflow A' });
    await createWorkflow(db, projectB.id, { name: 'Workflow B' });

    const result = await service.get(ownerActor);

    expect(result.workflows).toHaveLength(2);
    expect(result.workflows.map((w) => w.projectId).sort()).toEqual(
      [projectA.id, projectB.id].sort(),
    );
  });

  it('does not include a project with no workflows in the workflows list', async () => {
    await createProject(db, owner.id);

    const result = await service.get(ownerActor);

    expect(result.projects).toHaveLength(1);
    expect(result.workflows).toHaveLength(0);
  });
});
