# Supplier editor persistence

`createSupplier.js` and `updateSupplier.js` persist the existing editor's quality flag, quality note, and alias list along with its existing optional company/contact/payment fields. `aliases.js` accepts omitted aliases (preserve on update) or an explicit array of non-empty alias objects (replace or clear on update). Prisma nested replacement is atomic: conflicting aliases fail with a bounded business error and cannot partly change the supplier or remove existing aliases. Returned supplier records include aliases so the editor can display the saved result.

Role checks remain in the existing authenticated supplier routes; these commands grant no new role or capability. Unit tests retain the existing optional payment-field contract; generated synthetic HTTP/private SQLite tests cover saved fields, failed mutation rollback, and the unchanged role boundary.
