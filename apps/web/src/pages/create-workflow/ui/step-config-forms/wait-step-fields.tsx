import { Controller, useFormContext } from "react-hook-form"
import { WAIT_SECONDS_MAX } from "@supabase-heartbeat/validation"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@/shared/ui"

export function WaitStepFields({ index }: { index: number }) {
  const { control } = useFormContext()

  return (
    <Controller
      name={`steps.${index}.configuration.seconds`}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className="md:max-w-60">
          <FieldLabel htmlFor={`step-${index}-seconds`}>Seconds</FieldLabel>
          <Input
            id={`step-${index}-seconds`}
            type="number"
            min={1}
            max={WAIT_SECONDS_MAX}
            placeholder="30"
            value={field.value ?? ""}
            onChange={(event) =>
              field.onChange(
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid}
          />
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : (
            <FieldDescription>
              How long to pause (1-{WAIT_SECONDS_MAX} seconds).
            </FieldDescription>
          )}
        </Field>
      )}
    />
  )
}
