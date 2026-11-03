import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("globals.css legacy utilities (B51 G3)", () => {
  it.each([
    ".kpi-card",
    ".card-premium",
    ".metric-card",
    ".surface-mesh",
    ".stagger-children",
    "--shadow-glow",
  ])("%s 已移除", (name) => {
    expect(css).not.toContain(name);
  });

  it(".surface-panel 保留为静态边框，没有 :hover 或阴影", () => {
    expect(css).toContain(".surface-panel {");
    expect(css).not.toContain(".surface-panel:hover");
    const block = css.slice(
      css.indexOf(".surface-panel {"),
      css.indexOf("}", css.indexOf(".surface-panel {")),
    );
    expect(block).not.toMatch(/shadow|2xl/);
  });
});
