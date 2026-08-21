import { Controller, useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@/shared/ui"
import { FilterFields } from "./filter-fields"

export function DeleteStepFields({ index }: { index: number }) {
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
              placeholder="posts"
              className="font-mono"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                The Supabase table this step deletes rows from.
              </FieldDescription>
            )}
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
