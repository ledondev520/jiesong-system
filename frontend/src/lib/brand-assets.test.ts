/**
 * Input: frontend/public/brand SVG masters, app icons, favicon.ico and manifest.json
 * Output: 向阳逐浪 vector-purity and icon-wiring regression checks
 * Pos: 品牌资产测试（矢量母版 2 条闭合路径、无位图/描边/渐变，图标文件与 manifest 一致）
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PUBLIC = path.resolve(__dirname, "../../public");
const APP = path.resolve(__dirname, "../app");
const read = (file: string) => fs.readFileSync(file, "utf8");
const MASTERS = ["black", "white", "reversed", "charcoal", "color"].map(
  (name) => path.join(PUBLIC, "brand", `xiangyang-mark-${name}.svg`),
);
const pngSize = (file: string) => {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

describe.each(MASTERS)("矢量母版 %s", (file) => {
  const svg = read(file);
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(
    (m) => m[1],
  );

  it("恰好 2 条路径（牛角与海浪复合路径 + 独立圆点），无位图或特效", () => {
    expect(paths).toHaveLength(2);
    expect(svg).not.toMatch(
      /<image|data:|href=|Gradient|<filter|<mask|clipPath|stroke|opacity|<style/i,
    );
  });

  it("路径只含 M/C/L/Z，且每个子路径都闭合", () => {
    for (const d of paths) {
      expect(d).toMatch(/^[MCLZ0-9.\s-]+$/);
      expect((d.match(/M/g) ?? []).length).toBe((d.match(/Z/g) ?? []).length);
    }
    expect((paths[0].match(/M/g) ?? []).length).toBe(2); // 牛角+凹槽、海浪两个实心形状
    expect((paths[1].match(/M/g) ?? []).length).toBe(1);
  });
});

describe("图标与 manifest", () => {
  it("manifest 引用的图标文件存在且像素尺寸与声明一致", () => {
    const manifest = JSON.parse(read(path.join(PUBLIC, "manifest.json")));
    for (const icon of manifest.icons) {
      const [w, h] = pngSize(path.join(PUBLIC, icon.src));
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual([
      "any",
      "any",
      "maskable",
      "maskable",
    ]);
  });

  it("favicon.ico 含 16/32/48 三张 PNG，apple-icon 为 180x180，icon.svg 无位图", () => {
    const ico = fs.readFileSync(path.join(APP, "favicon.ico"));
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => ico[6 + 16 * i])).toEqual([16, 32, 48]);
    expect(pngSize(path.join(APP, "apple-icon.png"))).toEqual([180, 180]);
    expect(read(path.join(APP, "icon.svg"))).not.toMatch(
      /<image|data:|Gradient|<filter/i,
    );
  });
});
