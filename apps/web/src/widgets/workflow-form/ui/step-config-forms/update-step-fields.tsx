import { Controller, useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  KeyValueFields,
} from "@/shared/ui"
import { fromRows, toRows } from "./json-value-rows"
import { FilterFields } from "./filter-fields"

export function UpdateStepFields({ index }: { index: number }) {
  const { control } = useFormContext()

  return (
    <div className="flex flex-col gap-4">
      <Controller
        name={`steps.${index}.configuration.table`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="md:max-w-95">
            <FieldLabel htmlFor={`step-${index}-table`}>Table</FieldLabel>
            <Input
              {...field}
              id={`step-${index}-table`}
              placeholder="activity"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                The Supabase table this step updates.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.values`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Values</FieldLabel>
            <FieldDescription className="mb-1!">
              Column and value pairs for the new row.
            </FieldDescription>
            <KeyValueFields
              rows={toRows(field.value)}
              onChange={(rows) => field.onChange(fromRows(rows))}
              keyPlaceholder="column"
              valuePlaceholder="value"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />
      <div>
        <FieldLabel className="mb-2">Filter</FieldLabel>
        <FilterFields index={index} />
      </div>
    </div>
  )
}
