# Instalação do AtendIA

**Passo a passo completo, para quem nunca mexeu com servidor:** [GUIA-INSTALACAO.md](GUIA-INSTALACAO.md)

Resumo para quem já tem um servidor Ubuntu 22.04/24.04 ou Debian 12 (1 GB de RAM ou mais):

```bash
curl -fsSL https://raw.githubusercontent.com/albertodecamargo1986/Atendia/main/install/install.sh | sudo bash
```

Depois de instalado:

```bash
sudo atendia status        # situação do sistema
sudo atendia config        # domínio + HTTPS, chaves de IA, e-mail, Mercado Pago
sudo atendia               # lista todos os comandos
```

| Arquivo | O que é |
|---|---|
| `install.sh` | Instalador (Docker, swap, firewall, configuração, admin, backup diário) |
| `atendia` | Comando de gestão, instalado em `/usr/local/bin/atendia` |
| `GUIA-INSTALACAO.md` | Guia para leigos (Google Cloud gratuito, domínio grátis, problemas comuns) |
