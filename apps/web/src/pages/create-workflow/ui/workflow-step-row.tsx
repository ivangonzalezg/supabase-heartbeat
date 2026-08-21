import { Controller, useFormContext, useWatch, get } from "react-hook-form"
import type {
  WorkflowStepCreateInput,
  WorkflowStepType,
} from "@supabase-heartbeat/validation"
import { useSortable } from "@dnd-kit/react/sortable"
import { GripVerticalIcon, XIcon } from "lucide-react"
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/shared/ui"
import {
  DeleteStepFields,
  InsertStepFields,
  InvokeFunctionStepFields,
  ReadStepFields,
  SigninStepFields,
  UpdateStepFields,
  WaitStepFields,
  defaultStepFor,
  summarizeStep,
} from "./step-config-forms"

const typeLabels: Record<WorkflowStepCreateInput["type"], string> = {
  signin: "Sign in",
  signout: "Sign out",
  wait: "Wait",
  insert: "Insert",
  read: "Read",
  update: "Update",
  delete: "Delete",
  invoke_function: "Invoke function",
}

const typeOptions: { value: WorkflowStepType; label: string }[] = [
  { value: "wait", label: "Wait" },
  { value: "signin", label: "Sign in" },
  { value: "signout", label: "Sign out" },
  { value: "insert", label: "Insert" },
  { value: "read", label: "Read" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "invoke_function", label: "Invoke function" },
]

function StepConfigFields({ index, type }: { index: number; type: string }) {
  switch (type) {
    case "signin":
      return <SigninStepFields index={index} />
    case "signout":
      return null
    case "wait":
      return <WaitStepFields index={index} />
    case "insert":
      return <InsertStepFields index={index} />
    case "read":
      return <ReadStepFields index={index} />
    case "update":
      return <UpdateStepFields index={index} />
    case "delete":
      return <DeleteStepFields index={index} />
    case "invoke_function":
      return <InvokeFunctionStepFields index={index} />
    default:
      return null
  }
}

interface WorkflowStepRowProps {
  id: string
  index: number
  onRemove: () => void
}

export function WorkflowStepRow({ id, index, onRemove }: WorkflowStepRowProps) {
  const { control, setValue, formState } = useFormContext()
  const step = useWatch({ control, name: `steps.${index}` }) as
    WorkflowStepCreateInput | undefined
  const { ref, handleRef, isDragging } = useSortable({ id, index })

  if (!step) return null

  const hasValidType = Boolean(step.type)
  const typeError = get(formState.errors, `steps.${index}.type`) as
    { message?: string } | undefined

  function handleTypeChange(newType: WorkflowStepType) {
    setValue(`steps.${index}`, defaultStepFor(newType, step?.stepKey ?? ""), {
      shouldDirty: true,
    })
    setValue(`steps.${index}.type`, newType, { shouldValidate: true })
  }

  return (
    <AccordionItem
      ref={ref}
      value={String(index)}
      className="group/step rounded-lg border bg-card p-4"
      style={isDragging ? { opacity: 0.5 } : undefined}
    >
      <div className="flex items-start gap-2">
        <Button
          ref={handleRef}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Reorder step ${index + 1}`}
          className="cursor-grab text-muted-foreground hover:bg-transparent hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-3.5" />
        </Button>

        <div className="w-full">
          <AccordionTrigger
            aria-label={`Step ${index + 1}`}
            className="p-0 px-1 hover:no-underline"
          >
            <div className="flex min-h-9 flex-1 items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-mono text-[8px] leading-2 font-bold text-primary">
                  {index + 1}
                </div>
                <p className="font-mono text-xs font-bold text-foreground">
                  {step.stepKey || `step_${index + 1}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 transition-opacity duration-200 group-data-open/step:pointer-events-none group-data-open/step:opacity-0">
                {!!hasValidType && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {typeLabels[step.type]}
                  </span>
                )}
                {!!summarizeStep(step) && (
                  <p className="truncate text-[10px] text-muted-foreground">
                    {summarizeStep(step)}
                  </p>
                )}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4 px-1 pt-3">
              <div className="flex flex-col gap-4 md:flex-row md:*:flex-1">
                <Field
                  data-invalid={Boolean(typeError)}
                  className="md:max-w-60"
                >
                  <FieldLabel htmlFor={`step-${index}-type`}>
                    Step type
                  </FieldLabel>
                  <Select
                    value={step.type || undefined}
                    onValueChange={handleTypeChange}
                  >
                    <SelectTrigger
                      id={`step-${index}-type`}
                      aria-label={`Step ${index + 1} type`}
                      aria-invalid={Boolean(typeError)}
                      className="h-10! w-full"
                    >
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {typeError?.message ? (
                    <FieldError errors={[{ message: typeError.message }]} />
                  ) : (
                    <FieldDescription>
                      Changing the type resets this step&apos;s configuration.
                    </FieldDescription>
                  )}
                </Field>
                <Controller
                  name={`steps.${index}.stepKey`}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field
                      data-invalid={fieldState.invalid}
                      className="md:max-w-60"
                    >
                      <FieldLabel htmlFor={`step-${index}-key`}>
                        Step key
                      </FieldLabel>
                      <Input
                        {...field}
                        id={`step-${index}-key`}
                        placeholder="update_activity"
                        className="font-mono"
                        aria-invalid={fieldState.invalid}
                        autoComplete="off"
                      />
                      {fieldState.invalid ? (
                        <FieldError errors={[fieldState.error]} />
                      ) : (
                        <FieldDescription>
                          A unique snake_case identifier for this step.
                        </FieldDescription>
                      )}
                    </Field>
                  )}
                />
              </div>

              <StepConfigFields index={index} type={step.type} />

              <Controller
                name={`steps.${index}.enabled`}
                control={control}
                render={({ field }) => (
                  <Field
                    orientation="horizontal"
                    onClick={() => field.onChange(!field.value)}
                    className="cursor-pointer"
                  >
                    <Switch
                      id={`step-${index}-enabled`}
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <FieldContent>
                      <FieldLabel
                        htmlFor={`step-${index}-enabled`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        Enabled
                      </FieldLabel>
                    </FieldContent>
                  </Field>
                )}
              />
            </div>
          </AccordionContent>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove step ${index + 1}`}
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
        >
          <XIcon />
        </Button>
      </div>
    </AccordionItem>
  )
}
