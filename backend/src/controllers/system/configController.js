const prisma = require('../../utils/prisma');
const { success } = require('../../utils/response');

const getConfigs = async (req, res, next) => {
  try {
    const configs = await prisma.systemConfig.findMany();

    const formatted = configs.reduce((acc, config) => {
      try {
        acc[config.key] = JSON.parse(config.value);
      } catch {
        acc[config.key] = config.value;
      }
      return acc;
    }, {});

    success(res, formatted);
  } catch (error) {
    next(error);
  }
};

const updateConfig = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, note } = req.body;

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value: JSON.stringify(value), note },
      create: { key, value: JSON.stringify(value), note },
    });

    success(res, config, '配置更新成功');
  } catch (error) {
    next(error);
  }
};

const getExchangeRate = async (req, res, next) => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'exchangeRate' },
    });

    let rate = { rate: 6.8, buffer: 0.2, effectiveRate: 6.6 };
    if (config) {
      try {
        const parsed = JSON.parse(config.value);
        rate = {
          ...parsed,
          effectiveRate: parsed.rate - (parsed.buffer || 0.2),
        };
      } catch {}
    }

    success(res, rate);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConfigs,
  updateConfig,
  getExchangeRate,
};
