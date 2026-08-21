import * as React from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react"
import { PlusIcon } from "lucide-react"
import { Accordion, Button, FieldDescription, FieldError } from "@/shared/ui"
import { emptyStepFor } from "./step-config-forms"
import { WorkflowStepRow } from "./workflow-step-row"

function generateStepKey(existingKeys: string[]): string {
  let n = existingKeys.length + 1
  let key = `step_${n}`
  while (existingKeys.includes(key)) {
    n += 1
    key = `step_${n}`
  }
  return key
}

export function WorkflowStepsField() {
  const { control, formState } = useFormContext()
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "steps",
  })
  const [expandedIndexes, setExpandedIndexes] = React.useState<string[]>(() =>
    fields.map((_, index) => String(index))
  )

  function handleAddStep() {
    const existingKeys = fields.map(
      (field) => (field as unknown as { stepKey: string }).stepKey
    )
    const newStep = emptyStepFor(generateStepKey(existingKeys))
    const newIndex = fields.length
    append(newStep)
    setExpandedIndexes((prev) => [...prev, String(newIndex)])
  }

  function handleRemove(index: number) {
    remove(index)
    setExpandedIndexes((prev) =>
      prev
        .filter((value) => value !== String(index))
        .map((value) => {
          const numericValue = Number(value)
          return numericValue > index ? String(numericValue - 1) : value
        })
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    const sourceId = event.operation.source?.id
    const targetId = event.operation.target?.id
    if (sourceId === undefined || targetId === undefined) return

    const fromIndex = fields.findIndex((field) => field.id === sourceId)
    const toIndex = fields.findIndex((field) => field.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    move(fromIndex, toIndex)
  }

  const stepsError = formState.errors.steps
  const rootStepsError =
    stepsError && "root" in stepsError
      ? stepsError.root
      : Array.isArray(stepsError)
        ? undefined
        : stepsError

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground">
            WORKFLOW STEPS
          </p>
          <FieldDescription>The workflow runs steps in order.</FieldDescription>
        </div>
      </div>

      {!!fields.length && (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <Accordion
            type="multiple"
            value={expandedIndexes}
            onValueChange={setExpandedIndexes}
            className="flex flex-col gap-3"
          >
            {fields.map((field, index) => (
              <WorkflowStepRow
                key={field.id}
                id={field.id}
                index={index}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </Accordion>
        </DragDropProvider>
      )}

      {rootStepsError?.message ? (
        <FieldError errors={[{ message: rootStepsError.message as string }]} />
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="w-fit bg-card"
        onClick={handleAddStep}
      >
        <PlusIcon />
        Add step
      </Button>
    </div>
  )
}
