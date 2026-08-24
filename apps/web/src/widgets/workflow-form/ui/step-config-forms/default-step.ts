import type {
  WorkflowStepCreateInput,
  WorkflowStepType,
} from "@supabase-heartbeat/validation"

export function defaultStepFor(
  type: WorkflowStepType,
  stepKey: string
): WorkflowStepCreateInput {
  switch (type) {
    case "signin":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: { email: "", password: "" },
      }
    case "signout":
      return { stepKey, type, enabled: true, configuration: {} }
    case "wait":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: { seconds: "" as unknown as number },
      }
    case "insert":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: { table: "", values: {} },
      }
    case "read":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: { table: "", columns: "" },
      }
    case "update":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: {
          table: "",
          values: {},
          filter: { column: "", operator: "eq", value: "" },
        },
      }
    case "delete":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: {
          table: "",
          filter: { column: "", operator: "eq", value: "" },
        },
      }
    case "invoke_function":
      return {
        stepKey,
        type,
        enabled: true,
        configuration: { functionName: "" },
      }
  }
}

/**
 * A step with no type chosen yet. `type: ""` does not match any branch of
 * the `workflowStepCreateSchema` discriminated union by design — the form
 * schema surfaces this as a "Select a step type." validation error on
 * submit, forcing the user to pick a type before the workflow can be
 * created.
 */
export function emptyStepFor(stepKey: string): WorkflowStepCreateInput {
  return {
    stepKey,
    type: "",
    enabled: true,
    configuration: {},
  } as unknown as WorkflowStepCreateInput
}
