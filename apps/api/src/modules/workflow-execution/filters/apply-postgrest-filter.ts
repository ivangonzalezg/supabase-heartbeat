import type {
  UpdateConfiguration,
  WorkflowStepType,
} from '@supabase-heartbeat/validation';
import { UnsupportedPersistedFilterOperatorError } from './unsupported-filter-operator.error';

type ValidatedFilter = UpdateConfiguration['filter'];

/**
 * The structural subset of a PostgREST filter builder this translator
 * needs: exactly the filter methods it may call, each returning the same
 * builder type so calls can be chained further (`.select()`, etc.) by
 * the executor after this function returns. Kept structural (not
 * `PostgrestFilterBuilder<...>` directly) so the same translator works
 * across the `select()`/`update()`/`delete()` builder return types
 * without fighting their differing generic parameters — verified by a
 * real `tsc` probe that `select()`/`update()`/`delete()` builders all
 * satisfy this shape identically for `.eq()`.
 */
export interface FilterableQuery<Self> {
  eq(column: string, value: unknown): Self;
}

/**
 * Translates one validated `update`/`delete` filter into the matching
 * PostgREST query-builder call through an explicit, allowlisted
 * switch — never `query[filter.operator](...)` (dynamic method lookup)
 * and never a raw PostgREST filter string. The switch is exhaustive over
 * the shared validation package's actual `updateFilterOperators` closed
 * set, which today contains only `'eq'`; a legacy/impossible operator
 * value that somehow reaches this function throws
 * `UnsupportedPersistedFilterOperatorError` rather than silently falling
 * back to `eq` or invoking an arbitrary method name.
 *
 * The value passed to `.eq()` is exactly `filter.value` as validated by
 * the shared schema (a `JsonValue`) — never stringified, never
 * re-encoded, and never logged.
 */
export function applyPostgrestFilter<Query extends FilterableQuery<Query>>(
  query: Query,
  filter: ValidatedFilter,
  stepIdentity: {
    stepId: string;
    stepKey: string;
    stepType: WorkflowStepType;
  },
): Query {
  switch (filter.operator) {
    case 'eq':
      return query.eq(filter.column, filter.value);
    default:
      // Exhaustiveness: if `updateFilterOperators` ever grows a new
      // member, `filter.operator` stops being typed `never` here and
      // this line fails to compile until a new `case` is added above.
      return assertNeverFilterOperator(filter.operator, stepIdentity);
  }
}

function assertNeverFilterOperator(
  _operator: never,
  stepIdentity: {
    stepId: string;
    stepKey: string;
    stepType: WorkflowStepType;
  },
): never {
  throw new UnsupportedPersistedFilterOperatorError(stepIdentity);
}
