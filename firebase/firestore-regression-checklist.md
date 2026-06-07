# Firestore Rules Regression Checklist

Run this checklist after deploying `firebase/firestore.rules`.

## Public Website

- Logged out users can read `products`.
- Logged out users can read `categories`.
- Logged out users can read `banners`.
- Logged out users can read `pages`.
- Logged out users can read `campaigns`.
- Logged out users can read `storefront_configs`.
- Logged out users can read public `settings` / `shop_settings` documents needed by the storefront.
- Logged out users can create a valid `orders` document with `status: "reserved"`, `customerName`, `createdAt`, and either `productId` or `items`.
- Invalid public order payloads are rejected, including missing `customerName`, missing `createdAt`, unsupported fields, or a status other than `"reserved"`.

## Invoice/Admin Program

- Logged out users cannot read `invoices`.
- Logged in non-admin users cannot read `invoices`.
- Logged in users without `/users/{uid}` cannot read `invoices`.
- Logged in users with `/users/{uid}.role == "admin"` can read `invoices`.
- Logged in users with `/users/{uid}.role == "superadmin"` can read `invoices`.
- Admin users can read `orders`.
- Admin users can read `customers`.
- Admin users can create and update `invoices`.
- Admin users can read archived invoices through `invoices` where `status == "archived"`.
- Admin users can read and write `orders_archive` if that collection is used by legacy data.
- Admin users can read and write `inventory`, `inventory_templates`, `paymentRequests`, `audit_logs`, `companies`, and `store_media`.

## Security

- Logged out users cannot read `customers`.
- Logged out users cannot read `invoices`.
- Logged out users cannot read `orders_archive`.
- Signed-in non-admin users cannot read `customers`, `invoices`, or `orders_archive`.
- A user can create/update their own profile fields for XP/profile data, but cannot create or update their own `role`.
- Only an existing admin/superadmin can create, update, or delete another user's admin profile fields through client-side Firestore rules.
