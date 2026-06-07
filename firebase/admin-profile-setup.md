# Admin Profile Setup

The invoice/admin program requires the signed-in Firebase Auth user to have a matching Firestore profile:

```js
users/{uid}
{
  uid: "{same Firebase Auth uid}",
  role: "superadmin",
  email: "admin@example.com",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

Valid admin roles are:

- `admin`
- `superadmin`

Create the first admin profile from trusted tooling only, such as the Firebase Console or a Firebase Admin SDK script run by a project owner. Do not add a public client-side setup page that lets users choose or update their own `role`.

After login, the invoice app logs this safe diagnostic object in the browser console:

```txt
[auth] Admin profile check { uid, profileExists, role, isAdmin }
```

If `profileExists` is `false`, copy the logged UID and create `users/{uid}` with one of the valid roles above.
