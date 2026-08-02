import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import * as z from "zod"
import { authClient } from "@/entities/session"
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Spinner,
} from "@/shared/ui"

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
})

type SignInValues = z.infer<typeof signInSchema>

export function SignInForm() {
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false)
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (values: SignInValues) => {
    const { error: signInError } = await authClient.signIn.email(values)

    if (signInError) {
      toast.error("Invalid credentials", {
        description: signInError.message ?? "Check your email and password.",
      })
    }
  }

  return (
    <form
      onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
      className="w-full max-w-sm"
    >
      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
              <Input
                {...field}
                id="sign-in-email"
                type="text"
                inputMode="email"
                aria-invalid={fieldState.invalid}
                autoComplete="email"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
              <div className="relative">
                <Input
                  {...field}
                  id="sign-in-password"
                  type={isPasswordVisible ? "text" : "password"}
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    isPasswordVisible ? "Hide password" : "Show password"
                  }
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                  className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground active:not-aria-[haspopup]:-translate-y-1/2 dark:hover:bg-transparent"
                >
                  {isPasswordVisible ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="mt-5"
        >
          {form.formState.isSubmitting ? (
            <>
              <Spinner />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </FieldGroup>
    </form>
  )
}
