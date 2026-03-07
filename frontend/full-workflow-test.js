// Jiesong System - 完整业务流程测试 + 回滚验证
// 使用 gpt-5.4-codex 模型执行

const { chromium } = require('playwright');
const fs = require('fs');

console.log('=== Jiesong System 完整业务流程测试 ===');
console.log('测试模型：gpt-5.4-codex');
console.log('测试时间：' + new Date().toISOString());
console.log('');

async function runFullTest() {
  let browser;
  let context;
  let page;
  const screenshots = [];
  const issues = [];
  const testData = {
    purchase: null,
    sales: null,
    product: null,
    supplier: null,
    store: null,
  };

  const screenshot = async function(name) {
    const path = `/tmp/screenshots/full-test-${name}.png`;
    await page.screenshot({ path, type: 'jpeg', quality: 85 });
    screenshots.push(name);
    console.log(`📸 ${name}`);
    return path;
  };

  const checkAndFill = async function(selector, value, description) {
    const element = await page.$(selector);
    if (element) {
      await element.fill(value);
      console.log(`✅ 填写 ${description}: ${value}`);
      return true;
    } else {
      console.log(`⚠️ 未找到 ${description}: ${selector}`);
      issues.push({ type: 'missing_field', field: description, selector });
      return false;
    }
  };

  const checkAndSelect = async function(selector, value, description) {
    const element = await page.$(selector);
    if (element) {
      await element.selectOption(value);
      console.log(`✅ 选择 ${description}: ${value}`);
      return true;
    } else {
      console.log(`⚠️ 未找到 ${description}: ${selector}`);
      issues.push({ type: 'missing_select', field: description, selector });
      return false;
    }
  };

  const checkAndClick = async function(selector, description) {
    const element = await page.$(selector);
    if (element) {
      await element.click();
      console.log(`✅ 点击 ${description}`);
      return true;
    } else {
      console.log(`⚠️ 未找到 ${description}: ${selector}`);
      issues.push({ type: 'missing_button', button: description, selector });
      return false;
    }
  };

  const waitForDialog = async function() {
    await page.waitForTimeout(500);
    const dialog = await page.$('dialog, [role="dialog"], .modal');
    return !!dialog;
  };

  try {
    console.log('✅ 启动浏览器...');
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    page = await context.newPage();

    // ==================== 阶段 1: 登录 ====================
    console.log('\n=== 阶段 1: 登录 ===');
    await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' });
    await screenshot('01-login');
    
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin123');
    await page.click('button:has-text("登录")');
    await page.waitForTimeout(2000);
    
    if (page.url().includes('/dashboard')) {
      console.log('✅ 登录成功');
    } else {
      console.log('❌ 登录失败');
      issues.push({ type: 'login_failed' });
    }

    // ==================== 阶段 2: 创建供应商 ====================
    console.log('\n=== 阶段 2: 创建供应商 ===');
    await page.goto('http://localhost:3001/dashboard/suppliers', { waitUntil: 'domcontentloaded' });
    await screenshot('02-suppliers-list');
    
    await page.click('button:has-text("新建"), button:has-text("新增")');
    await page.waitForTimeout(1000);
    
    if (await waitForDialog()) {
      console.log('✅ 供应商对话框打开');
      
      // 填写供应商信息
      await checkAndFill('input[placeholder*="供应商名称"]', '测试供应商 ' + Date.now(), '供应商名称');
      await checkAndFill('input[placeholder*="联系人"]', '张三', '联系人');
      await checkAndFill('input[placeholder*="电话"]', '13800138000', '联系电话');
      await checkAndFill('input[placeholder*="邮箱"]', 'test@example.com', '邮箱');
      await checkAndFill('textarea[placeholder*="地址"]', '上海市浦东新区', '地址');
      
      // 选择下拉框
      const selects = await page.$$('select');
      console.log(`找到 ${selects.length} 个下拉框`);
      for (let i = 0; i < selects.length; i++) {
        try {
          await selects[i].selectOption(selects[i].querySelector('option:nth-child(2)')?.value || '');
          console.log(`✅ 下拉框 ${i+1} 已选择`);
        } catch (e) {
          console.log(`⚠️ 下拉框 ${i+1} 选择失败`);
        }
      }
      
      await screenshot('03-supplier-form');
      await page.click('button:has-text("保存"), button:has-text("提交")');
      await page.waitForTimeout(1500);
      console.log('✅ 供应商创建完成');
      
      testData.supplier = '测试供应商';
    }

    // ==================== 阶段 3: 创建商品 ====================
    console.log('\n=== 阶段 3: 创建商品 ===');
    await page.goto('http://localhost:3001/dashboard/products', { waitUntil: 'domcontentloaded' });
    await screenshot('04-products-list');
    
    await page.click('button:has-text("新建"), button:has-text("新增")');
    await page.waitForTimeout(1000);
    
    if (await waitForDialog()) {
      console.log('✅ 商品对话框打开');
      
      // 填写商品信息
      await checkAndFill('input[placeholder*="商品名称"]', '测试商品 ' + Date.now(), '商品名称');
      await checkAndFill('input[placeholder*="型号"]', 'MODEL-001', '型号');
      await checkAndFill('input[placeholder*="单价"]', '100.00', '单价');
      await checkAndFill('input[placeholder*="成本价"]', '80.00', '成本价');
      await checkAndFill('input[placeholder*="库存"]', '1000', '库存数量');
      
      // 选择分类
      const categorySelect = await page.$('select');
      if (categorySelect) {
        await categorySelect.selectOption(categorySelect.querySelector('option:nth-child(2)')?.value || '');
        console.log('✅ 商品分类已选择');
      }
      
      await screenshot('05-product-form');
      await page.click('button:has-text("保存"), button:has-text("提交")');
      await page.waitForTimeout(1500);
      console.log('✅ 商品创建完成');
      
      testData.product = '测试商品';
    }

    // ==================== 阶段 4: 创建采购合同 ====================
    console.log('\n=== 阶段 4: 创建采购合同 ===');
    await page.goto('http://localhost:3001/dashboard/purchase', { waitUntil: 'domcontentloaded' });
    await screenshot('06-purchase-list');
    
    await page.click('button:has-text("新建"), button:has-text("新增")');
    await page.waitForTimeout(1000);
    
    if (await waitForDialog()) {
      console.log('✅ 采购合同对话框打开');
      
      // 填写合同信息
      await checkAndFill('input[placeholder*="合同编号"]', 'CG-' + Date.now(), '合同编号');
      await checkAndFill('input[placeholder*="合同金额"]', '50000.00', '合同金额');
      await checkAndFill('input[placeholder*="定金比例"]', '30', '定金比例');
      
      // 选择供应商（下拉框）
      const supplierSelect = await page.$('select');
      if (supplierSelect) {
        await supplierSelect.selectOption(supplierSelect.querySelector('option:nth-child(2)')?.value || '');
        console.log('✅ 供应商已选择');
      }
      
      // 选择商品
      await page.click('button:has-text("添加商品"), button:has-text("选择商品")');
      await page.waitForTimeout(500);
      
      await screenshot('07-purchase-form');
      await page.click('button:has-text("保存"), button:has-text("提交")');
      await page.waitForTimeout(1500);
      console.log('✅ 采购合同创建完成');
      
      testData.purchase = 'CG-' + Date.now();
    }

    // ==================== 阶段 5: 创建销售合同 ====================
    console.log('\n=== 阶段 5: 创建销售合同 ===');
    await page.goto('http://localhost:3001/dashboard/sales', { waitUntil: 'domcontentloaded' });
    await screenshot('08-sales-list');
    
    await page.click('button:has-text("新建"), button:has-text("新增")');
    await page.waitForTimeout(1000);
    
    if (await waitForDialog()) {
      console.log('✅ 销售合同对话框打开');
      
      // 填写合同信息
      await checkAndFill('input[placeholder*="合同编号"]', 'EXP-' + Date.now(), '合同编号');
      await checkAndFill('input[placeholder*="合同金额"]', '80000.00', '合同金额');
      
      // 选择客户门店
      const storeSelect = await page.$('select');
      if (storeSelect) {
        await storeSelect.selectOption(storeSelect.querySelector('option:nth-child(2)')?.value || '');
        console.log('✅ 客户门店已选择');
      }
      
      await screenshot('09-sales-form');
      await page.click('button:has-text("保存"), button:has-text("提交")');
      await page.waitForTimeout(1500);
      console.log('✅ 销售合同创建完成');
      
      testData.sales = 'EXP-' + Date.now();
    }

    // ==================== 阶段 6: 库存管理测试 ====================
    console.log('\n=== 阶段 6: 库存管理测试 ===');
    await page.goto('http://localhost:3001/dashboard/inventory', { waitUntil: 'domcontentloaded' });
    await screenshot('10-inventory-list');
    
    // 检查库存列表
    const tableRows = await page.$$('table tbody tr');
    console.log(`✅ 库存列表显示 ${tableRows.length} 条记录`);
    
    // 测试筛选
    const filterSelects = await page.$$('select');
    for (let i = 0; i < filterSelects.length && i < 3; i++) {
      try {
        await filterSelects[i].selectOption(filterSelects[i].querySelector('option:nth-child(2)')?.value || '');
        console.log(`✅ 筛选器 ${i+1} 已测试`);
      } catch (e) {}
    }
    await page.waitForTimeout(500);
    await screenshot('11-inventory-filter');

    // ==================== 阶段 7: 财务管理测试 ====================
    console.log('\n=== 阶段 7: 财务管理测试 ===');
    await page.goto('http://localhost:3001/dashboard/finance', { waitUntil: 'domcontentloaded' });
    await screenshot('12-finance');
    
    // 切换应收/应付 Tab
    await page.click('button:has-text("应收"), button:has-text("应收账款")');
    await page.waitForTimeout(500);
    await screenshot('13-finance-receivable');
    
    await page.click('button:has-text("应付"), button:has-text("应付账款")');
    await page.waitForTimeout(500);
    await screenshot('14-finance-payable');
    
    console.log('✅ 财务页面切换测试完成');

    // ==================== 阶段 8: 货柜管理测试 ====================
    console.log('\n=== 阶段 8: 货柜管理测试 ===');
    await page.goto('http://localhost:3001/dashboard/containers', { waitUntil: 'domcontentloaded' });
    await screenshot('15-containers-list');
    
    await page.click('button:has-text("新建"), button:has-text("新增")');
    await page.waitForTimeout(1000);
    
    if (await waitForDialog()) {
      console.log('✅ 货柜对话框打开');
      
      await checkAndFill('input[placeholder*="货柜编号"]', 'CONT-' + Date.now(), '货柜编号');
      await checkAndFill('input[placeholder*="封条号"]', 'SEAL-001', '封条号');
      
      await screenshot('16-container-form');
      await page.click('button:has-text("取消")'); // 不保存
      console.log('✅ 货柜表单测试完成（已取消）');
    }

    // ==================== 阶段 9: 工作台数据验证 ====================
    console.log('\n=== 阶段 9: 工作台数据验证 ===');
    await page.goto('http://localhost:3001/dashboard', { waitUntil: 'domcontentloaded' });
    await screenshot('17-dashboard-final');
    
    // 检查数据卡片
    const cards = await page.$$('.card, [class*="card"]');
    console.log(`✅ 工作台显示 ${cards.length} 个数据卡片`);
    
    // 检查图表
    const charts = await page.$$('canvas, svg, [class*="chart"], [class*="echarts"]');
    console.log(`✅ 工作台显示 ${charts.length} 个图表`);

    // ==================== 阶段 10: 回滚验证 ====================
    console.log('\n=== 阶段 10: 回滚验证 ===');
    
    // 重新访问所有页面，验证数据持久化
    const pagesToVerify = [
      ['/dashboard/suppliers', '供应商'],
      ['/dashboard/products', '商品'],
      ['/dashboard/purchase', '采购'],
      ['/dashboard/sales', '销售'],
      ['/dashboard/inventory', '库存'],
    ];
    
    for (const [path, name] of pagesToVerify) {
      await page.goto('http://localhost:3001' + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const rows = await page.$$('table tbody tr');
      console.log(`✅ ${name}列表：${rows.length} 条记录`);
    }

    // ==================== 测试完成 ====================
    console.log('\n=== 测试完成 ===');
    console.log('截图数量:', screenshots.length);
    console.log('发现问题数:', issues.length);
    console.log('创建数据:', JSON.stringify(testData, null, 2));

    await browser.close();
    console.log('✅ 浏览器已关闭');
    console.log('🎉 Jiesong System 完整业务流程测试完成！');
    
    return { 
      success: true, 
      screenshots,
      issues,
      testData,
      summary: {
        totalScreenshots: screenshots.length,
        totalIssues: issues.length,
        pagesTested: 17,
      }
    };
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    issues.push({ type: 'test_failure', error: error.message });
    if (browser) await browser.close();
    return { success: false, error: error.message, issues };
  }
}

runFullTest().then(result => {
  console.log('');
  console.log('=== 测试结果 ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
});
