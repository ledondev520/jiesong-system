/**
 * Input: 合成 API 夹具与 430px 手机视口
 * Output: 主页面可达、导航搜索长表单与宽账簿滚动验收
 * Pos: Playwright 移动端回归（按视口拆分），断言见 mobile-shared.ts
 */
import { registerViewportSuite } from "./mobile-shared";

registerViewportSuite(430);
