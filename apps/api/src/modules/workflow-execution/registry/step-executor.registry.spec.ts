import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import type { StepExecutionResult, StepExecutor } from '../contracts';
import { WorkflowStepExecutor } from '../decorators/workflow-step-executor.decorator';
import {
  DuplicateStepExecutorError,
  InvalidStepExecutorProviderError,
  StepExecutorNotFoundError,
} from '../errors/workflow-execution.errors';
import { StepExecutorRegistry } from './step-executor.registry';

@WorkflowStepExecutor('signin')
@Injectable()
class FixtureSigninExecutor implements StepExecutor<'signin'> {
  readonly type = 'signin' as const;
  execute(): Promise<StepExecutionResult> {
    return Promise.resolve({
      output: { authenticated: true, userId: 'fixture-user' },
    });
  }
}

@WorkflowStepExecutor('signout')
@Injectable()
class FixtureSignoutExecutor implements StepExecutor<'signout'> {
  readonly type = 'signout' as const;
  execute(): Promise<StepExecutionResult> {
    return Promise.resolve({ output: { signedOut: true } });
  }
}

@WorkflowStepExecutor('wait')
@Injectable()
class FixtureWaitExecutor implements StepExecutor<'wait'> {
  readonly type = 'wait' as const;
  execute(): Promise<StepExecutionResult> {
    return Promise.resolve({ output: { waitedSeconds: 1 } });
  }
}

/** A provider with no relation to workflow-step execution — the registry
 * must ignore it entirely, without ever inspecting its shape. */
@Injectable()
class UnrelatedProvider {
  ping(): string {
    return 'pong';
  }
}

async function buildRegistry(
  providers: unknown[],
): Promise<{ module: TestingModule; registry: StepExecutorRegistry }> {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [StepExecutorRegistry, ...(providers as never[])],
  }).compile();

  const app = module.createNestApplication();
  await app.init();

  return { module, registry: module.get(StepExecutorRegistry) };
}

describe('StepExecutorRegistry', () => {
  describe('with signin, signout, and wait executors registered', () => {
    let module: TestingModule;
    let registry: StepExecutorRegistry;

    beforeAll(async () => {
      ({ module, registry } = await buildRegistry([
        FixtureSigninExecutor,
        FixtureSignoutExecutor,
        FixtureWaitExecutor,
        UnrelatedProvider,
      ]));
    });

    afterAll(async () => {
      await module.close();
    });

    it('discovers and resolves the signin executor by canonical type', () => {
      expect(registry.get('signin')).toBeInstanceOf(FixtureSigninExecutor);
    });

    it('discovers and resolves the signout executor by canonical type', () => {
      expect(registry.get('signout')).toBeInstanceOf(FixtureSignoutExecutor);
    });

    it('discovers and resolves the wait executor by canonical type', () => {
      expect(registry.get('wait')).toBeInstanceOf(FixtureWaitExecutor);
    });

    it('ignores unrelated providers without registering them under any type', () => {
      expect(() => registry.get('insert')).toThrow(StepExecutorNotFoundError);
    });

    it('throws the focused not-found error for a type with no registered executor', () => {
      expect(() => registry.get('read')).toThrow(StepExecutorNotFoundError);
      expect(() => registry.get('update')).toThrow(StepExecutorNotFoundError);
      expect(() => registry.get('delete')).toThrow(StepExecutorNotFoundError);
      expect(() => registry.get('invoke_function')).toThrow(
        StepExecutorNotFoundError,
      );
    });

    it('produces a deterministic registration result across repeated lookups', () => {
      const first = registry.get('signin');
      const second = registry.get('signin');
      expect(first).toBe(second);
    });

    it('exposes no method that could add, remove, or replace a registered executor', () => {
      const registryKeys = Object.getOwnPropertyNames(
        Object.getPrototypeOf(registry) as object,
      );
      const mutationLikeNames = registryKeys.filter((key) =>
        /^(set|add|register|remove|delete|clear|put)/i.test(key),
      );
      expect(mutationLikeNames).toEqual([]);
    });
  });

  describe('with a duplicate executor registration', () => {
    @WorkflowStepExecutor('signin')
    @Injectable()
    class DuplicateSigninExecutor implements StepExecutor<'signin'> {
      readonly type = 'signin' as const;
      execute(): Promise<StepExecutionResult> {
        return Promise.resolve({
          output: { authenticated: true, userId: 'other' },
        });
      }
    }

    it('fails during initialization rather than silently keeping one executor', async () => {
      const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
          StepExecutorRegistry,
          FixtureSigninExecutor,
          DuplicateSigninExecutor,
        ],
      }).compile();
      const app = module.createNestApplication();

      await expect(app.init()).rejects.toThrow(DuplicateStepExecutorError);

      await app.close();
    });
  });

  describe('with a malformed decorated provider', () => {
    @WorkflowStepExecutor('signin')
    @Injectable()
    class ExecuteIsNotAFunction {
      readonly type = 'signin' as const;
      readonly execute = 'not-a-function';
    }

    it('fails clearly rather than registering an unusable executor', async () => {
      const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [StepExecutorRegistry, ExecuteIsNotAFunction],
      }).compile();
      const app = module.createNestApplication();

      await expect(app.init()).rejects.toThrow(
        InvalidStepExecutorProviderError,
      );

      await app.close();
    });
  });

  describe('with a provider whose declared type does not match its own type property', () => {
    @WorkflowStepExecutor('signin')
    @Injectable()
    class MismatchedTypeExecutor implements StepExecutor<'wait'> {
      readonly type = 'wait' as const;
      execute(): Promise<StepExecutionResult> {
        return Promise.resolve({ output: { waitedSeconds: 1 } });
      }
    }

    it('fails clearly rather than registering it under the metadata type', async () => {
      const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [StepExecutorRegistry, MismatchedTypeExecutor],
      }).compile();
      const app = module.createNestApplication();

      await expect(app.init()).rejects.toThrow(
        InvalidStepExecutorProviderError,
      );

      await app.close();
    });
  });
});
