# AtendIA — Guia de Deploy no Oracle Cloud (GRATUITO)

## Visao geral

Voce vai criar uma VM gratuita na Oracle Cloud, copiar o projeto e rodar um script
que configura tudo automaticamente (Docker, banco, SSL).

Tempo estimado: **30 minutos**.

---

## PARTE 1 — Criar conta na Oracle Cloud

1. Acesse: **https://cloud.oracle.com/free**
2. Clique **"Start for Free"**
3. Preencha seus dados (nome, email, endereco)
4. **Cartao de credito**: obrigatorio para verificacao — **NAO COBRA** no free tier
5. Regiao: escolha **"Brazil East (Sao Paulo)"** ou **"US East (Ashburn)"**
6. Aguarde o email de confirmacao e ative a conta (pode demorar ate 30 min)

---

## PARTE 2 — Criar a VM (Compute Instance)

1. No menu lateral: **Compute → Instances**
2. Clique **"Create Instance"**
3. Preencha:

| Campo | Valor |
|-------|-------|
| Name | `atendia-server` |
| Image | **Ubuntu 22.04** (Canonical) |
| Shape | **VM.Standard.A1.Flex** (ARM, Gratuito) |
| OCPU | **4** |
| Memory | **12 GB** (ou 24 GB se disponivel) |
| Boot volume | 50 GB (padrao) |

> **IMPORTANTE**: Se a opcao ARM nao aparecer, use **VM.Standard.E2.1.Micro**
> (AMD, 1GB RAM — funciona mas e mais limitado).

4. **SSH Key**: Escolha **"Generate a key pair"** e **BAIXE** a chave privada (.key)
   - Guarde este arquivo — e a unica vez que pode baixar!
5. Clique **"Create"** e aguarde a VM ficar "Running" (2-3 min)

---

## PARTE 3 — Abrir portas no firewall

A Oracle Cloud tem DUAS camadas de firewall. Abrir em ambas:

### 3a. Security List (Virtual Cloud Network)

1. Menu: **Networking → Virtual Cloud Networks**
2. Clique na VCN criada automaticamente
3. Lateral: **Security Lists** → clique a lista default
4. **"Add Ingress Rules"** — adicione estas regras:

| Source | Protocol | Dest Port | Descricao |
|--------|----------|-----------|-----------|
| 0.0.0.0/0 | TCP | 80 | HTTP |
| 0.0.0.0/0 | TCP | 443 | HTTPS |
| 0.0.0.0/0 | TCP | 22 | SSH (ja existe) |

### 3b. iptables na VM (Oracle exige liberar tambem la)

Conecte por SSH e rode:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 7 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## PARTE 4 — Conectar na VM via SSH

### No Windows (PowerShell):

```powershell
# Mover a chave baixada para ~/.ssh/
mkdir -Force $env:USERPROFILE\.ssh
copy Downloads\ssh-key-*.key $env:USERPROFILE\.ssh\atendia-oracle.key

# Permissao restrita na chave (obrigatorio no Windows)
icacls $env:USERPROFILE\.ssh\atendia-oracle.key /inheritance:r /grant:r "$env:USERNAME:R"

# Conectar (troque PELO_IP_DA_VM)
ssh -i $env:USERPROFILE\.ssh\atendia-oracle.key ubuntu@PELO_IP_DA_VM
```

> O IP da VM aparece na pagina da Instance → **Public IP Address**

---

## PARTE 5 — Copiar arquivos para a VM

### Opcao A: Copiar do seu computador (recomendado)

No **PowerShell** do seu computador:

```powershell
# Primeiro, buildar o frontend localmente
cd C:\Users\Eliane F Camargo\desktop\claude\atendia\packages\frontend
npm run build

# Copiar projeto inteiro para a VM (troque IP e caminho da chave)
scp -i $env:USERPROFILE\.ssh\atendia-oracle.key -r `
  C:\Users\Eliane F Camargo\desktop\claude\atendia\deploy `
  C:\Users\Eliane F Camargo\desktop\claude\atendia\packages `
  C:\Users\Eliane F Camargo\desktop\claude\atendia\package.json `
  C:\Users\Eliane F Camargo\desktop\claude\atendia\package-lock.json `
  C:\Users\Eliane F Camargo\desktop\claude\atendia\tsconfig.base.json `
  ubuntu@PELO_IP_DA_VM:/tmp/atendia-upload/
```

Depois na VM por SSH:

```bash
sudo mkdir -p /opt/atendia
sudo cp -r /tmp/atendia-upload/* /opt/atendia/
```

### Opcao B: Git clone (se o projeto estiver no GitHub)

Na VM:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/SEU_USER/atendia.git /opt/atendia
cd /opt/atendia/packages/frontend && npm install && npm run build
```

---

## PARTE 6 — Rodar o script de deploy

Conectado na VM por SSH:

```bash
cd /opt/atendia/deploy
chmod +x deploy-oracle.sh
sudo ./deploy-oracle.sh
```

O script vai:
1. Instalar Docker + Certbot
2. Copiar arquivos
3. Gerar secrets JWT automaticamente
4. Perguntar seu dominio (ou usar IP)
5. Subir todos containers (Postgres + Redis + Backend + Nginx)
6. Criar tabelas no banco
7. Configurar SSL (se tiver dominio)

---

## PARTE 7 — Criar usuario admin

Apos o deploy, criar o primeiro usuario:

```bash
cd /opt/atendia
docker compose -f docker-compose.prod.yml exec -T backend sh -c '
  node -e "
    const { PrismaClient } = require(\"@prisma/client\");
    const bcrypt = require(\"bcryptjs\");
    const prisma = new PrismaClient();
    (async () => {
      const tenant = await prisma.tenant.create({ data: { name: \"Minha Empresa\", slug: \"minha-empresa\", plan: \"FREE\" } });
      const hash = await bcrypt.hash(\"admin321\", 10);
      const user = await prisma.user.create({ data: { name: \"Admin\", email: \"admin@minhaempresa.com\", password: hash, role: \"OWNER\", tenantId: tenant.id } });
      console.log(\"Usuario criado!\", user.email);
      await prisma.\$disconnect();
    })();
  "
'
```

---

## PARTE 8 — Acessar o app

Abra no navegador:

- **Com dominio**: `https://seudominio.com`
- **Sem dominio**: `http://PELO_IP_DA_VM`

Login: `admin@minhaempresa.com` / `admin321`

---

## Configurar dominio (opcional)

Se voce tem um dominio (ex: app.seusite.com):

1. No registrar do dominio, crie um **registro A** apontando para o IP da VM
2. Rode o deploy-oracle.sh novamente com o dominio
3. Ele configura SSL automaticamente (cadeado verde)

---

## Comandos uteis na VM

```bash
# Ver logs do backend
cd /opt/atendia && docker compose -f docker-compose.prod.yml logs -f backend

# Ver logs do nginx
cd /opt/atendia && docker compose -f docker-compose.prod.yml logs -f nginx

# Reiniciar backend
cd /opt/atendia && docker compose -f docker-compose.prod.yml restart backend

# Parar tudo
cd /opt/atendia && docker compose -f docker-compose.prod.yml down

# Subir novamente
cd /opt/atendia && docker compose -f docker-compose.prod.yml up -d

# Ver status dos containers
cd /opt/atendia && docker compose -f docker-compose.prod.yml ps

# Ver uso de recursos
docker stats

# Espaco em disco
df -h
```

---

## Renovar SSL

O certificado SSL renova automaticamente via cron. Se precisar renovar manualmente:

```bash
sudo certbot renew
cd /opt/atendia && docker compose -f docker-compose.prod.yml restart nginx
```

---

## Atualizar o app (apos mudancas no codigo)

1. Buildar novo frontend localmente: `cd packages/frontend && npm run build`
2. Copiar dist/ para a VM: `scp -r packages/frontend/dist/ ubuntu@IP:/tmp/`
3. Na VM: `sudo cp -r /tmp/dist/* /opt/atendia/packages/frontend/dist/`
4. Reiniciar nginx: `docker compose -f docker-compose.prod.yml restart nginx`

Se mudou o backend tambem:

```bash
cd /opt/atendia
docker compose -f docker-compose.prod.yml up -d --build backend
```

---

## Limites do Free Tier Oracle

- 4 vCPUs ARM + 24GB RAM (total, pode dividir em ate 4 VMs)
- 200GB block storage
- **NAO EXPIRA** — e gratuito para sempre
- Se a VM ficar **ociosa por muito tempo**, a Oracle pode recupera-la
  - **Solucao**: Mantenha uso minimo (o proprio AtendIA socket.io ja mantem ativa)

---

## Troubleshooting

### "Connection refused" ao acessar o IP
- Verifique Security Lists (porta 80/443 abertas)
- Verifique iptables na VM: `sudo iptables -L INPUT -n`
- Verifique se containers estao rodando: `docker ps`

### SSL falhou
- Confira se o dominio ja propagou (DNS pode demorar ate 24h)
- Teste: `nslookup seudominio.com` — deve retornar o IP da VM
- Tente novamente: `sudo certbot certonly --standalone -d seudominio.com`

### VM lenta
- Se esta em VM.Standard.E2.1.Micro (1GB RAM), pode ser pouco
- Tente criar VM ARM (Ampere) — muito mais puissante e ainda gratis
- Se ARM nao disponivel, tente em outra regiao
