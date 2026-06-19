# Como Recriar a VPS da Oracle Cloud para Instalar o AtendIA

## Problema
O sistema da VPS está corrompido. Apesar de aparecer como Ubuntu 24.04, arquivos essenciais como `/usr/bin/sudo` desapareceram, e o ambiente está em um estado inconsistente. Isso pode ter ocorrido por:

- Erro de configuração durante a criação da instância
- Corrupção de disco
- Alteração não autorizada
- Uso de uma imagem não oficial

A única solução segura é **recriar a instância da VPS**.

## Passo a Passo: Recriar a VPS

### 1. Acesse o Console da Oracle Cloud
- Abra o navegador e acesse: https://cloud.oracle.com
- Faça login com suas credenciais

### 2. Acesse "Compute" > "Instances"
- No menu lateral, clique em "Compute" > "Instances"
- Localize a instância chamada `atendia` (ID: `ocid1.instance.oc1.sa-saopaulo-1.antxeljr246ksgacjl4yjqfshrdm7ao45qwcil3i76tditfg4ehjixf5x3ca`)

### 3. Pare a instância
- Clique na instância `atendia`
- Clique em "Stop" (parar)
- Confirme a parada
- Espere até o status mudar para "Stopped"

### 4. Exclua a instância
- Clique em "Actions" > "Terminate"
- Marque a opção: "Delete boot volume and all attached block volumes"
- Clique em "Terminate Instance"
- Confirme a exclusão

### 5. Crie uma nova instância
- Clique em "Create Instance"
- Preencha os campos:
  - **Name**: `atendia`
  - **Availability Domain**: `AD-1`
  - **Image**: `Canonical Ubuntu 24.04 aarch64`
  - **Shape**: `VM.Standard.A2.Flex`
  - **OCPUs**: `4`
  - **Memory**: `12 GB`
  - **Boot Volume**: `20 GB`
- Em "Networking", selecione a rede `atendia-vcn`
- Em "SSH Keys", selecione "Add SSH Key" e cole a chave pública do seu arquivo `ssh-key-2026-06-14.key.pub`
- Clique em "Create"

### 6. Aguarde a criação
- Espere cerca de 2-5 minutos até o status mudar para "Running"
- Copie o endereço IP público: `163.176.211.167`

### 7. Conecte-se à nova VPS
- Abra o **Prompt de Comando (cmd.exe)** do Windows
- Execute:

```cmd
ssh -i "C:/Users/Eliane F Camargo/Downloads/ssh-key-2026-06-14.key" ubuntu@163.176.211.167
```

- Confirme a chave se solicitado

### 8. Instale o AtendIA
- Agora que o sistema está limpo, execute:

```bash
cd ~
git clone git@github.com:albertodecamargo1986/Atendia.git
sudo ~/Atendia/deploy/atendia-install.sh
```

O script irá instalar Docker, configurar o firewall, subir os containers e finalizar a instalação.

## Importante
- Nunca altere manualmente arquivos do sistema em uma VPS de produção
- Sempre use imagens oficiais da Oracle Cloud
- Mantenha backups dos seus dados e chaves SSH

Após recriar a VPS, o AtendIA será instalado com sucesso em um ambiente limpo e seguro.