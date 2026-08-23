import type { WorkflowStepCreateInput } from "@supabase-heartbeat/validation"

export function stringifyJsonValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

function formatKeyValuePairs(
  values: Record<string, unknown> | undefined
): string[] {
  return Object.entries(values ?? {}).map(
    ([key, value]) => `${key} = ${stringifyJsonValue(value)}`
  )
}

export function summarizeStep(step: WorkflowStepCreateInput): string {
  const { type, configuration } = step

  switch (type) {
    case "signin":
      return configuration.email ? configuration.email : ""
    case "signout":
      return ""
    case "wait":
      return configuration.seconds ? `${configuration.seconds} seconds` : ""
    case "insert": {
      const parts: string[] = []
      if (configuration.table) parts.push(`Table ${configuration.table}`)
      const count = Object.keys(configuration.values ?? {}).length
      if (count > 0) parts.push(`${count} value(s)`)
      return parts.join(" · ")
    }
    case "read": {
      const parts: string[] = []
      if (configuration.table) parts.push(`Table ${configuration.table}`)
      if (configuration.columns && configuration.columns !== "*")
        parts.push(`Columns ${configuration.columns}`)
      if (configuration.limit) parts.push(`Limit ${configuration.limit}`)
      return parts.join(" · ")
    }
    case "update": {
      const parts: string[] = []
      if (configuration.table) parts.push(`Table ${configuration.table}`)
      const count = Object.keys(configuration.values ?? {}).length
      if (count > 0) parts.push(`${count} value(s)`)
      if (configuration.filter?.column) {
        parts.push(
          `Filter ${configuration.filter.column} = ${stringifyJsonValue(configuration.filter.value)}`
        )
      }
      return parts.join(" · ")
    }
    case "delete": {
      const parts: string[] = []
      if (configuration.table) parts.push(`Table ${configuration.table}`)
      if (configuration.filter?.column) {
        parts.push(
          `Filter ${configuration.filter.column} = ${stringifyJsonValue(configuration.filter.value)}`
        )
      }
      return parts.join(" · ")
    }
    case "invoke_function":
      return configuration.functionName ? configuration.functionName : ""
    default:
      return ""
  }
}

export interface StepSummaryField {
  label: string
  value: string | string[]
}

/**
 * Same underlying step data as `summarizeStep`, but returned as
 * label/value pairs instead of a single joined string, for read-only
 * detail views that render each field on its own row (label in a
 * distinct style from its value) rather than a single scannable line.
 */
export function summarizeStepFields(
  step: WorkflowStepCreateInput
): StepSummaryField[] {
  const { type, configuration } = step
  const fields: StepSummaryField[] = []

  switch (type) {
    case "signin":
      if (configuration.email) {
        fields.push({ label: "Email", value: configuration.email })
      }
      return fields
    case "signout":
      return fields
    case "wait":
      if (configuration.seconds) {
        fields.push({
          label: "Duration",
          value: `${configuration.seconds} seconds`,
        })
      }
      return fields
    case "insert": {
      if (configuration.table) {
        fields.push({ label: "Table", value: configuration.table })
      }
      if (Object.keys(configuration.values ?? {}).length > 0) {
        fields.push({
          label: "Values",
          value: formatKeyValuePairs(configuration.values),
        })
      }
      return fields
    }
    case "read": {
      if (configuration.table) {
        fields.push({ label: "Table", value: configuration.table })
      }
      if (configuration.columns) {
        fields.push({ label: "Columns", value: configuration.columns })
      }
      if (configuration.limit) {
        fields.push({ label: "Limit", value: `${configuration.limit}` })
      }
      return fields
    }
    case "update": {
      if (configuration.table) {
        fields.push({ label: "Table", value: configuration.table })
      }
      if (Object.keys(configuration.values ?? {}).length > 0) {
        fields.push({
          label: "Values",
          value: formatKeyValuePairs(configuration.values),
        })
      }
      if (configuration.filter?.column) {
        fields.push({
          label: "Filter",
          value: `${configuration.filter.column} = ${stringifyJsonValue(configuration.filter.value)}`,
        })
      }
      return fields
    }
    case "delete": {
      if (configuration.table) {
        fields.push({ label: "Table", value: configuration.table })
      }
      if (configuration.filter?.column) {
        fields.push({
          label: "Filter",
          value: `${configuration.filter.column} = ${stringifyJsonValue(configuration.filter.value)}`,
        })
      }
      return fields
    }
    case "invoke_function": {
      if (configuration.functionName) {
        fields.push({ label: "Function", value: configuration.functionName })
      }
      if (
        configuration.body &&
        typeof configuration.body === "object" &&
        !Array.isArray(configuration.body) &&
        Object.keys(configuration.body).length > 0
      ) {
        fields.push({
          label: "Body",
          value: formatKeyValuePairs(
            configuration.body as Record<string, unknown>
          ),
        })
      }
      return fields
    }
    default:
      return fields
  }
}
