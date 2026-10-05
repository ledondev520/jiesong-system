# Purchase creation and draft editing

`components/CreatePurchasePageContent.tsx` remains the shared purchase creation/draft form. The inline new-supplier editor uses a fresh session for each open and discards unsaved fields on Cancel, Escape, or close. Failed saves retain optional fields for an explicit retry; duplicate clicks are gated synchronously. Closing during a submitted save does not roll back a completed supplier creation. Its late result may refresh the current contract's supplier catalog, but cannot select a supplier, close a new editor, overwrite its draft, or show a stale success/error message.

Navigation/unmount and `editId` changes invalidate supplier editor outcomes. Catalog requests also ignore obsolete responses when a different draft is opened. Product editing and the already-covered sales-store creation components are unchanged. Component tests use synthetic data and retain the existing contract-number checks.
