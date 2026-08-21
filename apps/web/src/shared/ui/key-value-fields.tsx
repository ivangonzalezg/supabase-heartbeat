import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

export interface KeyValueRow {
  key: string
  value: string
}

interface KeyValueFieldsProps {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

function KeyValueFields({
  rows: initialRows,
  onChange,
  keyPlaceholder = "column",
  valuePlaceholder = "value",
}: KeyValueFieldsProps) {
  const [rows, setRows] = React.useState(initialRows)

  function updateRow(index: number, patch: Partial<KeyValueRow>) {
    const nextRows = rows.map((row, i) =>
      i === index ? { ...row, ...patch } : row
    )
    setRows(nextRows)
    onChange(nextRows)
  }

  function removeRow(index: number) {
    const nextRows = rows.filter((_, i) => i !== index)
    setRows(nextRows)
    onChange(nextRows)
  }

  function addRow() {
    setRows([...rows, { key: "", value: "" }])
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Key ${index + 1}`}
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(event) => updateRow(index, { key: event.target.value })}
          />
          <Input
            aria-label={`Value ${index + 1}`}
            placeholder={valuePlaceholder}
            value={row.value}
            onChange={(event) =>
              updateRow(index, { value: event.target.value })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove row ${index + 1}`}
            onClick={() => removeRow(index)}
            className="text-destructive hover:text-destructive"
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addRow}
        className="w-fit text-primary hover:text-primary"
      >
        <PlusIcon />
        Add value
      </Button>
    </div>
  )
}

export { KeyValueFields }
