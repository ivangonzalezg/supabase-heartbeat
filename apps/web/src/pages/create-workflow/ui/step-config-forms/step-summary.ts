import type { WorkflowStepCreateInput } from "@supabase-heartbeat/validation"
import { stringifyJsonValue } from "./json-value-rows"

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
