# Test Suite Design — 6 Critical Modules

**Date:** 2026-06-02
**Scope:** Backend services — auth, mercadopago, ticket, contact, license, webhook
**Approach:** Mock Prisma with vi.fn() — no real DB

## Architecture

```
packages/backend/
  vitest.config.ts              # Vitest configuration
  src/__tests__/
    helpers/
      prisma-mock.ts            # Centralized Prisma mock factory
    auth.service.test.ts
    mercadopago.service.test.ts
    ticket.service.test.ts
    contact.service.test.ts
    license.service.test.ts
    webhook.service.test.ts
```

## Prisma Mock Strategy

Single factory at `helpers/prisma-mock.ts`:
- Mock the default export of `../lib/prisma.js`
- Expose `mockPrisma` object with vi.fn() for each model method used
- `beforeEach` resets all mocks via `vi.clearAllMocks()`
- Each test file imports the factory and customizes return values per scenario

## Test Scenarios

### auth.service
- login: valid credentials → returns tokens + user
- login: invalid password → UnauthorizedError + timing-attack prevention (bcrypt.compare runs)
- login: user not found → UnauthorizedError + dummy hash compared
- login: 2FA enabled without token → returns requiresTwoFactor + tempToken
- login: 2FA completion with valid tempToken + code → returns tokens
- login: 2FA with expired tempToken → UnauthorizedError
- register: success → creates tenant + user + returns tokens
- register: duplicate email → ConflictError
- register: duplicate slug → ConflictError
- register: weak password → Zod validation error
- refresh: valid token → rotates refresh tokens, returns new pair
- refresh: expired/invalid token → UnauthorizedError
- logout: deletes refresh tokens

### mercadopago.service
- createPreference: valid plan → creates customer, license (INACTIVE), payment (PENDING), returns preferenceId
- createPreference: invalid plan → ValidationError
- handleMercadoPagoWebhook: payment.approved → finds payment, updates to APPROVED, activates license, saves gatewayTransactionId
- handleMercadoPagoWebhook: payment.rejected → updates status to REJECTED
- handleMercadoPagoWebhook: payment.refunded → updates to REFUNDED, suspends licenses
- findPaymentByMpId: strategy 1 — by gatewayTransactionId
- findPaymentByMpId: strategy 2 — by external_reference
- findPaymentByMpId: strategy 3 — by mercadopagoPreferenceId
- findPaymentByMpId: not found → returns null

### ticket.service
- findOrCreateTicket: existing open ticket → increments unread, returns ticket
- findOrCreateTicket: recently closed ticket (<2h) → reopens as PENDING, dispatches
- findOrCreateTicket: no existing ticket → creates new PENDING, dispatches
- updateTicket: valid transition PENDING→OPEN → success
- updateTicket: invalid transition OPEN→PENDING → ValidationError
- updateTicket: OPEN requires assignedTo → ValidationError if missing
- updateTicket: closing sets closedAt
- markAsRead: sets unreadMessages to 0

### contact.service
- findOrCreateContact: existing phone → updates name/profilePic
- findOrCreateContact: new phone → creates contact
- quickSaveFromConversation: whitelisted fields only (cpfCnpj, address, etc.)
- quickSaveFromConversation: non-whitelisted fields are ignored
- createContact: schema validation (phone min 10, name min 1, email format)

### license.service
- activateLicense: first activation → sets hwid, status ACTIVE, returns token
- activateLicense: same machine → reissues token, keeps status
- activateLicense: different machine within transfer limit → transfers, increments count
- activateLicense: different machine over transfer limit → ForbiddenError
- activateLicense: expired license → ForbiddenError
- activateLicense: revoked license → ForbiddenError
- validateLicense: valid token + matching hwid → returns valid
- validateLicense: expired token → UnauthorizedError
- validateLicense: hwid mismatch → ForbiddenError
- validateLicense: revoked license → ForbiddenError
- validateLicense: offline too long → returns valid=false
- verifyLicenseToken: round-trip sign+verify
- generateSerial: format ATND-XXXX-XXXX-XXXX-XXXX

### webhook.service
- isUrlSafe: localhost → false
- isUrlSafe: 127.x.x.x → false
- isUrlSafe: 10.x.x.x → false
- isUrlSafe: 192.168.x.x → false
- isUrlSafe: public domain → true
- isUrlSafe: non-http protocol → false
- isUrlSafe: DNS rebinding to private IP → false (resolved check)
- createWebhook: private URL → ValidationError
- createWebhook: public URL → creates webhook with auto-generated secret
- deliverWebhook: re-validates URL before fetch (DNS change mid-flight)
- deliverWebhook: successful delivery → returns success + creates delivery record
- deliverWebhook: failed delivery → returns failure + creates delivery record

## Conventions

- `describe` per function, `it` per scenario
- `beforeEach` resets all mocks
- Mock `getIO()` for socket emits
- Mock `getConfig()` for env vars
- Mock `dns.resolve4` for webhook DNS checks
- Mock `fetch` for webhook deliveries
- Mock `bcrypt.compare/hash` for auth timing checks
- Mock `jwt.sign/verify` for license token tests
- No real Prisma, no real DB, no real network calls
