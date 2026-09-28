# scripts/

Scripts avulsos que sobraram da instalação antiga. **Para instalar ou gerenciar o AtendIA num servidor, use `install/`** (veja `install/GUIA-INSTALACAO.md`) e o comando `sudo atendia`.

| Arquivo | Para que serve |
|---|---|
| `hotfix-vps.sql` | Correções manuais de tabelas na VPS antiga (anterior às migrations completas). Só use se orientado. |
| `vps-fix-db.sh` | Renomeia/cria tabelas faltantes na VPS antiga. Legado: instalações novas rodam as migrations sozinhas no start. |
| `seed-admin.ts` | Cria o cupom de teste `BEMVINDO`. O administrador agora é criado pelo instalador (`create-admin`). |

## Desenvolvimento local

Os scripts antigos presos a esta máquina Windows (portproxy do WSL2, caminhos fixos, senha fixa no seed) foram removidos. Agora:

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres + Redis em 127.0.0.1
npm run dev                                      # backend (3001) + frontend (5173)
```

No Windows com WSL2, rode o `docker compose` dentro do WSL. Se o Windows não alcançar `localhost:5432`, suba com `DEV_BIND=0.0.0.0` e use o IP do WSL (`wsl hostname -I`) no `DATABASE_URL`.
