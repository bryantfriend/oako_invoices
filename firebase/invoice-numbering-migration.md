# Collision-Proof Invoice Numbering Migration

## Scope

This is an additive migration for invoices created after deployment. Existing
invoice documents and existing invoice numbers are not rewritten.

## New Firestore data

The first invoice created in a calendar year lazily creates:

```text
invoice_sequences/global-YYYY
```

The document stores the last committed sequence value. It is updated in the
same Firestore transaction that creates the invoice, inventory effects, audit
records, and processed-intent record.

New canonical numbers use:

```text
INV-YYYY-NNNNNN
```

The year segment keeps the new namespace distinct from the legacy
`INV-NNNNNN` format.

## Offline compatibility

Offline invoices retain their `OFFLINE-NNNNNN` number until synchronization.
During sync, the create transaction assigns the canonical number and stores the
offline number in `temporaryInvoiceNumber` and `previousInvoiceNumbers`.
Existing QR payloads remain valid because QR validation accepts those aliases
when the invoice ID and secure token also match.

## Deployment order

1. Deploy `firebase/firestore.rules`.
2. Deploy the application files.
3. Create one test invoice and confirm the matching yearly sequence document
   and canonical invoice number were committed.
4. Create two invoices from separate signed-in devices and confirm their
   sequence values are distinct.
5. Create and print one offline invoice, reconnect, sync, and confirm both the
   new canonical QR and the previously printed QR resolve to the same invoice.

## Rollback

Rolling the application back does not require deleting sequence documents.
Sequence documents are intentionally non-deletable. A rollback may leave gaps
only if an administrator performs an out-of-band repair; committed application
transactions always update the counter and invoice atomically.
