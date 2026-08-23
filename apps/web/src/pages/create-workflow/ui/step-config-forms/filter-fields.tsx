import { Controller, useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui"
import { stringifyJsonValue } from "@/entities/workflow"
import { parseJsonValue } from "./json-value-rows"

export function FilterFields({ index }: { index: number }) {
  const { control } = useFormContext()

  return (
    <div className="flex flex-col gap-4 md:flex-row md:*:flex-1">
      <Controller
        name={`steps.${index}.configuration.filter.column`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-filter-column`}>
              Filter column
            </FieldLabel>
            <Input
              {...field}
              id={`step-${index}-filter-column`}
              placeholder="id"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                The column used to match rows.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.filter.operator`}
        control={control}
        defaultValue="eq"
        render={({ field }) => (
          <Field>
            <FieldLabel htmlFor={`step-${index}-filter-operator`}>
              Operator
            </FieldLabel>
            <Select value={field.value ?? "eq"} disabled>
              <SelectTrigger
                id={`step-${index}-filter-operator`}
                className="h-10! w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eq">equals</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Only &quot;equals&quot; is supported today.
            </FieldDescription>
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.filter.value`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-filter-value`}>
              Filter value
            </FieldLabel>
            <Input
              {...field}
              value={
                field.value === undefined ? "" : stringifyJsonValue(field.value)
              }
              onChange={(event) =>
                field.onChange(parseJsonValue(event.target.value))
              }
              id={`step-${index}-filter-value`}
              placeholder="${steps.create_activity.output.id}"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                Supports referencing a prior step&apos;s output.
              </FieldDescription>
            )}
          </Field>
        )}
      />
    </div>
  )
}
