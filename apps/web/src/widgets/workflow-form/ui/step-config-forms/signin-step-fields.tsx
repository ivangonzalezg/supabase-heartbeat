import { Controller, useFormContext } from "react-hook-form"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "@/shared/ui"

export function SigninStepFields({ index }: { index: number }) {
  const { control } = useFormContext()

  return (
    <div className="flex flex-col gap-4 md:flex-row md:*:flex-1">
      <Controller
        name={`steps.${index}.configuration.email`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-email`}>Email</FieldLabel>
            <Input
              {...field}
              id={`step-${index}-email`}
              type="email"
              placeholder="bot@example.com"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                The Supabase account this step signs in as.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      <Controller
        name={`steps.${index}.configuration.password`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`step-${index}-password`}>Password</FieldLabel>
            <Input
              {...field}
              id={`step-${index}-password`}
              type="password"
              aria-invalid={fieldState.invalid}
              autoComplete="off"
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              <FieldDescription>
                Stored as entered; use a dedicated service account.
              </FieldDescription>
            )}
          </Field>
        )}
      />
    </div>
  )
}
