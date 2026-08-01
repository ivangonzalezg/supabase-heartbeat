import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { workflowStepTypes } from '@supabase-heartbeat/validation';
import { IsWorkflowStepInput } from '../validation/workflow-step.validator';
import {
  DeleteStepConfigurationDto,
  InsertStepConfigurationDto,
  InvokeFunctionStepConfigurationDto,
  ReadStepConfigurationDto,
  SigninStepConfigurationDto,
  SignoutStepConfigurationDto,
  UpdateStepConfigurationDto,
  WaitStepConfigurationDto,
} from './step-configurations';

/**
 * Maps each step `type` to the OpenAPI schema documenting its
 * `configuration` shape. Used to build the `configuration` property's
 * `oneOf` below and kept in one place so every DTO/response that needs
 * to reference "the configuration model for this type" stays in sync.
 */
export const STEP_CONFIGURATION_SCHEMAS_BY_TYPE = {
  signin: SigninStepConfigurationDto,
  signout: SignoutStepConfigurationDto,
  wait: WaitStepConfigurationDto,
  insert: InsertStepConfigurationDto,
  read: ReadStepConfigurationDto,
  update: UpdateStepConfigurationDto,
  delete: DeleteStepConfigurationDto,
  invoke_function: InvokeFunctionStepConfigurationDto,
} as const satisfies Record<(typeof workflowStepTypes)[number], unknown>;

const STEP_CONFIGURATION_MODELS = Object.values(
  STEP_CONFIGURATION_SCHEMAS_BY_TYPE,
);

/**
 * A human-readable `type` → configuration-model mapping, included in the
 * `configuration` property's description as a fallback for API
 * consumers whose tooling does not render `oneOf` particularly well —
 * `@nestjs/swagger` (this project's current version) cannot express a
 * single discriminated schema across an entire flat DTO class the way a
 * true `oneOf [{ properties: { type: const, configuration: $ref } }, ...]`
 * at the object level would, so `configuration`'s own schema is a
 * `oneOf` of every possible shape, and this text spells out which one
 * applies for which `type`.
 */
const STEP_TYPE_CONFIGURATION_TABLE = Object.entries(
  STEP_CONFIGURATION_SCHEMAS_BY_TYPE,
)
  .map(([type, dto]) => `\`${type}\` → \`${dto.name}\``)
  .join(', ');

/**
 * The raw create-step input, as received over HTTP: `stepKey`, `type`,
 * `configuration`, and optional `enabled`. `id`, `workflowId`, `position`,
 * `createdAt`, and `updatedAt` are never accepted here — `position` is
 * always server-assigned (see `WorkflowStepsService`).
 *
 * Each property below carries a minimal `class-validator` decorator so
 * the global `ValidationPipe`'s `whitelist: true` does not strip it
 * before validation runs (a property with no decorator at all is
 * treated as unrecognized). The actual combined `type`/`configuration`
 * validation — the shape that makes an invalid pairing (e.g.
 * `{ type: 'wait', configuration: { table: '...' } }`) structurally
 * rejected — is `@IsWorkflowStepInput()`, using the shared
 * `@supabase-heartbeat/validation` schema (the same schema a future
 * frontend will use). The `*StepConfigurationDto` classes referenced
 * below are documentation-only adapters (see
 * `SigninStepConfigurationDto`'s own comment) — they never participate
 * in runtime validation; the shared Zod schema remains the sole runtime
 * source of truth.
 */
@ApiExtraModels(...STEP_CONFIGURATION_MODELS)
export class CreateWorkflowStepDto {
  @ApiProperty({
    description:
      'Stable, machine-friendly identifier for this step within the ' +
      'workflow. Must be snake_case: start with a lowercase letter, ' +
      'contain only lowercase letters, digits, and single underscores ' +
      'between words — no hyphens, no leading digit, no leading or ' +
      'trailing underscore, no consecutive underscores (e.g. ' +
      '`create_record`, not `Create-Record`). Unique within the ' +
      'workflow. Used by this same-workflow step-output reference ' +
      'syntax: `${steps.<step_key>.output.<path>}` — see ' +
      '`configuration` on `insert`/`update`/`delete`/`invoke_function` ' +
      'for examples. A step may only reference an earlier, enabled step ' +
      'by this key; renaming, disabling, or deleting a step that ' +
      'another enabled step references is rejected.',
    example: 'create_record',
  })
  @IsString()
  stepKey!: string;

  @ApiProperty({
    description: 'The step executor type.',
    enum: workflowStepTypes,
    example: 'signin',
  })
  @IsIn(workflowStepTypes)
  @IsWorkflowStepInput()
  type!: (typeof workflowStepTypes)[number];

  @ApiProperty({
    description:
      'The step configuration. Its required shape depends on `type` — ' +
      'the selected shape below MUST correspond to `type`: ' +
      `${STEP_TYPE_CONFIGURATION_TABLE}. Submitting a shape that does ` +
      'not match `type` is rejected with 400 Bad Request. Any string ' +
      'field may instead be a step-output reference — see each ' +
      'configuration model for details and examples.',
    oneOf: STEP_CONFIGURATION_MODELS.map((model) => ({
      $ref: getSchemaPath(model),
    })),
  })
  @IsObject()
  configuration!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Whether the step is enabled. Defaults to true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
