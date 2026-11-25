# MedRoute Firestore Security Specification

## 1. Data Invariants

1. **Default Deny**: Any path not explicitly matched under `/databases/{database}/documents` is denied for both reads and writes.
2. **Public Directory Read Only**: `providers`, `services`, `providerServices`, `medicalCharges`, and `accommodations` contain non-PII public directory catalog records. Public reads require valid document IDs (`isValidId`) on single-document `get` and valid `dataOrigin` / `category` invariants on `list`.
3. **Verified Admin Writes Only**:
   - All catalog writes (`providers`, `services`, `providerServices`, `medicalCharges`, `accommodations`) require a verified admin account (`isAdmin()`).
4. **Strict Schema & Bounds**: Every write validates required/allowed keys (`hasAll` + `hasOnly`), string lengths (`.size()`), ID regex (`^[a-zA-Z0-9_\-]+$`), coordinate bounds (`latitude` in [-90, 90], `longitude` in [-180, 180]), and positive prices (when present).
5. **Immutable Identifiers**: Primary IDs (`providerId`, `serviceId`, `recordId`, `chargeId`, `accommodationId`) must match the document path ID and remain immutable on update.

## 2. Dirty Dozen Malicious Payloads (All Expected: PERMISSION_DENIED)

1. **Unauthenticated Provider Create**: `{ "providerId": "p1", "name": "Fake Clinic", ... }` with `auth == null`.
2. **Unverified Email Spoofing**: Admin email with `email_verified: false` attempting to create a `MedicalCharge`.
3. **Ghost / Shadow Field Injection**: Authenticated admin sending `{ ..., "isSponsored": true }` on `providers` create.
4. **Path ID Poisoning (1.5KB ID)**: `get` or `create` on `/providers/<1500-char-id>` failing `isValidId()`.
5. **Mismatched Document ID**: Creating `/providers/prov-a` with `providerId: "prov-b"`.
6. **Negative Medical Price**: Creating a `MedicalCharge` with `amount: -500`.
7. **Inverted Min/Max Price Range**: Creating an `Accommodation` with `minNightlyPrice: 4000, maxNightlyPrice: 1200`.
8. **Invalid Coordinates**: Creating a `Provider` with `latitude: 999, longitude: -999`.
9. **Oversized String Resource Exhaustion**: Sending a 10KB `address` string on `providers`.
10. **Invalid Enum Injection**: Creating a `Service` with `category: "ExperimentalDiagnosis"`.
11. **Immutable ID Mutation on Update**: Updating `providerId` on an existing `providers` document.
12. **Non-Admin MedicalCharge Write**: Non-admin signed-in user attempting to create or update a `MedicalCharge` document.
