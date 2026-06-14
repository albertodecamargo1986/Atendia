# ============================================================
# Script de instalacao WSL2 + Docker Engine para AtendIA
# RODE COMO ADMINISTRADOR!
# ============================================================

Write-Host "=== Passo 1: Instalando WSL + Ubuntu ===" -ForegroundColor Cyan
wsl --install -d Ubuntu --no-launch
Write-Host "Aguardando WSL estabilizar..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "=== Passo 2: Configurando usuario e Docker dentro do Ubuntu ===" -ForegroundColor Cyan

# Comandos que serao executados dentro do WSL
$wslSetup = @"
# Criar usuario albertodecamargo com senha
useradd -m -s /bin/bash albertodecamargo
echo 'albertodecamargo:12345678' | chpasswd
usermod -aG sudo albertodecamargo

# Atualizar pacotes
apt-get update && apt-get upgrade -y

# Instalar pre-requisitos do Docker
apt-get install -y ca-certificates curl gnupg

# Adicionar chave GPG do Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Adicionar repositorio do Docker
echo "deb [arch=`$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu `$(. /etc/os-release && echo `"`$VERSION_CODENAME`") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine + Compose
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Adicionar usuario ao grupo docker
usermod -aG docker albertodecamargo

# Habilitar inicio automatico do Docker
systemctl enable docker

# Verificacao
echo '=== VERIFICACAO ==='
docker --version
docker compose version

echo '=== INSTALACAO CONCLUIDA ==='
"@

# Executar como root dentro do WSL
$wslSetup | wsl -d Ubuntu -u root -- bash -

Write-Host ""
Write-Host "=== Passo 3: Definindo usuario padrao ===" -ForegroundColor Cyan
# Definir albertodecamargo como usuario default do Ubuntu
$ubuntuPath = (Get-ChildItem "$env:LOCALAPPDATA\Packages\" -Directory | Where-Object { $_.Name -like "CanonicalGroupLimited.Ubuntu*" } | Select-Object -First 1).FullName
if ($ubuntuPath) {
    $configPath = "$ubuntuPath\LocalState\wsl.conf"
    @"
[user]
default=albertodecamargo
"@ | Set-Content -Path $configPath -Encoding UTF8
    Write-Host "Usuario padrao definido como albertodecamargo" -ForegroundColor Green
} else {
    Write-Host "Nao encontrei o caminho do Ubuntu para definir usuario padrao." -ForegroundColor Yellow
    Write-Host "Voce pode definir manualmente rodando no WSL:" -ForegroundColor Yellow
    Write-Host "  echo '[user]' | sudo tee /etc/wsl.conf && echo 'default=albertodecamargo' | sudo tee -a /etc/wsl.conf" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== CONCLUIDO! ===" -ForegroundColor Green
Write-Host "Para usar Docker, abra um terminal e rode:" -ForegroundColor Cyan
Write-Host "  wsl -d Ubuntu" -ForegroundColor White
Write-Host "  docker ps" -ForegroundColor White
