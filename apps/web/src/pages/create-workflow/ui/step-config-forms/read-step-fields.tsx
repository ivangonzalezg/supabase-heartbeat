import { Controller, useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@/shared/ui"

export function ReadStepFields({ index }: { index: number }) {
  const { control } = useFormContext()

  return (
    <div className="flex flex-col gap-4 md:flex-row md:*:flex-1">
      <Controller
        name={`steps.${index}.configuration.table`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-table`}>Table</FieldLabel>
            <Input
              {...field}
              id={`step-${index}-table`}
              placeholder="posts"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                The Supabase table this step reads from.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.columns`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-columns`}>Columns</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              onChange={(event) =>
                field.onChange(
                  event.target.value === "" ? undefined : event.target.value
                )
              }
              id={`step-${index}-columns`}
              placeholder="id, title, created_at or * for all"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                Comma-separated column names, or leave blank for all columns.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.limit`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-limit`}>Limit</FieldLabel>
            <Input
              id={`step-${index}-limit`}
              type="number"
              min={1}
              max={1000}
              value={field.value ?? ""}
              onChange={(event) =>
                field.onChange(
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value)
                )
              }
              onBlur={field.onBlur}
              aria-invalid={fieldState.invalid}
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
