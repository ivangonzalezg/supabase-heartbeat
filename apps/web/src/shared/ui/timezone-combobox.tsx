import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"

const timezones: string[] = (
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : []
).sort()

interface TimezoneComboboxProps {
  id?: string
  value: string
  onChange: (value: string) => void
  "aria-invalid"?: boolean
}

function TimezoneCombobox({
  id,
  value,
  onChange,
  ...props
}: TimezoneComboboxProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={props["aria-invalid"]}
          className="w-full justify-between border-input bg-transparent font-normal hover:bg-transparent dark:bg-input/30 dark:hover:bg-input/30"
        >
          <span className="truncate">{value || "Select timezone"}</span>
          <ChevronDownIcon className="shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {timezones.map((timezone) => (
                <CommandItem
                  key={timezone}
                  value={timezone}
                  onSelect={(selected) => {
                    onChange(selected)
                    setOpen(false)
                  }}
                >
                  <span className="truncate">{timezone}</span>
                  <CheckIcon
                    className={cn(
                      "ml-auto",
                      value === timezone ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { TimezoneCombobox }
