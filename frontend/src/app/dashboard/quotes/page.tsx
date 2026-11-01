/**
 * Input: route /dashboard/quotes
 * Output: quote list page (Suspense boundary for URL-driven list state)
 * Pos: 出口 module 报价 tab
 */
import { Suspense } from "react";
import { QuoteListPageContent } from "./components/QuoteListPageContent";

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuoteListPageContent />
    </Suspense>
  );
}
