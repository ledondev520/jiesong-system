export const normalizeContractRef = (value: string | undefined | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  return /^EXP\d{5,}$/.test(normalized) ? normalized : '';
};

export const buildReceiptNote = ({
  contractRef,
  note,
}: {
  contractRef?: string;
  note?: string;
}) => {
  const normalizedRef = normalizeContractRef(contractRef);
  const normalizedNote = String(note || '').trim();
  const parts: string[] = [];

  if (normalizedRef) {
    parts.push(`合同号:${normalizedRef}`);
  }

  if (normalizedNote) {
    parts.push(`备注:${normalizedNote}`);
  }

  return parts.join(' | ');
};
