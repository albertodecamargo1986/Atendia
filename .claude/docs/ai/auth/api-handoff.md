# API Handoff: Auth (Login, Register, Refresh, Logout, Me) — v2

## Business Context
AtendIA is a multi-tenant SaaS platform for AI-powered customer service via WhatsApp. Authentication is tenant-scoped: every user belongs to exactly one Tenant (company). Registration creates both a new Tenant and its OWNER user in a single transaction. Login returns JWT access + refresh tokens with tenant context embedded. Token refresh is rotation-based (old refresh token is deleted on use).

## Endpoints

### POST /auth/register
- **Purpose**: Create a new tenant + owner user in one transaction
- **Auth**: public
- **Request**:
```json
{
  "name": "string — user full name, min 2 chars",
  "email": "string — valid email, unique across all tenants",
  "password": "string — min 6 chars",
  "tenantName": "string — company display name, min 2 chars",
  "tenantSlug": "string — URL slug, min 2 max 20, lowercase + numbers + hyphens only, regex: /^[a-z0-9-]+$/"
}
```
- **Response** (201):
```json
{
  "user": { "id": "uuid", "name": "string", "email": "string", "role": "OWNER" },
  "tenant": { "id": "uuid", "name": "string", "slug": "string", "plan": "FREE" },
  "accessToken": "string — JWT, 15min expiry",
  "refreshToken": "string — JWT, 30d expiry"
}
```
- **Response** (error):
  - 400: Zod validation error → `{ "error": "Dados inválidos", "details": [...] }`
  - 409: `{ "error": "E-mail já cadastrado" }` or `{ "error": "Slug da empresa já está em uso" }`
- **Notes**: New tenant always gets plan=FREE, maxAgents=1, maxConversations=100, maxWhatsapp=1, maxAiRequests=500. New user gets role=OWNER, isActive=true, emailVerified=false.

### POST /auth/login
- **Purpose**: Authenticate user and return tokens
- **Auth**: public
- **Request**:
```json
{
  "email": "string — valid email",
  "password": "string — min 6 chars"
}
```
- **Response** (200):
```json
{
  "user": { "id": "uuid", "name": "string", "email": "string", "role": "OWNER | ADMIN | SUPERVISOR | OPERATOR" },
  "tenant": { "id": "uuid", "name": "string", "slug": "string", "plan": "FREE | STARTER | PRO | ENTERPRISE" },
  "accessToken": "string",
  "refreshToken": "string"
}
```
- **Response** (error):
  - 400: Zod validation → `{ "error": "Dados inválidos", "details": [...] }`
  - 401: `{ "error": "Credenciais inválidas" }` — same message for wrong email, wrong password, or inactive user (intentionally vague for security)
- **Notes**: Inactive users (isActive=false) are treated as invalid credentials. No difference in error message.

### POST /auth/refresh
- **Purpose**: Rotate refresh token and issue new access token
- **Auth**: public (requires refresh token in body)
- **Request**:
```json
{
  "refreshToken": "string — required"
}
```
- **Response** (200):
```json
{
  "accessToken": "string — new access token",
  "refreshToken": "string — new refresh token (old one is deleted)"
}
```
- **Response** (error):
  - 400: `{ "error": "Refresh token obrigatório" }`
  - 401: `{ "error": "Refresh token inválido ou expirado" }` or `{ "error": "Usuário não encontrado ou inativo" }`
- **Notes**: Rotation — the old refresh token is **deleted** from DB after use. Each refresh creates a new refresh token row. If the old token is reused (e.g., stolen token), it will not be found and 401 is returned.

### POST /auth/logout
- **Purpose**: Invalidate a refresh token
- **Auth**: requires Bearer access token (authMiddleware)
- **Request**:
```json
{
  "refreshToken": "string — optional, deletes if provided"
}
```
- **Response** (200):
```json
{ "message": "Logout realizado com sucesso" }
```
- **Notes**: Always returns 200 even if refreshToken is missing or already deleted. Frontend should clear localStorage regardless.

### GET /auth/me
- **Purpose**: Return current user info from access token
- **Auth**: requires Bearer access token (authMiddleware)
- **Request**: no body
- **Response** (200):
```json
{
  "user": {
    "sub": "uuid — user id",
    "email": "string",
    "tenantId": "uuid",
    "role": "OWNER | ADMIN | SUPERVISOR | OPERATOR",
    "plan": "FREE | STARTER | PRO | ENTERPRISE",
    "iat": 1234567890,
    "exp": 1234567890
  }
}
```
- **Response** (error):
  - 401: `{ "error": "Token não fornecido" }` or `{ "error": "Token inválido ou expirado" }`
- **Notes**: Returns the raw JWT payload, not a DB user record. The `sub` field is the user ID. No `name` field in the response — frontend should store `user.name` from login response.

## Data Models / DTOs

```typescript
interface AuthUser {
  id: string;        // UUID
  name: string;
  email: string;
  role: Role;
}

interface AuthTenant {
  id: string;        // UUID
  name: string;
  slug: string;
  plan: Plan;
}

interface LoginResponse {
  user: AuthUser;
  tenant: AuthTenant;
  accessToken: string;
  refreshToken: string;
}

// Alias — same shape as LoginResponse
type RegisterResponse = LoginResponse;

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// JWT payload (embedded in access token, returned by /auth/me)
interface JwtPayload {
  sub: string;       // user ID
  email: string;
  tenantId: string;
  role: Role;
  plan: Plan;
  iat: number;
  exp: number;
}
```

## Enums & Constants

| Value | Meaning | Display Label |
|-------|---------|---------------|
| `OWNER` | Tenant creator, full access | Proprietário |
| `ADMIN` | Tenant administrator | Administrador |
| `SUPERVISOR` | Can monitor conversations | Supervisor |
| `OPERATOR` | Handles conversations | Operador |
| `FREE` | Free tier | Gratuito |
| `STARTER` | Starter plan | Iniciante |
| `PRO` | Professional plan | Profissional |
| `ENTERPRISE` | Enterprise plan | Empresarial |

Token expiry constants:
- Access token: **15 minutes**
- Refresh token: **30 days**

## Validation Rules

| Field | Rules |
|-------|-------|
| `email` | Required, valid email format |
| `password` | Required, min 6 characters |
| `name` | Required, min 2 characters |
| `tenantName` | Required (register only), min 2 characters |
| `tenantSlug` | Required (register only), min 2, max 20, regex `/^[a-z0-9-]+$/` |

Frontend should mirror these for client-side validation UX. Zod error details are returned in `details` array on 400 responses.

## Business Logic & Edge Cases

- **Multi-tenant scoping**: User emails are globally unique across all tenants — a user belongs to exactly one tenant.
- **Registration is atomic**: Creating tenant + user happens in a single Prisma `create` with nested relation. If either fails, neither is created.
- **Login is intentionally vague**: Same error message ("Credenciais inválidas") for wrong email, wrong password, or inactive user — prevents enumeration.
- **Refresh token rotation**: Old refresh token is **deleted** on use. Only the new token works. This means if a refresh token is used twice (stolen token scenario), the second use fails with 401.
- **Logout is idempotent**: Always returns 200. Frontend should always clear localStorage on logout regardless of API response.
- **/auth/me returns JWT payload, not DB data**: Name and other profile fields are NOT included. Frontend must cache `user.name` from the login/register response.
- **CORS**: Backend allows requests from `FRONTEND_URL` env var (defaults to `http://localhost:5173`).
- **Helmet**: Security headers are applied globally.
- **No email verification flow yet**: `emailVerified` is set to `false` on registration but there's no endpoint or flow to verify it. It's not checked during login.

## Integration Notes

- **Recommended flow**: Login/Register → store `accessToken` + `refreshToken` in localStorage → set Authorization header → on 401, attempt refresh → if refresh fails, redirect to /login
- **Axios interceptor pattern** (already implemented in `packages/frontend/src/services/api.ts`):
  1. Request interceptor adds `Authorization: Bearer <accessToken>` from localStorage
  2. Response interceptor catches 401 → tries refresh with stored refreshToken → updates localStorage → retries original request
  3. If refresh also fails → clear tokens → redirect to `/login`
- **Optimistic UI**: Not recommended for auth operations — always wait for API response.
- **Caching**: No cache headers on auth endpoints. Tokens in localStorage, user/tenant in Zustand store.
- **Real-time**: Not applicable to auth. WebSocket auth should send accessToken as part of handshake (future).

## Test Scenarios

1. **Happy path — login**: POST valid email + password → 200 with tokens + user + tenant
2. **Happy path — register**: POST valid registration data → 201 with new tenant (plan=FREE, user role=OWNER)
3. **Wrong password**: POST valid email + wrong password → 401 "Credenciais inválidas"
4. **Non-existent email**: POST unknown email → 401 "Credenciais inválidas" (same message as wrong password)
5. **Duplicate email on register**: POST already-registered email → 409 "E-mail já cadastrado"
6. **Duplicate slug on register**: POST already-used tenant slug → 409 "Slug da empresa já está em uso"
7. **Invalid slug format**: POST slug with uppercase or special chars → 400 Zod validation error
8. **Token refresh**: POST valid refreshToken → 200 with new token pair; old refreshToken is invalidated
9. **Reuse old refresh token**: POST previously-used refreshToken → 401 "Refresh token inválido ou expirado"
10. **Access expired token**: Request with expired accessToken → 401; interceptor should auto-refresh
11. **No auth header on protected route**: GET /auth/me without Bearer → 401 "Token não fornecido"
12. **Inactive user login**: User with isActive=false → 401 "Credenciais inválidas"
13. **Logout without token**: POST /auth/logout with no refreshToken → 200 (still succeeds)

## Gotchas Discovered During Integration

- **Seed password hash was invalid**: The SQL seed script inserted a truncated/corrupted `passwordHash` that was not a valid bcrypt hash (bcrypt hashes start with `$2a$` or `$2b$`). This caused "Credenciais inválidas" even with the correct password. Any future seed scripts must usebcryptjs to generate the hash in Node.js, not manually insert strings via SQL.
- **Windows portproxy limitation**: `netsh interface portproxy` can establish a TCP connection but fails to proxy PostgreSQL's binary protocol correctly. Backend must run inside WSL2 (native filesystem) or as a Docker container on the same Docker network — not on the Windows host connecting through portproxy to PostgreSQL.
- **WSL2 disk space**: If the Windows C: drive is full, WSL2 will crash with `E_FAIL` or `E_UNEXPECTED` errors, swap file creation fails, and npm install produces I/O errors. Free disk space is a hard prerequisite.

## Open Questions / TODOs

- Email verification flow is not implemented (`emailVerified` field exists but unused).
- Password reset / forgot password endpoint not yet implemented.
- No rate limiting on login attempts (express-rate-limit is a dependency but not wired to auth routes yet).
- No social login (Google, etc.) — future consideration.
- The `/auth/me` endpoint returns JWT payload, not a full user profile — a separate `/users/me` or `/profile` endpoint may be needed for user settings pages.
- Seed script needs to use bcryptjs for password hashing instead of raw SQL inserts.
