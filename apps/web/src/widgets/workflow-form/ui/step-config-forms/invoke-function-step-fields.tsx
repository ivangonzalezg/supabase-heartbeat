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

export function InvokeFunctionStepFields({ index }: { index: number }) {
  const { control } = useFormContext()

  return (
    <div className="flex flex-col gap-4">
      <Controller
        name={`steps.${index}.configuration.functionName`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="md:max-w-95">
            <FieldLabel htmlFor={`step-${index}-function-name`}>
              Function name
            </FieldLabel>
            <Input
              {...field}
              id={`step-${index}-function-name`}
              placeholder="send-digest"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                The Supabase Edge Function this step invokes.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.body`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel>Body</FieldLabel>
            <FieldDescription className="mb-1!">
              Optional JSON body sent to the function.
            </FieldDescription>
            <KeyValueFields
              rows={toRows(field.value)}
              onChange={(rows) => {
                const value = fromRows(rows)
                field.onChange(
                  Object.keys(value).length === 0 ? undefined : value
                )
              }}
              keyPlaceholder="key"
              valuePlaceholder="value"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />
    </div>
  )
}
