const { createSupplier } = require('./createSupplier');
const { updateSupplier, assertActiveChangeAllowed } = require('./updateSupplier');

module.exports = {
  createSupplier,
  updateSupplier,
  assertActiveChangeAllowed,
};
