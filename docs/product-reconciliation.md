# Product reconciliation

Orders, Daily Orders, and Inventory resolve historical order items against the current website `products` and `categories` collections. Product names and product groupings come from that catalog. An old name, missing product ID, or ambiguous name requires an explicit match. The popup lists every active product in the known category. If the historical category cannot be resolved, staff select its category first.

Confirmed mappings are reused for the same historical ID/name/category. Unknown items are visibly flagged and excluded from stock and product totals until matched. Monetary order totals and stored invoices are preserved. Separate current product IDs remain separate even when their current names are identical.

## Additive storage plan

The first confirmation creates the optional `settings/product_name_mappings` document. No migration, backfill, deletion, or rewrite of order/invoice history occurs. Each entry is keyed by an encoded historical identity and records the selected current product ID/category and confirming staff member/time. Transactions merge individual entries, preserve other matches, and reject conflicting active matches. A retired target requires another confirmation. Existing staff-only settings write rules cover this document; the client also checks the actor and same-category active product.

Existing installations work before the document exists. Confirmed entries are cached for reads. A new confirmation requires a successful online transaction; failed/offline saves stay unresolved. To roll back the feature, revert the application release; the optional mapping document can remain without affecting earlier code. There is no destructive rollback step.

## Intent and compatibility

`ConfirmProductMatchIntent` has separate Validate, Normalize, AddContext, Authorize, Process, and Emit stages registered through the existing registries. AddContext reloads the catalog before authorizing a match; Process saves only the confirmed mapping. New code uses traditional functions and explicit helpers. Existing order-save flows reject unresolved items rather than saving placeholder product identities.

## Verification

Run `npm run check`. Reconciliation tests cover renamed and missing IDs, duplicate names, category restrictions, translations, current-catalog name changes, 41-product quantity reconciliation, returns, persistence across sessions, repeated confirmation, offline/failed writes, and conflicting confirmations.

In Orders, Daily Orders, or Inventory, open an unmatched item. Confirm that no product is selected automatically and only current products from its category appear. Select and confirm a product; the refreshed screen should use its current catalog name and include the matched quantity once. Reopening should reuse the match. Later/Skip keeps unresolved totals visibly marked. No test should write a match to production without the user's selection.
