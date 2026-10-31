/**
 * Input: quote status (+ computed expiry flag)
 * Output: status badge using the shared semantic tones; 已过期 is shown beside SENT, never stored
 * Pos: quote list and detail
 */
import { SemanticBadge } from "@/components/ui/semantic-badge";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  isQuoteStatus,
} from "@/lib/quote";

export function QuoteStatusBadge({
  status,
  expired = false,
}: {
  status: string;
  expired?: boolean;
}) {
  const known = isQuoteStatus(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <SemanticBadge tone={known ? QUOTE_STATUS_TONE[status] : "neutral"}>
        {known ? QUOTE_STATUS_LABEL[status] : status}
      </SemanticBadge>
      {expired && <SemanticBadge tone="warning">已过期</SemanticBadge>}
    </span>
  );
}
