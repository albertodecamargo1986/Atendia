# Módulo 01 — Autenticação e Multi-Tenant

---

## Visão Geral

Este módulo é a base de toda a plataforma. Ele implementa o sistema de cadastro de empresas (tenants), autenticação de usuários, controle de perfis e permissões, e o isolamento de dados entre diferentes empresas.

---

## Sistema de Cadastro de Empresas (Multi-Tenant)

Cada empresa que se cadastra na plataforma se torna um **tenant** isolado. O fluxo de cadastro:

1. Usuário acessa a landing page e clica em "Criar conta grátis"
2. Preenche formulário: nome da empresa, nome do responsável, e-mail, senha
3. Sistema cria o registro `company` com `plan = 'free'` e o primeiro usuário com `role = 'admin'`
4. E-mail de verificação enviado (obrigatório para ativar a conta)
5. Após verificação, redireciona para onboarding (wizard de configuração inicial)

### Slug da empresa
Cada empresa recebe um `slug` único (ex: `minha-empresa`) usado na URL e para identificação em webhooks. Gerado automaticamente a partir do nome, com verificação de unicidade.

---

## Planos de Assinatura

| Plano | Preço | Operadores | Conversas/mês | WhatsApp Numbers | IA Requests/mês |
|---|---|---|---|---|---|
| Free | Grátis | 1 | 100 | 1 | 500 |
| Starter | R$ 97/mês | 3 | 1.000 | 1 | 5.000 |
| Pro | R$ 197/mês | 10 | 10.000 | 3 | 50.000 |
| Enterprise | Sob consulta | Ilimitado | Ilimitado | Ilimitado | Ilimitado |

Limites verificados via middleware antes de operações que consomem recursos.

---

## Autenticação JWT

### Tokens
- **Access Token:** validade de 15 minutos. Enviado no header `Authorization: Bearer <token>`
- **Refresh Token:** validade de 30 dias. Armazenado em cookie httpOnly seguro.

### Fluxo de Autenticação
```
POST /auth/login
  → valida credenciais
  → gera access_token (15min) + refresh_token (30 dias)
  → retorna access_token no body
  → seta refresh_token em cookie httpOnly

POST /auth/refresh
  → lê refresh_token do cookie
  → valida no banco (tabela refresh_tokens)
  → gera novo par de tokens (rotação de refresh token)

POST /auth/logout
  → invalida refresh_token no banco
  → limpa cookie
```

### Payload do JWT
```json
{
  "sub": "user-uuid",
  "email": "usuario@empresa.com",
  "company_id": "company-uuid",
  "role": "operator",
  "plan": "pro",
  "iat": 1700000000,
  "exp": 1700000900
}
```

---

## Controle de Perfis e Permissões (RBAC)

| Permissão | super_admin | admin | supervisor | operator | agent_configurator |
|---|---|---|---|---|---|
| Gerenciar todos os tenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gerenciar usuários da empresa | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configurar agente de IA | ✅ | ✅ | ❌ | ❌ | ✅ |
| Ver todos os atendimentos | ✅ | ✅ | ✅ | ❌ | ❌ |
| Atender conversas | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver relatórios | ✅ | ✅ | ✅ | ❌ | ❌ |
| Configurar integrações | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver apenas suas conversas | — | — | — | ✅ | — |

### Middleware de Autorização
```typescript
// Exemplo de uso nas rotas
router.get('/reports', authenticate, authorize('supervisor', 'admin'), reportsController.get)
router.post('/agents', authenticate, authorize('admin', 'agent_configurator'), agentController.create)
```

---

## Middleware de Isolamento de Dados por Tenant

```typescript
// middleware/tenant.ts
export const tenantMiddleware = async (req, res, next) => {
  const { company_id } = req.user; // injetado pelo middleware de auth
  req.db = prisma.withFilters({ where: { company_id } }); // extensão customizada
  // Todas as queries feitas via req.db automaticamente filtram por company_id
  next();
};
```

Segunda camada: Row-Level Security no PostgreSQL.
```sql
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON conversations
  USING (company_id = current_setting('app.current_company_id')::uuid);
```

---

## Sistema de Convite de Usuários

1. Admin acessa Configurações → Usuários → "Convidar usuário"
2. Informa e-mail e perfil desejado
3. Sistema gera token de convite (expira em 48h) e envia e-mail
4. Usuário clica no link, define senha e ativa a conta
5. Usuário criado com `company_id` do admin que enviou o convite

---

## Recuperação de Senha

```
POST /auth/forgot-password  { email }
  → gera token único de reset (expira em 1h)
  → envia e-mail com link: /reset-password?token=xxx

POST /auth/reset-password  { token, new_password }
  → valida token
  → atualiza senha com bcrypt (salt rounds: 12)
  → invalida token
  → envia e-mail de confirmação
```

---

## Estrutura de Tabelas SQL

```sql
-- Empresas
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  plan_expires_at TIMESTAMPTZ,
  email VARCHAR(255) NOT NULL,
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuários
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'operator'
    CHECK (role IN ('super_admin','admin','supervisor','operator','agent_configurator')),
  is_active BOOLEAN DEFAULT true,
  email_verified_at TIMESTAMPTZ,
  avatar_url TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, email)
);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tokens de convite/reset
CREATE TABLE auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  type VARCHAR(50) CHECK (type IN ('invite','password_reset','email_verify')),
  token TEXT NOT NULL UNIQUE,
  email VARCHAR(255),
  role VARCHAR(50),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

---

## Endpoints da API

```
POST   /auth/register          → cadastro de empresa + admin
POST   /auth/login             → autenticação
POST   /auth/refresh           → renovar access token
POST   /auth/logout            → invalidar refresh token
POST   /auth/forgot-password   → solicitar reset de senha
POST   /auth/reset-password    → redefinir senha com token
GET    /auth/verify-email      → verificar e-mail com token
POST   /auth/invite            → convidar usuário (admin)
POST   /auth/accept-invite     → aceitar convite e definir senha

GET    /users                  → listar usuários da empresa (admin/supervisor)
GET    /users/:id              → buscar usuário
POST   /users                  → criar usuário diretamente (admin)
PUT    /users/:id              → editar usuário
DELETE /users/:id              → desativar usuário
```
