# scripts/

Não há mais scripts de instalação aqui. **Para instalar ou gerenciar o AtendIA num servidor, use `install/`** (veja `install/GUIA-INSTALACAO.md`) e o comando `sudo atendia`.

Os remendos da VPS antiga (`hotfix-vps.sql`, `vps-fix-db.sh`) e o `seed-admin.ts` foram removidos: as migrations completas rodam sozinhas no start do backend, o cupom `BEMVINDO` é criado pelo seed/`create-admin`, e o administrador é criado pelo instalador.

## Desenvolvimento local

Os scripts antigos presos a esta máquina Windows (portproxy do WSL2, caminhos fixos, senha fixa no seed) foram removidos. Agora:

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis em 127.0.0.1
npm run dev                                      # backend (3001) + frontend (5173)
```

No Windows com WSL2, rode o `docker compose` dentro do WSL. Se o Windows não alcançar `localhost:5432`, suba com `DEV_BIND=0.0.0.0` e use o IP do WSL (`wsl hostname -I`) no `DATABASE_URL`.
