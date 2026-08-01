import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { WorkflowStepType } from '@supabase-heartbeat/validation';
import type { StepExecutor } from '../contracts';
import { WORKFLOW_STEP_EXECUTOR_TYPE } from '../decorators/workflow-step-executor.decorator';
import {
  DuplicateStepExecutorError,
  InvalidStepExecutorProviderError,
  StepExecutorNotFoundError,
} from '../errors/workflow-execution.errors';

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Discovers every provider decorated with `@WorkflowStepExecutor` during
 * application bootstrap and exposes a single `get(type)` lookup — no
 * manually maintained switch statement or executor array anywhere in this
 * module.
 *
 * Discovery runs eagerly in `onModuleInit`, not lazily on first `get()`:
 * a duplicate-type registration or a malformed provider must fail
 * application bootstrap, not surface later inside an eventual workflow
 * execution. Once built, the internal map is never mutated again — this
 * class exposes no public method that could add, remove, or replace an
 * entry after initialization.
 */
@Injectable()
export class StepExecutorRegistry implements OnModuleInit {
  private executorsByType: ReadonlyMap<WorkflowStepType, StepExecutor> =
    new Map();

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    this.executorsByType = this.discoverExecutors();
  }

  /**
   * Looks up the executor registered for `type`. Throws
   * `StepExecutorNotFoundError` for any canonical type that has no
   * implementation yet (e.g. `insert`) — an unimplemented type is never
   * silently skipped or substituted.
   */
  get(type: WorkflowStepType): StepExecutor {
    const executor = this.executorsByType.get(type);
    if (!executor) {
      throw new StepExecutorNotFoundError(type);
    }
    return executor;
  }

  private discoverExecutors(): ReadonlyMap<WorkflowStepType, StepExecutor> {
    const providers = this.discoveryService.getProviders();
    const executorsByType = new Map<WorkflowStepType, StepExecutor>();

    for (const wrapper of providers) {
      const metatype = wrapper.metatype;
      if (!metatype) {
        continue;
      }

      const declaredType = this.reflector.get<WorkflowStepType | undefined>(
        WORKFLOW_STEP_EXECUTOR_TYPE,
        metatype,
      );
      if (declaredType === undefined) {
        // Not a workflow-step executor provider — ignore it, same as
        // every other unrelated provider in the application.
        continue;
      }

      const instance: unknown = wrapper.instance;
      const providerName =
        typeof wrapper.name === 'string' ? wrapper.name : metatype.name;

      if (
        instance === null ||
        typeof instance !== 'object' ||
        !isCallable((instance as { execute?: unknown }).execute)
      ) {
        throw new InvalidStepExecutorProviderError(
          `provider "${providerName}" is decorated with ` +
            '@WorkflowStepExecutor but does not implement a callable ' +
            '"execute" method.',
        );
      }

      const declaredInstanceType = (instance as { type?: unknown }).type;
      if (declaredInstanceType !== declaredType) {
        throw new InvalidStepExecutorProviderError(
          `provider "${providerName}" is decorated with ` +
            `@WorkflowStepExecutor('${declaredType}') but its own ` +
            `"type" property is "${String(declaredInstanceType)}".`,
        );
      }

      if (executorsByType.has(declaredType)) {
        throw new DuplicateStepExecutorError(declaredType);
      }

      executorsByType.set(declaredType, instance as StepExecutor);
    }

    return executorsByType;
  }
}
