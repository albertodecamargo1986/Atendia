# Guia de instalação do AtendIA (para quem nunca mexeu com servidor)

Este guia coloca o AtendIA no ar **de graça**, num servidor do Google Cloud, em mais ou menos **40 minutos**.
Você não precisa instalar nada no seu computador: tudo é feito pelo navegador.

**O que você vai precisar:**

- Uma conta Google (Gmail).
- Um cartão de crédito (o Google pede para confirmar a identidade; seguindo este guia, **não há cobrança**).
- O celular com o WhatsApp que vai atender os clientes.

**Resumo do caminho:**

1. Criar a conta no Google Cloud
2. Criar o servidor (a "máquina virtual")
3. Fixar o endereço IP
4. Abrir o terminal do servidor e colar **um comando**
5. Responder 5 perguntas
6. Entrar no painel e conectar o WhatsApp

---

## Quanto custa? (nível gratuito do Google Cloud)

| Item | Limite gratuito | O que usamos |
|---|---|---|
| Servidor e2-micro (2 vCPU compartilhadas, 1 GB de RAM) | 1 por mês, **só nas regiões us-east1, us-central1 ou us-west1** | 1 servidor |
| Disco "permanente padrão" | 30 GB por mês | 30 GB |
| Tráfego de saída da internet | 1 GB por mês (exceto China e Austrália) | Textos gastam pouquíssimo; fotos/áudios/vídeos gastam mais |
| Instalador, AtendIA, Docker, HTTPS (Let's Encrypt), DuckDNS | Grátis | — |
| Chave de IA (OpenAI/Anthropic) | **Paga à parte**, direto no site da OpenAI/Anthropic, por uso | Depende do volume de conversas |

Como não levar susto:

- Escolha **exatamente** o que o guia manda (região, tipo e2-micro, disco **padrão**). Um detalhe diferente (ex.: disco "balanceado") gera cobrança.
- Crie um **alerta de orçamento** (passo 1.4): o Google avisa por e-mail se algum centavo começar a ser cobrado.
- Tráfego acima de 1 GB/mês é cobrado (centavos de dólar por GB). Para teste e uso leve, não chega nisso.
- Um IP estático **sem servidor ligado a ele** é cobrado. Se um dia apagar o servidor, libere o IP também.

**Limites práticos do servidor gratuito:** ele é pequeno. Serve bem para testes e para uma empresa pequena
(1 a 2 números de WhatsApp, poucos atendentes). Ele fica um pouco lento nos primeiros minutos após ligar e ao atualizar — é normal.

---

## Passo 0 (só uma vez, feito pelo dono do repositório no GitHub)

O instalador baixa o sistema **já pronto** do GitHub (o servidor gratuito é pequeno demais para montar o sistema sozinho).
Por isso, antes da primeira instalação:

1. Abra `https://github.com/albertodecamargo1986/Atendia/actions` e confira se o processo
   **"Publicar imagens Docker (GHCR)"** terminou com ✅ verde. (Ele roda sozinho a cada atualização na branch `main`.
   Se nunca rodou, clique nele → **Run workflow**.)
2. Torne os pacotes **públicos** (para o servidor baixar sem senha):
   1. Abra `https://github.com/albertodecamargo1986?tab=packages`
   2. Clique em **atendia-backend** → **Package settings** (lado direito, embaixo)
   3. Role até **Danger Zone** → **Change visibility** → escolha **Public** → digite o nome do pacote → confirme
   4. Repita para **atendia-web**

> Se preferir deixar os pacotes privados, veja a seção [Se o repositório ou as imagens forem privados](#se-o-repositório-ou-as-imagens-forem-privados).

---

## Passo 1 — Criar a conta no Google Cloud

1. Acesse **https://cloud.google.com/free** e clique em **Comece a usar gratuitamente**.
2. Entre com sua conta Google.
3. Escolha o país **Brasil**, aceite os termos e preencha os dados.
4. Informe o cartão de crédito. O Google faz uma verificação (pode aparecer uma cobrança temporária pequena que é estornada).
   Você ganha também um crédito de avaliação por 90 dias; o nível gratuito do e2-micro continua **depois** disso.
5. **Alerta de orçamento (recomendado):** no menu ☰ → **Faturamento** → **Orçamentos e alertas** → **Criar orçamento**
   → valor **R$ 5** → alertas em 50%, 90% e 100% → **Concluir**. Assim você recebe um e-mail se algo começar a ser cobrado.

### 1.1 Criar um projeto

1. No topo da página, clique no seletor de projeto (ao lado do logotipo "Google Cloud") → **Novo projeto**.
2. Nome: `atendia` → **Criar**. Confirme que o projeto `atendia` está selecionado no topo.

### 1.2 Ativar o Compute Engine

1. Menu ☰ → **Compute Engine** → **Instâncias de VM**.
2. Se aparecer o botão **Ativar** (API do Compute Engine), clique e aguarde 1 a 2 minutos.

---

## Passo 2 — Criar o servidor (máquina virtual)

Em **Compute Engine → Instâncias de VM**, clique em **Criar instância** e preencha **exatamente** assim:

| Campo | O que escolher |
|---|---|
| **Nome** | `atendia` |
| **Região** | **us-east1 (Carolina do Sul)** — a mais perto do Brasil. (us-central1 e us-west1 também são gratuitas; **nenhuma outra é**.) |
| **Zona** | qualquer uma (ex.: us-east1-b) |
| **Configuração da máquina** | Série **E2** → Tipo de máquina **e2-micro (2 vCPU, 1 GB de memória)** |
| **Disco de inicialização** → **Alterar** | Sistema operacional **Ubuntu** → Versão **Ubuntu 24.04 LTS** (x86/64, *não* "Arm64") → Tipo de disco **Disco permanente padrão** (⚠️ **não** "balanceado") → Tamanho **30 GB** → **Selecionar** |
| **Firewall** (em algumas telas fica na aba **Rede**) | ✅ **Permitir tráfego HTTP** e ✅ **Permitir tráfego HTTPS** |

No lado direito a estimativa de preço deve mencionar o **nível gratuito** (ou mostrar um valor que será coberto por ele).
Clique em **Criar** e aguarde a bolinha verde ✅ aparecer ao lado do nome (1 a 2 minutos).

---

## Passo 3 — Fixar o endereço IP (para ele não mudar)

Por padrão o IP do servidor pode mudar quando ele reinicia. Vamos fixá-lo:

1. Menu ☰ → **Rede VPC** → **Endereços IP**.
2. Na linha do IP **Externo** usado pela VM `atendia`, clique nos três pontinhos ⋮ → **Promover para endereço IP estático**
   (em algumas telas: **Reservar**). Dê o nome `atendia-ip` → **Reservar**.
3. Anote esse número (ex.: `34.123.45.67`). **Esse é o endereço do seu sistema.**

> Lembrete: IP reservado ligado ao servidor = ok. Se um dia apagar o servidor, apague também o IP (IP parado é cobrado).

---

## Passo 4 — Abrir o terminal e instalar

1. Volte em **Compute Engine → Instâncias de VM**.
2. Na linha da VM `atendia`, clique no botão **SSH**. Uma janela preta (terminal) abre no navegador.
   Se pedir autorização, clique em **Autorizar**.
3. Copie o comando abaixo, cole na janela preta (**Ctrl+V** ou clique com o botão direito → Colar) e aperte **Enter**:

```bash
curl -fsSL https://raw.githubusercontent.com/albertodecamargo1986/Atendia/main/install/install.sh | sudo bash
```

O instalador vai sozinho:

- verificar o servidor;
- criar **2 GB de memória extra (swap)** — essencial no servidor de 1 GB;
- instalar o Docker;
- conferir o firewall (e avisar se faltar marcar HTTP/HTTPS no Google Cloud);
- baixar o AtendIA em `/opt/atendia`.

### As 5 perguntas

Use as setas / **Tab** para mudar de campo e **Enter** para confirmar.

1. **Nome da empresa** — como vai aparecer no painel.
2. **E-mail do administrador** — é o seu **login** no painel.
3. **Senha do administrador** — mínimo 8 caracteres, com maiúscula, minúscula e número.
   **Aperte Enter sem digitar nada** para o instalador criar uma senha forte (ela aparece no final).
4. **Domínio (opcional)** — se ainda não tem, **só aperte Enter**. O sistema funciona pelo IP e você adiciona domínio depois.
5. **Chave da OpenAI (opcional)** — pode apertar Enter e configurar depois pelo painel.

Confirme o resumo com **Sim**. Em 3 a 10 minutos aparece a tela final:

```
AtendIA instalado com sucesso!

  Endereço do painel:  http://34.123.45.67
  E-mail (login):      voce@exemplo.com
  Senha:               Xk3mP9...
```

**Anote a senha.** Ela também fica guardada no servidor; para ver de novo: `sudo cat /root/atendia-credenciais.txt`

---

## Passo 5 — Primeiro acesso

1. No navegador (computador ou celular), abra o endereço mostrado: `http://SEU_IP` (ex.: `http://34.123.45.67`).
   - O navegador vai mostrar "Não seguro" — é normal enquanto não houver domínio com HTTPS.
2. Entre com o e-mail e a senha.
3. Siga o **assistente de configuração** que aparece na tela (dados da empresa, WhatsApp, chave de IA, primeiro agente, horário).

### Conectar o WhatsApp

1. No painel, vá em **WhatsApp** → **Conectar** (ou pelo assistente). Um **QR Code** aparece.
2. No celular: abra o WhatsApp → **⋮ (Android)** ou **Configurações (iPhone)** → **Aparelhos conectados** → **Conectar um aparelho**.
3. Aponte a câmera para o QR Code. Em alguns segundos aparece **Conectado**.
4. Mande uma mensagem de outro celular para esse número e veja a resposta chegar no painel.

> O QR Code expira em poucos segundos e é renovado sozinho. Se demorar, clique em **Gerar novo QR**.

---

## Depois: adicionar um domínio grátis com HTTPS (cadeado)

Com um domínio o endereço fica bonito (`https://minhaempresa.duckdns.org`), com cadeado, e o Mercado Pago passa a funcionar (ele exige HTTPS).

1. Acesse **https://www.duckdns.org** e entre com sua conta Google.
2. Em **sub domain**, digite um nome (ex.: `minhaempresa`) → **add domain**.
3. No campo **current ip** desse domínio, coloque o **IP do seu servidor** → **update ip**.
4. Confirme que no Google Cloud a VM tem ✅ **Permitir tráfego HTTPS** (Instâncias de VM → `atendia` → **Editar** → Firewall).
5. Abra o terminal SSH do servidor e rode:

```bash
sudo atendia config
```

6. Escolha **Domínio + HTTPS**, digite `minhaempresa.duckdns.org` e o e-mail. O sistema testa se o domínio já aponta para o servidor,
   emite o certificado sozinho e mostra o novo endereço. Pronto: acesse `https://minhaempresa.duckdns.org`.

> Depois disso, o acesso pelo IP deixa de funcionar — use sempre o domínio.
> Para voltar a usar só o IP: `sudo atendia config` → **Voltar a usar só o IP**.

Pelo mesmo menu (`sudo atendia config`) você também configura: **chaves de IA** (OpenAI/Anthropic), **e-mail de envio (SMTP)**,
**Mercado Pago** (mostra a URL de webhook para cadastrar) e **troca da senha do administrador**.

Atalho sem menu: `sudo atendia dominio minhaempresa.duckdns.org voce@gmail.com`.

### Adicionar domínio depois (pelo painel)

Não quer abrir o terminal? Dá para fazer tudo pelo navegador:

1. Faça os passos 1 a 4 acima (criar o domínio no DuckDNS com o IP do servidor e liberar HTTPS no Google Cloud).
2. No painel, entre como administrador da plataforma e abra **Administração › Domínio e HTTPS**.
   A tela mostra o IP do servidor e o passo a passo do DuckDNS (ou de um domínio próprio com registro **A**).
3. Digite o domínio e o e-mail e clique em **Verificar DNS**. Se aparecer "aponta para este servidor", clique em **Aplicar domínio**.
4. Em até 1 minuto o servidor aplica sozinho. O painel fica **fora do ar por cerca de 1 minuto** e depois passa a abrir em
   `https://minhaempresa.duckdns.org` (entre de novo com seu e-mail e senha).
5. Se o cadeado não for emitido em 3 minutos, o sistema **volta sozinho para o endereço anterior** e mostra o motivo na mesma tela.

> Se o painel disser que o servidor "não está preparado", rode `sudo atendia update`. Isso cria a pasta
> `/opt/atendia/control` e a tarefa automática que aplica o pedido.
> Registro do que aconteceu: `sudo tail -n 50 /var/log/atendia-domain.log`.

---

## Backups e atualizações

- **Backup automático:** todo dia às **03:00 do horário do servidor** (no Google Cloud o relógio é UTC, ou seja, **meia-noite no horário de Brasília**).
  Ficam os **7 mais recentes** em `/opt/atendia/backups`. Cada arquivo contém o banco de dados, as sessões do WhatsApp, os anexos e a configuração.
- **Backup na hora:** `sudo atendia backup`
- **Restaurar:** `sudo atendia restore` (lista os backups) e depois `sudo atendia restore atendia-backup-AAAAMMDD-HHMMSS.tar`
  (pede para digitar **RESTAURAR**; antes faz um backup de segurança do estado atual).
- **Guardar uma cópia fora do servidor (recomendado de vez em quando):**
  ```bash
  sudo cp /opt/atendia/backups/atendia-backup-*.tar ~ && sudo chown $USER ~/atendia-backup-*.tar
  ```
  Depois, na janela SSH, clique na engrenagem ⚙️ (ou em **Fazer o download do arquivo**) e informe o caminho do arquivo
  (ex.: `/home/SEU_USUARIO/atendia-backup-20260101-030000.tar`). Apague a cópia da pasta pessoal depois (`rm ~/atendia-backup-*.tar`).
- **Atualizar para a versão mais nova:** `sudo atendia update` (faz backup antes, baixa a versão nova e reinicia; o WhatsApp reconecta sozinho).

### Comandos úteis

| Comando | Para que serve |
|---|---|
| `sudo atendia status` | Situação dos serviços, uso de memória e disco, endereço |
| `sudo atendia info` | Endereço, e-mail do admin e onde estão as credenciais |
| `sudo atendia logs` | Ver o que o sistema está fazendo (Ctrl+C para sair). `sudo atendia logs web` = servidor web |
| `sudo atendia restart` | Reiniciar tudo |
| `sudo atendia stop` / `start` | Parar / iniciar |
| `sudo atendia config` | Domínio/HTTPS, IA, e-mail, Mercado Pago, senha |
| `sudo atendia dominio <domínio> [e-mail]` | Aplicar um domínio com HTTPS direto (sem menu) |
| `sudo atendia senha-admin` | Trocar a senha do administrador |
| `sudo atendia desinstalar` | Remover tudo (pede confirmação dupla; guarda os backups em `/root/atendia-backups`) |

---

## Solução de problemas

**O site não abre (fica carregando ou "não foi possível acessar")**
1. No Google Cloud: Instâncias de VM → `atendia` → **Editar** → marque ✅ **Permitir tráfego HTTP** e ✅ **HTTPS** → **Salvar**.
2. Confira se está usando `http://` (e não `https://`) quando ainda não há domínio.
3. No terminal: `sudo atendia status`. Se algum serviço não estiver "running", rode `sudo atendia restart`.

**Está lento**
Normal no servidor gratuito, principalmente logo depois de ligar ou atualizar (1 a 3 minutos). Veja `sudo atendia status`:
se a memória (RAM + swap) estiver quase toda usada, reinicie com `sudo atendia restart`.
Com muitos atendentes/números, considere um servidor com 2 GB de RAM.

**Esqueci a senha do painel**
No terminal: `sudo atendia senha-admin` (aperte Enter para gerar uma nova) ou veja a original com
`sudo cat /root/atendia-credenciais.txt`.

**O WhatsApp desconectou**
No painel → **WhatsApp** → **Reconectar** e leia o QR de novo. Se o celular ficar muitos dias sem internet, o WhatsApp desconecta os aparelhos vinculados.

**O domínio/HTTPS não funciona**
- O DuckDNS precisa estar com o IP **atual** do servidor (confira em duckdns.org).
- A VM precisa de ✅ **Permitir tráfego HTTPS**.
- Veja o motivo em `sudo atendia logs web`. O servidor tenta emitir o certificado de novo sozinho.

**A instalação parou com erro**
Leia a mensagem na tela e o log: `sudo tail -n 80 /var/log/atendia-install.log`.
Depois é só **colar o comando de instalação de novo** — o instalador continua de onde parou e **reaproveita** as senhas já criadas.

**"Não consegui baixar as imagens prontas"**
As imagens ainda não foram publicadas ou estão privadas — veja o [Passo 0](#passo-0-só-uma-vez-feito-pelo-dono-do-repositório-no-github).

**Mudei de IP (servidor recriado)**
`sudo atendia config` → **Voltar a usar só o IP** (atualiza o endereço). Se usa DuckDNS, atualize o IP lá também.

---

## Outras VPS (Oracle Cloud Free, Hetzner, Contabo, DigitalOcean...)

O mesmo comando funciona em qualquer servidor com **Ubuntu 22.04/24.04 ou Debian 12**, processador **x86 (amd64) ou ARM (arm64)**,
**1 GB de RAM ou mais** e 10 GB+ de disco livre:

```bash
curl -fsSL https://raw.githubusercontent.com/albertodecamargo1986/Atendia/main/install/install.sh | sudo bash
```

- **Oracle Cloud (Always Free, ARM Ampere até 24 GB):** além do servidor (o instalador libera o iptables sozinho),
  abra as portas **80 e 443** no painel: Networking → Virtual Cloud Networks → sua VCN → Security Lists → Default →
  **Add Ingress Rules** (Source CIDR `0.0.0.0/0`, TCP, portas `80` e depois `443`).
- **Hetzner / Contabo / DigitalOcean:** se o painel tiver firewall próprio, libere as portas 22, 80 e 443.
- Servidores com 2 GB+ de RAM ficam bem mais rápidos; o instalador só cria swap quando a RAM é menor que 2 GB.

---

## Se o repositório ou as imagens forem privados

Hoje o repositório é **público** e o comando acima funciona direto. Se ele virar privado:

1. Crie um token no GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**,
   marcando **repo** (ler o código) e **read:packages** (baixar as imagens). Copie o token.
2. No servidor, rode (troque `SEU_TOKEN`):

```bash
curl -fsSL -H "Authorization: token SEU_TOKEN" \
  https://raw.githubusercontent.com/albertodecamargo1986/Atendia/main/install/install.sh \
  | sudo ATENDIA_GITHUB_TOKEN=SEU_TOKEN ATENDIA_GHCR_TOKEN=SEU_TOKEN bash
```

O token do código fica guardado só para o root (`/root/.atendia-git-credentials`), para que `sudo atendia update` continue funcionando.
Se só as **imagens** forem privadas, o instalador pergunta usuário e token na hora (ou torne os pacotes públicos — [Passo 0](#passo-0-só-uma-vez-feito-pelo-dono-do-repositório-no-github)).

---

## Instalação sem perguntas (avançado)

```bash
curl -fsSL https://raw.githubusercontent.com/albertodecamargo1986/Atendia/main/install/install.sh | sudo \
  ATENDIA_NONINTERACTIVE=1 ATENDIA_ADMIN_EMAIL=voce@exemplo.com ATENDIA_COMPANY="Minha Empresa" \
  ATENDIA_DOMAIN= ATENDIA_OPENAI_KEY= bash
```

Variáveis aceitas: `ATENDIA_DOMAIN`, `ATENDIA_ADMIN_EMAIL`, `ATENDIA_ADMIN_PASSWORD` (vazio = gera), `ATENDIA_COMPANY`,
`ATENDIA_OPENAI_KEY`, `ATENDIA_NONINTERACTIVE=1`, `ATENDIA_DIR` (padrão `/opt/atendia`), `ATENDIA_BRANCH` (padrão `main`).
