# Correção da Conexão SSH — Acesse a VPS Real da Oracle Cloud

## Problema
Você está conectado a um ambiente do Windows (MSYS2/Git Bash) em vez da VPS real da Oracle Cloud. Isso é evidente porque:

- O PATH contém diretórios do Windows (`C:\Windows`, `C:\Program Files`)
- Comandos Linux como `sudo`, `ls /etc/os-release` não funcionam corretamente
- O sistema mostra `MINGW64_NT-10.0-19044` (Windows 10)

Isso impede a instalação do AtendIA, pois o script `atendia-install.sh` precisa rodar em um sistema Ubuntu real.

## Solução
Siga estes passos exatamente:

### 1. Feche todos os terminais abertos
- Feche o Git Bash, PowerShell, CMD ou qualquer outro terminal que você está usando.

### 2. Abra o **Prompt de Comando (cmd.exe)** ou o **PowerShell** do Windows
- Pressione `Win + R`, digite `cmd` e pressione Enter.
- **NÃO use o Git Bash, WSL ou qualquer outro terminal alternativo.**

### 3. Execute o comando SSH correto
Copie e cole exatamente este comando no Prompt de Comando:

```cmd
ssh -i "C:/Users/Eliane F Camargo/Downloads/ssh-key-2026-06-14.key" ubuntu@163.176.211.167
```

- Pressione Enter
- Se pedir confirmação de chave, digite `yes` e pressione Enter
- Não digite nenhuma senha — a chave privada faz a autenticação automaticamente

### 4. Verifique que você está na VPS real
Após conectar, você deverá ver:

```
Welcome to Ubuntu 24.04.4 LTS (GNU/Linux 6.17.0-1011-oracle aarch64)
ubuntu@atendia:~$
```

Agora, teste com estes comandos:

```bash
sudo -V
ls /etc/os-release
uname -a
```

Todos devem funcionar e mostrar informações do Ubuntu Linux.

### 5. Execute a instalação
Agora que você está na VPS correta, execute:

```bash
cd ~
sudo ~/Atendia/deploy/atendia-install.sh
```

O script irá:
- Instalar Docker e Docker Compose
- Configurar firewall e SSL
- Subir todos os containers
- Criar o usuário admin
- Configurar backup automático

## Importante
- **Nunca use Git Bash, WSL ou outro terminal alternativo** para conectar à VPS da Oracle Cloud
- Apenas use o **Prompt de Comando (cmd.exe)** ou **PowerShell** padrão do Windows
- A chave SSH está correta — o problema é apenas o cliente SSH usado

Após seguir esses passos, o AtendIA será implantado com sucesso na VPS."

Você pode copiar esse arquivo e usá-lo como guia enquanto executa os passos.