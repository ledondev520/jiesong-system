/**
 * Input: 出口四单冻结快照及已生成的合同/发票/箱单
 * Output: 固定22列的报关预录信息页，沿用已确认的蓝白表头、隔行底色和打印版式
 * Pos: Excel上传和数据库制单共用的预录页生成器；不做定价、不写业务库
 */
const { createError } = require('../middleware/errorHandler');

const shipmentDate = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const day = value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 10) : String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(day) ? new Date(day) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day.slice(0, 10)) {
    throw createError('出货日期无效，请使用 Excel 日期或 YYYY-MM-DD，未确定时留空', 400);
  }
  return day.slice(0, 10);
};

const addCustomsPreentrySheet = (workbook, packet) => {
  if (!packet.lines.length) throw createError('出口四单没有商品明细', 400);
  const template = Boolean(workbook.getWorksheet('合同'));
  const contract = workbook.getWorksheet(template ? '合同' : '外销合同');
  const invoice = workbook.getWorksheet(template ? '发票' : '商业发票');
  const packing = workbook.getWorksheet(template ? '箱单' : '装箱单');
  const first = template ? 9 : 10;
  const sourceTotal = template ? Math.max(25, first + packet.lines.length) : first + packet.lines.length;
  const total = 12 + packet.lines.length;
  const sheet = workbook.addWorksheet('报关预录信息', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 11, topLeftCell: 'D12', showGridLines: false, zoomScale: 79 }],
    pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printArea: `A1:V${total}`, printTitlesRow: '1:11',
      margins: { left: 0.75, right: 0.75, top: 1, bottom: 1, header: 0.5, footer: 0.5 } },
  });
  sheet.columns = [7,18,14,48,12,10,12,13,9,11,12,12,11,18,22,13,18,13,12,14,12,20].map((width) => ({ width }));
  sheet.properties.defaultRowHeight = 16.8;
  const edge = { style: 'thin', color: { argb: 'FFAFC7D9' } };
  const paint = (cell, { size = 9, color = 'FF000000', fill = 'FFFFFFFF', bold = false, horizontal = 'center', wrapText = false, border = true, italic = false } = {}) => {
    cell.font = { name: 'Microsoft YaHei', size, color: { argb: color }, bold, italic };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    cell.alignment = { horizontal, vertical: 'middle', wrapText };
    if (border) cell.border = { top: edge, bottom: edge, left: edge, right: edge };
  };
  const ref = (source, address, result) => ({ formula: `'${source.name.replace(/'/g, "''")}'!${address}`, result });
  const sourceValue = (source, address) => source.getCell(address).value?.result ?? source.getCell(address).value;
  const linked = (source, address) => ref(source, address, sourceValue(source, address));
  const single = (key) => {
    const values = packet.lines.map((line) => line[key] || '');
    return values.length && values.every((value) => value === values[0]) ? values[0] : '';
  };
  const dateValue = (day) => day ? new Date(`${day}T00:00:00Z`) : null;
  const merges = ['A1:V1','A2:V2','B4:H4','J4:V4','B5:D5','F5:H5','J5:L5','N5:V5','B6:D6','F6:H6','J6:L6','N6:P6','R6:V6','B7:J7','L7:N7','P7:V7','B8:V8',`A${total}:F${total}`];
  for (const range of merges) sheet.mergeCells(range);
  sheet.getCell('A1').value = '出口报关预录信息表 / CUSTOMS PRE-ENTRY INFORMATION';
  paint(sheet.getCell('A1'), { size: 16, color: 'FFFFFFFF', fill: 'FF1F4E78', bold: true, border: false });
  sheet.getRow(1).height = 32;
  sheet.getCell('A2').value = '本表仅汇总委托方现有资料；运输工具、航次、提运单号及申报单位等由报关行按实际运输单证录入。';
  paint(sheet.getCell('A2'), { size: 10, color: 'FF7F6000', fill: 'FFFFF2CC', horizontal: 'left', wrapText: true, italic: true, border: false });
  sheet.getRow(2).height = 24;
  const fields = {
    A4: ['境内发货人','B4',linked(contract, template ? 'B5' : 'B4')],
    I4: ['境外收货人','J4',linked(contract, template ? 'B6' : 'B5')],
    A5: ['合同协议号','B5',linked(contract, template ? 'F3' : 'G4')],
    E5: ['成交方式','F5',packet.tradeTerm], I5: ['币制','J5',packet.currency],
    M5: ['贸易/运抵国','N5',packet.destinationCountry || null],
    A6: ['包装件数','B6',ref(packing, `${template ? 'E' : 'F'}${sourceTotal}`,packet.summary.boxes)],
    E6: ['毛重(kg)','F6',ref(packing, `${template ? 'F' : 'G'}${sourceTotal}`,packet.summary.grossWeight)],
    I6: ['净重(kg)','J6',ref(packing, `${template ? 'G' : 'H'}${sourceTotal}`,packet.summary.netWeight)],
    M6: ['体积(m³)','N6',ref(packing, `${template ? 'H' : 'I'}${sourceTotal}`,packet.summary.volume)],
    Q6: ['总价(USD)','R6',ref(contract, `${template ? 'F' : 'H'}${sourceTotal}`,packet.summary.totalUsd)],
    A7: ['贸易条款/起运港','B7',template && sourceValue(contract, `A${sourceTotal+3}`) ? linked(contract, `A${sourceTotal+3}`) : packet.tradeTerm + (packet.portOfLoading ? ` ${packet.portOfLoading}` : '')],
    K7: ['出货日期','L7',dateValue(single('shippedAt'))],
    O7: ['内部柜号','P7',single('containerLabel') || null],
    A8: ['整票提示','B8',null],
  };
  for (const [label, [title, address, value]] of Object.entries(fields)) {
    sheet.getCell(label).value = title;
    paint(sheet.getCell(label), { size: 10, color: 'FF17365D', fill: 'FFD9EAF7', bold: true, wrapText: true });
    sheet.getCell(address).value = value;
    paint(sheet.getCell(address), { size: 10, horizontal: 'left', wrapText: true });
  }
  for (const row of [4,5,6,7,8]) sheet.getRow(row).height = row === 4 ? 42 : 28;
  for (const cell of ['F6','J6','R6']) sheet.getCell(cell).numFmt = '#,##0.00';
  sheet.getCell('N6').numFmt = '0.000';
  sheet.getCell('L7').numFmt = 'yyyy-mm-dd';
  // shortcut: 公司合同模板仅识别USA，新增目的国模板时扩展明确的国家取值。
  if (template && !packet.destinationCountry) {
    const address = `A${sourceTotal+2}`;
    sheet.getCell('N5').value = { formula: `IF(ISNUMBER(SEARCH("USA",'合同'!${address})),"USA","")`, result: /USA/i.test(contract.getCell(address).text) ? 'USA' : '' };
  }
  const ports = new Set(packet.lines.map((line) => line.portName).filter(Boolean));
  sheet.getCell('B8').value = ports.size > 1 ? '本票明细包含多个港口，外发前请按最终订舱资料复核。' : null;
  paint(sheet.getCell('B8'), { size: 10, color: 'FF9C6500', fill: 'FFFFF2CC', horizontal: 'left', wrapText: true });
  sheet.getRow(11).values = ['项号','商品名称','HS编码','规格型号/申报要素','成交数量','成交单位','单价(USD)','总价(USD)','币制','包装件数','毛重(kg)','净重(kg)','体积(m³)','包装规格(mm)','境内货源地','最终目的国','内部柜号','出货日期','港口','门店','报关公司','备注'];
  sheet.getRow(11).height = 36;
  sheet.getRow(11).eachCell((cell) => paint(cell, { color: 'FFFFFFFF', fill: 'FF1F4E78', bold: true, wrapText: true }));
  packet.lines.forEach((line, i) => {
    const row = 12+i, source = first+i;
    const packingColumns = template ? ['A','B','C','K','I','J','E','F','G','H','D','L'] : ['A','B',null,null,'D','E','F','G','H','I','C',null];
    const values = [line.index,line.productName,line.hsCode,line.declaration,line.quantity,line.unit,line.boxes,line.grossWeight,line.netWeight,line.volume,line.specification,line.origin];
    const destinations = ['A','B','C','D','E','F','J','K','L','M','N','O'];
    destinations.forEach((col,j) => {
      const other = { C: 'D', D: 'J', O: 'I' }[col];
      const link = ref(packingColumns[j] ? packing : invoice, `${packingColumns[j] || other}${source}`, values[j]);
      if (['B','C','D','F','N','O'].includes(col)) link.formula += '&""';
      sheet.getCell(`${col}${row}`).value = link;
    });
    sheet.getCell(`G${row}`).value = ref(contract, `${template ? 'E' : 'G'}${source}`,line.unitPriceUsd);
    sheet.getCell(`H${row}`).value = ref(contract, `${template ? 'F' : 'H'}${source}`,line.totalUsd);
    sheet.getCell(`I${row}`).value = { formula: '$J$5', result: packet.currency };
    sheet.getCell(`I${row}`).dataValidation = { type: 'list', formulae: ['"USD"'] };
    sheet.getCell(`P${row}`).value = { formula: 'IF($N$5="","",$N$5)', result: sheet.getCell('N5').value?.result ?? packet.destinationCountry ?? '' };
    for (const [col,value] of [['Q',line.containerLabel],['R',dateValue(line.shippedAt)],['S',line.portName],['T',line.storeName],['U',line.customsBroker],['V',line.supplement]]) sheet.getCell(`${col}${row}`).value = value || null;
    sheet.getRow(row).height = 52;
    for (let col=1;col<=22;col+=1) paint(sheet.getCell(row,col), { fill: i%2 ? 'FFEAF3F8' : 'FFFFFFFF', horizontal: [4,14,15,22].includes(col) ? 'left' : 'center', wrapText: [4,14,15,22].includes(col) });
    for (const [col,format] of Object.entries({ C:'@',E:'#,##0.##',G:'#,##0.0000',H:'#,##0.00',J:'#,##0',K:'#,##0.00',L:'#,##0.00',M:'0.000',R:'yyyy-mm-dd' })) sheet.getCell(`${col}${row}`).numFmt = format;
  });
  for (let col=1;col<=22;col+=1) paint(sheet.getCell(total,col), { size: 10, color: 'FF17365D', fill: 'FFE2F0D9', bold: true, wrapText: true });
  sheet.getCell(`A${total}`).value = '合计 TOTAL';
  sheet.getRow(total).height = 30;
  for (const [col,key,format] of [['H','totalUsd','#,##0.00'],['J','boxes','#,##0'],['K','grossWeight','#,##0.00'],['L','netWeight','#,##0.00'],['M','volume','0.000']]) {
    sheet.getCell(`${col}${total}`).value = { formula: `SUM(${col}12:${col}${total-1})`, result: packet.summary[key] };
    sheet.getCell(`${col}${total}`).numFmt = format;
  }
  sheet.autoFilter = `A11:V${total-1}`;
  workbook.calcProperties.fullCalcOnLoad = true;
  return sheet;
};

module.exports = { addCustomsPreentrySheet, shipmentDate };
