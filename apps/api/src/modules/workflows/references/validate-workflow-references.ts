import type { JsonValue } from '@supabase-heartbeat/validation';
import { discoverStepOutputReferences } from './reference-discovery';
import {
  DisabledStepReferenceError,
  ForwardStepReferenceError,
  InvalidStepReferenceSyntaxError,
  ReferencedStepNotFoundError,
} from './workflow-reference.errors';

/**
 * The minimal shape this pure validator needs for one step: its stable
 * identity, whether it is enabled, and its configuration. Deliberately
 * narrower than a full `WorkflowStep` database row — this validator has
 * no database dependency and no authorization concern; callers (CRUD
 * services, execution preflight) build this shape from whatever source
 * they already have (a DTO array, persisted rows, a merged patch
 * result).
 */
export interface WorkflowStepReferenceInput {
  readonly stepKey: string;
  readonly enabled: boolean;
  readonly configuration: JsonValue;
}

/**
 * Validates every enabled step's references against the complete
 * proposed ordered list of steps — array order **is** execution order,
 * matching every other part of this codebase's "position" concept
 * (Workflow Steps API, manual-run engine). Pure and synchronous: no
 * database access, no I/O, safe to call inside a `better-sqlite3`
 * transaction callback (which cannot `await`).
 *
 * Only enabled steps' configurations are scanned for references — a
 * disabled step never executes, so a malformed or otherwise invalid
 * reference sitting inside a *disabled* step's configuration does not
 * block validation of the rest of the workflow (see
 * `apps/api/README.md`, "Output references" for the full policy
 * rationale). If that step is enabled later, its references are
 * validated at that point, like any other change to `enabled`.
 *
 * For each enabled step, in order:
 * 1. discovers every reference inside its configuration
 *    (`discoverStepOutputReferences`);
 * 2. rejects any reference-like-but-malformed string
 *    (`InvalidStepReferenceSyntaxError`) — this also rejects partial
 *    interpolation, since a partial match never parses as one complete
 *    reference;
 * 3. rejects a reference to an unknown `stepKey`
 *    (`ReferencedStepNotFoundError`);
 * 4. rejects a reference to a step at the same or a later index —
 *    including the step referencing itself — as a forward reference
 *    (`ForwardStepReferenceError`). Because only strictly earlier
 *    indices are ever allowed, a structurally valid workflow can never
 *    contain a reference cycle: any cycle would require at least one
 *    edge pointing at the same or a later index, which this check
 *    already rejects. No separate graph-cycle detector is needed or
 *    built.
 * 5. rejects a reference to a disabled step
 *    (`DisabledStepReferenceError`), evaluated against the *proposed*
 *    `enabled` state passed in by the caller, not any previously
 *    persisted state.
 *
 * Does not attempt to prove that a reference's path will exist in the
 * referenced step's actual runtime output — that depends on remote
 * execution data unknowable at validation time (see the runtime
 * resolver, `resolve-step-references.ts`, for that check).
 */
export function validateWorkflowReferences(
  orderedSteps: readonly WorkflowStepReferenceInput[],
): void {
  const indexByStepKey = new Map<string, number>();
  orderedSteps.forEach((step, index) => {
    indexByStepKey.set(step.stepKey, index);
  });

  orderedSteps.forEach((step, index) => {
    if (!step.enabled) {
      return;
    }

    const { references, malformed } = discoverStepOutputReferences(
      step.configuration,
    );

    for (const candidate of malformed) {
      throw new InvalidStepReferenceSyntaxError({
        stepKey: step.stepKey,
        configurationPath: candidate.configurationPath.join('.'),
      });
    }

    for (const discovered of references) {
      const referencedStepKey = discovered.reference.stepKey;
      const referencedIndex = indexByStepKey.get(referencedStepKey);

      if (referencedIndex === undefined) {
        throw new ReferencedStepNotFoundError({
          stepKey: step.stepKey,
          referencedStepKey,
        });
      }

      if (referencedIndex >= index) {
        throw new ForwardStepReferenceError({
          stepKey: step.stepKey,
          referencedStepKey,
        });
      }

      const referencedStep = orderedSteps[referencedIndex];
      if (!referencedStep.enabled) {
        throw new DisabledStepReferenceError({
          stepKey: step.stepKey,
          referencedStepKey,
        });
      }
    }
  });
}
