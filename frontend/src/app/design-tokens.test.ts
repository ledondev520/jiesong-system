/**
 * Input: globals.css 的 :root/.dark 令牌、layout.tsx themeColor、public/manifest.json
 * Output: Ink & Seal（方向 D）令牌的回归测试：精确取值、无旧青绿色相、body 无光晕/网格、认证卡无毛玻璃、
 *         状态色令牌未动、品牌金/标记红不进入 /dashboard，以及关键文字配对的 WCAG 对比度
 * Pos: 重设计 Phase 1a（B26）令牌替换的守护测试；改令牌值时同步改这里
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP = __dirname;
const css = fs.readFileSync(path.join(APP, "globals.css"), "utf8");
const layout = fs.readFileSync(path.join(APP, "layout.tsx"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(APP, "../../public/manifest.json"), "utf8"),
);

/** 取 `selector { ... }` 的块体（令牌块没有嵌套花括号）。 */
const block = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
};
const token = (body: string, name: string): string => {
  const match = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  expect(match, name).not.toBeNull();
  return match![1].trim();
};

const light = block("  :root");
const dark = block("  .dark");

describe("Ink & Seal tokens (light)", () => {
  it.each([
    ["--background", "oklch(0.972 0.006 80)"],
    ["--card", "oklch(0.995 0.004 85)"],
    ["--foreground", "oklch(0.23 0.004 60)"],
    ["--primary", "oklch(0.38 0.12 15)"],
    ["--primary-foreground", "oklch(0.99 0.005 85)"],
    ["--accent", "oklch(0.935 0.008 75)"],
    ["--border", "oklch(0.89 0.008 75)"],
    ["--ring", "oklch(0.42 0.02 60)"],
    ["--sidebar", "oklch(0.955 0.008 78)"],
    ["--sidebar-primary", "oklch(0.38 0.12 15)"],
    ["--destructive", "oklch(0.55 0.21 27)"],
  ])("%s = %s", (name, value) => {
    expect(token(light, name)).toBe(value);
  });

  it("keeps the focus ring neutral (never red, so it cannot be read as an invalid field)", () => {
    expect(token(light, "--ring")).not.toBe(token(light, "--primary"));
    expect(token(dark, "--ring")).not.toBe(token(dark, "--primary"));
  });
});

describe("Ink & Seal tokens (dark)", () => {
  it.each([
    ["--background", "oklch(0.18 0.006 60)"],
    ["--card", "oklch(0.215 0.007 60)"],
    ["--primary", "oklch(0.74 0.09 355)"],
    ["--ring", "oklch(0.78 0.02 70)"],
    ["--sidebar", "oklch(0.155 0.006 60)"],
    ["--sidebar-primary", "oklch(0.8 0.08 355)"],
  ])("%s = %s", (name, value) => {
    expect(token(dark, name)).toBe(value);
  });
});

describe("old green-teal identity is gone", () => {
  it("has no hue-165 colour left in globals.css", () => {
    expect(css).not.toMatch(/oklch\([^)]*\s165\)/);
    expect(css).not.toMatch(/\b165\b/);
  });

  it("body is a solid canvas: no radial glows, no grid, no dark override", () => {
    const body = css.slice(css.indexOf("  body {"), css.indexOf("  h1,"));
    expect(body).toContain("bg-background");
    expect(body).not.toMatch(/background-image|gradient|grid/);
    expect(css).not.toContain(".dark body");
  });

  it("auth shell and card have no glass, glow or primary tint", () => {
    const auth = css.slice(
      css.indexOf(".auth-shell {"),
      css.indexOf(".text-brand-emphasis {"),
    );
    expect(auth).not.toMatch(
      /backdrop-filter|blur\(|radial-gradient|linear-gradient|color-mix|::before/,
    );
    expect(auth).toContain("bg-card");
  });

  it("themeColor and manifest follow the paper/oxblood palette", () => {
    expect(layout).toContain('color: "#f8f5f1"');
    expect(layout).toContain('color: "#14110f"');
    expect(layout).not.toMatch(/#f7faf7|#1a2b1a/);
    expect(manifest.background_color).toBe("#f8f5f1");
    expect(manifest.theme_color).toBe("#751e2d");
  });
});

describe("unchanged by this phase", () => {
  it("status badge colours are exactly the pre-redesign values", () => {
    expect(token(light, "--status-red")).toBe("oklch(0.5 0.2 27)");
    expect(token(light, "--status-green")).toBe("oklch(0.42 0.1 155)");
    expect(token(light, "--status-amber")).toBe("oklch(0.45 0.1 70)");
    expect(token(light, "--status-blue")).toBe("oklch(0.45 0.15 255)");
    expect(token(dark, "--status-red")).toBe("oklch(0.8 0.13 25)");
    expect(token(light, "--radius")).toBe("0.375rem");
  });
});

describe("brand colours are for public pages only", () => {
  it("defines the four brand tokens and maps them in @theme", () => {
    for (const name of ["mark", "ink", "gold", "gold-text"]) {
      expect(css).toContain(`--brand-${name}:`);
      expect(css).toContain(`--color-brand-${name}: var(--brand-${name})`);
    }
  });

  it("no /dashboard source uses brand-mark, brand-gold or brand-ink", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          /\.(tsx?|css)$/.test(entry.name) &&
          !entry.name.includes(".test.")
        ) {
          if (/brand-(mark|gold|ink)/.test(fs.readFileSync(full, "utf8")))
            offenders.push(full);
        }
      }
    };
    walk(path.join(APP, "dashboard"));
    expect(offenders).toEqual([]);
  });
});

/** oklch(L C h) → sRGB 相对亮度，用于核对文档里写的对比度。 */
const luminance = (value: string): number => {
  const [L, C, hDeg] = value
    .match(/oklch\(([^)]+)\)/)![1]
    .split(/\s+/)
    .map(Number);
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, c)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (fg: string, bg: string): number => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("text contrast (WCAG AA = 4.5)", () => {
  const pairs: Array<[string, string, string]> = [
    ["body text on canvas", "--foreground", "--background"],
    ["card text on card", "--card-foreground", "--card"],
    ["primary button label", "--primary-foreground", "--primary"],
    ["muted text on card", "--muted-foreground", "--card"],
    ["muted text on muted", "--muted-foreground", "--muted"],
    ["oxblood link on card", "--primary", "--card"],
    ["sidebar text", "--sidebar-foreground", "--sidebar"],
    ["sidebar active", "--sidebar-primary", "--sidebar-accent"],
    ["destructive on card", "--destructive", "--card"],
  ];
  for (const [label, fg, bg] of pairs) {
    it(`light: ${label}`, () => {
      expect(
        contrast(token(light, fg), token(light, bg)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const [label, fg, bg] of pairs.filter(([, , bg]) => bg !== "--muted")) {
    it(`dark: ${label}`, () => {
      expect(contrast(token(dark, fg), token(dark, bg))).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
});

describe("login page has no primary-tinted glow decorations", () => {
  it("login/page.tsx carries no blurred glow divs", () => {
    const login = fs.readFileSync(
      path.join(APP, "(auth)/login/page.tsx"),
      "utf8",
    );
    expect(login).not.toMatch(/blur-(3xl|2xl|lg)/);
  });
});
