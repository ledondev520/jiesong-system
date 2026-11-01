/**
 * Input: 合成 API 夹具与 320px 手机视口
 * Output: 主页面可达、导航搜索长表单与宽账簿滚动验收
 * Pos: Playwright 移动端回归（按视口拆分），断言见 mobile-shared.ts
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { registerViewportSuite } from "./mobile-shared";

registerViewportSuite(320);
