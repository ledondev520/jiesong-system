import { describe, expect, it } from "vitest";
import { splitRemark } from "./remark-display";

describe("splitRemark", () => {
  it("普通备注原样保留，无来源", () => {
    expect(splitRemark("客户要求加急发货")).toEqual({
      text: "客户要求加急发货",
      source: [],
    });
  });

  it("空值与非字符串给出空备注", () => {
    for (const value of [null, undefined, "", 42]) {
      expect(splitRemark(value)).toEqual({ text: "", source: [] });
    }
  });

  it("标记行整行归入来源，保留标记之前的真实备注", () => {
    const note =
      "先付定金\n[WPS_PURCHASE_EVIDENCE] a/b/CG2500013.pdf#瓷砖/100件";
    expect(splitRemark(note)).toEqual({
      text: "先付定金",
      source: ["[WPS_PURCHASE_EVIDENCE] a/b/CG2500013.pdf#瓷砖/100件"],
    });
  });

  it("同一行内真实备注在前、标记在后", () => {
    expect(splitRemark("加急 [WPS_EVIDENCE] src.xlsx")).toEqual({
      text: "加急",
      source: ["[WPS_EVIDENCE] src.xlsx"],
    });
  });

  it("[CUSTOMS_XML] 单行带 sha256 等键值，整体归入来源", () => {
    const hash = "a".repeat(64);
    const note = `[CUSTOMS_XML] decl.xml sha256=${hash} xml_ht_no=X1 target_contract=EXP26001`;
    const result = splitRemark(note);
    expect(result.text).toBe("");
    expect(result.source).toEqual([note]);
  });

  it("换行写入的纯键值痕迹归入来源，不泄露哈希", () => {
    const hash = "b".repeat(64);
    const result = splitRemark(
      `补充说明\nsha256=${hash}\ntarget_contract=EXP26001`,
    );
    expect(result.text).toBe("补充说明");
    expect(result.source.join(" ")).toContain(`sha256=${hash}`);
  });

  it("内部 cuid 单据 ID 被移出可见文字", () => {
    const id = "cmh1abc2d0000xyz123456789";
    expect(id).toHaveLength(25);
    const result = splitRemark(`关联单据 ${id} 已核对`);
    expect(result.text).toBe("关联单据 已核对");
    expect(result.source).toEqual([id]);
  });

  it("系统生成的退税备注：关联单据句整体移走，不留「关联报关单 、」残句", () => {
    const a = "cmvxvuhwm000lx4qjdfunecqm";
    const b = "cmvxvurlt000legdprr0zqq38";
    const note = `预计值：按采购含税成本还原，最终以供应商发票、报关单和税务系统确认为准。关联报关单 ${a}、核销单 ${b}`;
    const result = splitRemark(note);
    expect(result.text).toBe(
      "预计值：按采购含税成本还原，最终以供应商发票、报关单和税务系统确认为准。",
    );
    expect(result.text).not.toContain(a);
    expect(result.source.join(" ")).toContain(a);
    expect(result.source.join(" ")).toContain(b);
  });

  it("正常文字里的 a=b、小写方括号不误伤", () => {
    const note = "单价 a=b，见[附件]与 [note_1]";
    expect(splitRemark(note)).toEqual({ text: note, source: [] });
  });

  it("不改动输入（存储数据保持不变）", () => {
    const note = "x\n[WPS_SOURCE] y";
    splitRemark(note);
    expect(note).toBe("x\n[WPS_SOURCE] y");
  });
});
