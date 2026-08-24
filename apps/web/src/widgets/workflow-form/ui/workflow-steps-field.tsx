import * as React from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react"
import { isSortableOperation } from "@dnd-kit/react/sortable"
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

export function WorkflowStepsField({
  initialExpanded = false,
}: {
  /** Whether every step's accordion starts expanded. See `WorkflowForm`'s
   * `initialStepsExpanded` prop for the rationale. */
  initialExpanded?: boolean
}) {
  const { control, formState } = useFormContext()
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "steps",
  })
  const [expandedIndexes, setExpandedIndexes] = React.useState<string[]>(() =>
    initialExpanded ? fields.map((_, index) => String(index)) : []
  )

  function handleAddStep() {
    const existingKeys = fields.map(
      (field) => (field as unknown as { stepKey: string }).stepKey
    )
    const newStep = emptyStepFor(generateStepKey(existingKeys))
    const newIndex = fields.length
    append(newStep)
    // Only the newly added step starts expanded — every other step
    // collapses, so the step the user is about to configure is the one
    // thing on screen, instead of piling up an ever-growing list of open
    // accordions.
    setExpandedIndexes([String(newIndex)])
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
    if (event.canceled) return
    if (!isSortableOperation(event.operation)) return

    // `@dnd-kit/react/sortable`'s `OptimisticSortingPlugin` already
    // live-reorders each sortable's `.index` as the drag moves over other
    // items, so by `dragend` the dragged item's `initialIndex` -> `index`
    // pair *is* the final from/to move — comparing `source`/`target` ids
    // instead (as this used to) is unreliable, since both can report the
    // same id once the optimistic reorder has already settled the
    // dragged item into its new slot.
    const { source } = event.operation
    if (source === null) return
    const fromIndex = source.initialIndex
    const toIndex = source.index
    if (fromIndex === toIndex) return

    move(fromIndex, toIndex)
  }

  const stepsError = formState.errors.steps
  const rootStepsError =
    stepsError && "root" in stepsError
      ? stepsError.root
      : Array.isArray(stepsError)
        ? undefined
        : stepsError

  // Any step with a validation error is force-expanded, even if its
  // accordion is currently collapsed — otherwise an invalid field inside
  // a collapsed step is invisible, and the form silently refuses to
  // submit with no visible feedback. Derived at render time (not a
  // `setState`-in-effect) since it's purely a function of existing state.
  const errorIndexes =
    formState.isSubmitted && Array.isArray(stepsError)
      ? stepsError
          .map((error, index) => (error ? String(index) : undefined))
          .filter((value): value is string => value !== undefined)
      : []
  const visibleExpandedIndexes =
    errorIndexes.length === 0
      ? expandedIndexes
      : Array.from(new Set([...expandedIndexes, ...errorIndexes]))

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
            value={visibleExpandedIndexes}
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
