const pricing = require('../../services/pricingConfigService');
const { success } = require('../../utils/response');

const getPricing = (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return success(res, { ...pricing.loadPricingSnapshot(), schema: pricing.schema });
  } catch (error) { return next(error); }
};

const updatePricing = (req, res, next) => {
  try {
    const result = pricing.updatePricingConfig(req.body?.config, req.body?.revision, req.user.id);
    res.set('Cache-Control', 'no-store');
    return success(res, { ...result, schema: pricing.schema });
  } catch (error) { return next(error); }
};

module.exports = { getPricing, updatePricing };
