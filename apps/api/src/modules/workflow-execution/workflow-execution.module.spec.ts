import { Test, type TestingModule } from '@nestjs/testing';
import { WorkflowExecutionContextFactory } from './context/workflow-execution-context.factory';
import { StepExecutorNotFoundError } from './errors/workflow-execution.errors';
import { StepExecutorRegistry } from './registry/step-executor.registry';
import { WorkflowExecutionModule } from './workflow-execution.module';

/**
 * Integration tests proving `WorkflowExecutionModule` bootstraps
 * correctly under a real NestJS application (not just resolves in a
 * bare testing module) — discovery only runs during application
 * initialization (`app.init()`), so a `TestingModule.compile()` alone
 * would not exercise `StepExecutorRegistry.onModuleInit`.
 *
 * No live Supabase project or network access is used anywhere here.
 */
describe('WorkflowExecutionModule (integration)', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WorkflowExecutionModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('bootstraps successfully', () => {
    expect(moduleRef).toBeDefined();
  });

  it('registers exactly the three implemented executor types', () => {
    const registry = moduleRef.get(StepExecutorRegistry);

    expect(registry.get('signin')).toBeDefined();
    expect(registry.get('signout')).toBeDefined();
    expect(registry.get('wait')).toBeDefined();
  });

  it('resolves each registered executor with its own matching type', () => {
    const registry = moduleRef.get(StepExecutorRegistry);

    expect(registry.get('signin').type).toBe('signin');
    expect(registry.get('signout').type).toBe('signout');
    expect(registry.get('wait').type).toBe('wait');
  });

  it('throws the focused missing-executor error for every unimplemented type', () => {
    const registry = moduleRef.get(StepExecutorRegistry);

    for (const type of [
      'insert',
      'read',
      'update',
      'delete',
      'invoke_function',
    ] as const) {
      expect(() => registry.get(type)).toThrow(StepExecutorNotFoundError);
    }
  });

  it('gives separate contexts separate Supabase client instances', () => {
    const contextFactory = moduleRef.get(WorkflowExecutionContextFactory);

    const first = contextFactory.create({
      projectId: 'project-1',
      workflowId: 'workflow-1',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });
    const second = contextFactory.create({
      projectId: 'project-2',
      workflowId: 'workflow-2',
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });

    expect(first.supabase).not.toBe(second.supabase);
  });
});
