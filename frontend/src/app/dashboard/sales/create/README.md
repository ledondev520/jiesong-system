# Export-contract creation

The existing sales form selects products and customer stores. `components/StoreSelect.tsx` offers an inline store-creation dialog to the same business roles permitted by POST `/stores`, without adding another primary management page. The server remains the authority for writes; BOSS and unknown roles never see the creation action.

`components/StoreSelect.tsx` is a searchable store picker only. Inline store creation was removed (J13): new stores are added under 客户与门店 (`/dashboard/customers/<id>`), and an empty catalog links there. Store writes keep using `/stores` with unchanged roles; the backend now requires a customer for new stores (single-active-customer rule).

Regression coverage: `components/StoreSelect.test.tsx`, `page.test.tsx`, `frontend/src/services/store.service.test.ts`, and `backend/src/integration/store-first-use.integration.js`. All fixtures are synthetic; no production browser/data is required.

Pricing on this page comes only from the backend: the exchange rate is pre-filled from `GET /system/exchange-rate` (the single pricing config), the suggested unit price from `POST /sales/calculate-price` (with the selected `productId` so category markups such as tiles apply), and the order margin tile/warning from the same endpoint's `items` mode. The margin warning (outside 30%–35%) is informational only and never blocks `创建合同`; `page.test.tsx` covers both.
