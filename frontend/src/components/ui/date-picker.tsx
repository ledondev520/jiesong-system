"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date?: Date
  setDate: (date: Date | undefined) => void
  className?: string
  placeholder?: string
  triggerProps?: Omit<React.ComponentProps<typeof Button>, "children" | "variant" | "className">
}

export function DatePicker({
  date,
  setDate,
  className,
  placeholder = "选择日期",
  triggerProps,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full min-w-0 max-w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
          {...triggerProps}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="min-w-0 whitespace-normal">{date ? format(date, "yyyy-MM-dd") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
