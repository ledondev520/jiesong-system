// Frozen test copy of the backend pricing schema (config/pricing.schema.json); never import the live config/pricing.json.
export const pricingConfigFixture: {
  exchangeRate: number;
  exchangeAdjustment: number;
  defaultMarkup: number;
  categoryMarkups: {
    categoryId: string;
    categoryName: string;
    markup: number;
  }[];
} = {
  exchangeRate: 6.72,
  exchangeAdjustment: -0.2,
  defaultMarkup: 0.3,
  categoryMarkups: [],
};
