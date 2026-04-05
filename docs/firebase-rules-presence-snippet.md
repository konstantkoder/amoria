# Firestore rules snippet — presence collection

```
match /presence/{uid} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

Optional field validation:
- uid == request.auth.uid
- lat/lng are numbers
- prefix is string
- precision is number
- updatedAt is number
