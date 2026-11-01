/**
 * Input: 退税材料准备的阻塞文案数组（后端按字符串返回，无类型码）
 * Output: 按类型分组、带计数、长条目可展开的阻塞清单
 * Pos: 退税工作台与出口详情材料准备弹窗共用；所有原文均可通过展开到达
 */
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

const ENTRY_PREVIEW_CHARS = 60;
const GROUP_PREVIEW_ENTRIES = 5;

// 顺序即优先级：先报关（「报关金额与商业发票金额有差异」归报关），再发票，再出货/装箱。
const GROUP_RULES: ReadonlyArray<{ label: string; test: RegExp }> = [
  { label: "报关单", test: /报关|放行/ },
  { label: "发票核验", test: /发票|票号|票种|税号|进项/ },
  { label: "出货与装箱", test: /出货|发运|装箱|采购来源/ },
];
const OTHER_LABEL = "其他";

export interface BlockerGroup {
  label: string;
  entries: string[];
}

/** 把「A；B」这类后端拼接文案拆开、去重，再按类型归组；空组不返回。 */
export function groupBlockers(blockers: readonly string[]): BlockerGroup[] {
  const entries = [
    ...new Set(
      blockers
        .flatMap((text) => text.split("；"))
        .map((text) => text.trim())
        .filter(Boolean),
    ),
  ];
  const groups = [...GROUP_RULES.map((rule) => rule.label), OTHER_LABEL].map(
    (label) => ({ label, entries: [] as string[] }),
  );
  for (const entry of entries) {
    const index = GROUP_RULES.findIndex((rule) => rule.test.test(entry));
    groups[index === -1 ? GROUP_RULES.length : index].entries.push(entry);
  }
  return groups.filter((group) => group.entries.length > 0);
}

function Entry({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > ENTRY_PREVIEW_CHARS;
  return (
    <li className="break-words">
      {long && !open ? `${text.slice(0, ENTRY_PREVIEW_CHARS)}…` : text}
      {long && (
        <button
          type="button"
          className="ml-1 text-primary underline-offset-2 hover:underline"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "收起" : "展开"}
        </button>
      )}
    </li>
  );
}

function Group({ group }: { group: BlockerGroup }) {
  const [all, setAll] = useState(false);
  const hidden = group.entries.length - GROUP_PREVIEW_ENTRIES;
  const shown =
    all || hidden <= 0
      ? group.entries
      : group.entries.slice(0, GROUP_PREVIEW_ENTRIES);
  return (
    <div className="space-y-1" data-testid="blocker-group">
      <div className="flex items-center gap-2 font-medium">
        {group.label}
        <Badge variant="outline">{group.entries.length}</Badge>
      </div>
      <ul className="list-disc space-y-0.5 pl-4">
        {shown.map((text) => (
          <Entry key={text} text={text} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="text-primary underline-offset-2 hover:underline"
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? "收起" : `显示其余 ${hidden} 项`}
        </button>
      )}
    </div>
  );
}

export function BlockerGroups({
  blockers,
  className,
}: {
  blockers: readonly string[];
  className?: string;
}) {
  const groups = groupBlockers(blockers);
  return (
    <div className={className ?? "space-y-2 text-sm"}>
      {groups.map((group) => (
        <Group key={group.label} group={group} />
      ))}
    </div>
  );
}
