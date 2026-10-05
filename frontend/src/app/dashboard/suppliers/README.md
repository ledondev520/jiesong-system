# Supplier editor

The active editor is `page.tsx`; the legacy `components/SupplierDialog.tsx` has no caller and is not changed by this pass. Selecting a supplier or starting a new draft creates a separate editing session. Catalog refreshes never reset a live draft or change its create/update identity. Saves and soft deletes capture the selected record before awaiting, block duplicate mutation submission within that session, and ignore stale success/error callbacks after cancel, replacement, or navigation. A completed server write stays saved even when the editor is dismissed.

Failed saves retain all entered values for an explicit retry. Pending inputs are disabled for the submitting session; selection, search, and cancel/new remain available. Catalog responses use request ordering so an older response cannot replace a newer result. `page.test.tsx` covers the actual editor with generated synthetic suppliers.

Quality flags, notes, and aliases are saved by the existing backend supplier commands. Alias replacement is one nested atomic write; omitted aliases preserve existing ones, while an explicit empty list clears them. HTTP/SQLite coverage lives in `backend/src/integration/supplier-editor.integration.js`.
