# Supplier editor

The active editor is `page.tsx`; the legacy `components/SupplierDialog.tsx` has no caller and is not changed by this pass. Selecting a supplier or starting a new draft creates a separate editing session. Catalog refreshes never reset a live draft or change its create/update identity. Saves and soft deletes capture the selected record before awaiting, block duplicate mutation submission within that session, and ignore stale success/error callbacks after cancel, replacement, or navigation. A completed server write stays saved even when the editor is dismissed.

Failed saves retain all entered values for an explicit retry. Pending inputs are disabled for the submitting session; selection, search, and cancel/new remain available. Catalog responses use request ordering so an older response cannot replace a newer result. `page.test.tsx` covers the actual editor with generated synthetic suppliers.

Quality flags, notes, and aliases are saved by the existing backend supplier commands. Alias replacement is one nested atomic write; omitted aliases preserve existing ones, while an explicit empty list clears them. HTTP/SQLite coverage lives in `backend/src/integration/supplier-editor.integration.js`.
- `[id]/page.tsx`：供应商详情（只读「供货商品」，显示本供应商的最近价/最低/均价/次数，单商品比价失败不影响整页）；`[id]/page.test.tsx` 回归

Archive: 删除 is a soft archive (`isActive=false`); the page loads `status=all` and hides archived suppliers unless the 「已归档」 filter is chosen. ADMIN sees 「恢复当前」 for an archived supplier. Rules and the production plan: `docs/operations/archive-test-data.md`.

Permanent delete (ADMIN only, 「永久删除」): `components/HardDeleteSupplierDialog.tsx` shows the server preview (counts per record type, or the blocking reasons when money/customs records exist) and requires typing the supplier name; the page then sends the preview's `confirmToken` to `POST /suppliers/:id/hard-delete`. Archive (「归档当前」, ADMIN/PURCHASE) has no contract check.
