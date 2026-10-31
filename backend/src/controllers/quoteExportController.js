/**
 * Input: authenticated GET requests for a quote's generated documents
 * Output: the workbook / HTML written straight to the response; no file is stored (generated documents are Restricted)
 * Pos: thin controller over quoteExportService.js; BOSS is excluded by roleAuth and by the bossReadOnly whitelist
 */
const quoteExportService = require('../services/quoteExportService');

const exportXlsx = async (req, res, next) => {
  try {
    const { fileName, buffer } = await quoteExportService.exportQuoteXlsx(req.params.id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  } catch (error) { next(error); }
};

const printView = async (req, res, next) => {
  try {
    const html = await quoteExportService.renderQuoteHtml(req.params.id);
    // Sandboxed, script-free document: the CSP blocks everything except its inline style.
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    res.send(html);
  } catch (error) { next(error); }
};

module.exports = { exportXlsx, printView };
