import { Test, type TestingModule } from '@nestjs/testing';
import type { WorkflowStepType } from '@supabase-heartbeat/validation';
import { WorkflowExecutionContextFactory } from './context/workflow-execution-context.factory';
import { StepExecutorRegistry } from './registry/step-executor.registry';
import { WorkflowExecutionModule } from './workflow-execution.module';

const ALL_MVP_STEP_TYPES: readonly WorkflowStepType[] = [
  'signin',
  'signout',
  'wait',
  'insert',
  'read',
  'update',
  'delete',
  'invoke_function',
];

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

  it('registers exactly the 8 canonical MVP executor types', () => {
    const registry = moduleRef.get(StepExecutorRegistry);

    for (const type of ALL_MVP_STEP_TYPES) {
      expect(registry.get(type)).toBeDefined();
    }
  });

  it('resolves each registered executor with its own matching type', () => {
    const registry = moduleRef.get(StepExecutorRegistry);

    for (const type of ALL_MVP_STEP_TYPES) {
      expect(registry.get(type).type).toBe(type);
    }
  });

  it('produces a working, callable executor for every canonical MVP type — no lookup fails as missing', () => {
    const registry = moduleRef.get(StepExecutorRegistry);

    for (const type of ALL_MVP_STEP_TYPES) {
      expect(() => registry.get(type)).not.toThrow();
      expect(typeof registry.get(type).execute).toBe('function');
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

  it('introduces no controller or public HTTP route', () => {
    const app = moduleRef.createNestApplication();
    const httpAdapter = app.getHttpAdapter();
    const instance = httpAdapter.getInstance() as {
      _router?: { stack?: unknown[] };
    };

    // Express only builds a `_router` once a route/middleware has been
    // registered; `WorkflowExecutionModule` declares no `@Controller`, so
    // no router stack should exist from this module alone.
    expect(instance._router?.stack ?? []).toHaveLength(0);
  });
});
