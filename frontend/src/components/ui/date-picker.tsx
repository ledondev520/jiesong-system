"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  date?: Date;
  setDate: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
  triggerProps?: Omit<
    React.ComponentProps<typeof Button>,
    "children" | "variant" | "className"
  >;
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
            className,
          )}
          {...triggerProps}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="min-w-0 whitespace-normal">
            {date ? format(date, "yyyy-MM-dd") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={setDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// 表单/筛选状态里的日期多为 "yyyy-MM-dd" 字符串；原生 <input type="date"> 的占位符
// 跟浏览器语言走（英文环境显示 mm/dd/yyyy），中文界面改用本组件。
const parseLocalDate = (value: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  // 用本地时区构造，避免 new Date("yyyy-MM-dd") 按 UTC 解析导致日期前移一天。
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
};

interface DateStringPickerProps extends Omit<
  DatePickerProps,
  "date" | "setDate"
> {
  value: string;
  onChange: (value: string) => void;
}

export function DateStringPicker({
  value,
  onChange,
  ...rest
}: DateStringPickerProps) {
  return (
    <DatePicker
      {...rest}
      date={parseLocalDate(value)}
      setDate={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
    />
  );
}
