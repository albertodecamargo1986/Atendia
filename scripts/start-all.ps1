# AtendIA — Script Master de Startup
# Execute como Administrador para configurar o portproxy
# Uso: powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  AtendIA — Iniciando o Sistema" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# ── PASSO 1: Docker ──────────────────────────────────────────
Write-Host "[1/5] Subindo Docker (PostgreSQL + Redis)..." -ForegroundColor Yellow
wsl -d Ubuntu -- bash -c "cd /mnt/c/Users/Eliane\ F\ Camargo/Desktop/Claude/AtendIA && docker compose up -d 2>&1"

$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    $pgReady = wsl -d Ubuntu -- bash -c "docker exec atendia-postgres-1 pg_isready -U atend -d atend_ia 2>/dev/null" 2>$null
    if ($pgReady -match "accepting") {
        Write-Host "  PostgreSQL OK" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $waited++
}
if ($waited -ge $maxWait) {
    Write-Host "  PostgreSQL nao respondeu em ${maxWait}s" -ForegroundColor Red
    exit 1
}

$redisReady = wsl -d Ubuntu -- bash -c "docker exec atendia-redis-1 redis-cli ping 2>/dev/null" 2>$null
if ($redisReady -match "PONG") {
    Write-Host "  Redis OK" -ForegroundColor Green
} else {
    Write-Host "  Redis nao respondeu" -ForegroundColor Red
    exit 1
}

# ── PASSO 2: Seed (se necessario) ───────────────────────────
Write-Host ""
Write-Host "[2/5] Verificando seed do banco..." -ForegroundColor Yellow
$userCount = wsl -d Ubuntu -- bash -c "docker exec atendia-postgres-1 psql -U atend -d atend_ia -t -A -c \"SELECT COUNT(*) FROM \\\"User\\\";\"" 2>$null
$userCount = $userCount.Trim()
if ($userCount -eq "0") {
    Write-Host "  Executando seed..." -ForegroundColor Yellow
    wsl -d Ubuntu -- bash -ic "source ~/.nvm/nvm.sh && nvm use 22 && cd /root/atend-ia/packages/backend && DATABASE_URL='postgresql://atend:atend@localhost:5432/atend_ia' npx tsx prisma/seed.ts 2>&1"
    Write-Host "  Seed OK" -ForegroundColor Green
} else {
    Write-Host "  Banco ja tem $userCount usuario(s), pulando seed" -ForegroundColor Green
}

# ── PASSO 3: Portproxy ──────────────────────────────────────
Write-Host ""
Write-Host "[3/5] Configurando portproxy..." -ForegroundColor Yellow
$wslIp = (wsl -d Ubuntu -- bash -c "hostname -I" 2>$null).Trim().Split()[0]
if (-not $wslIp) {
    Write-Host "  Nao conseguiu obter IP do WSL2" -ForegroundColor Red
    exit 1
}
Write-Host "  WSL2 IP: $wslIp" -ForegroundColor Gray

# Verificar se ja esta correto
$currentProxy = netsh interface portproxy show v4tov4 2>$null
if ($currentProxy -match "3000.*$wslIp") {
    Write-Host "  Portproxy ja configurado" -ForegroundColor Green
} else {
    Write-Host "  Atualizando portproxy (requer admin)..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -Wait -ArgumentList "-Command", "netsh interface portproxy reset; netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIp"
    Write-Host "  Portproxy configurado" -ForegroundColor Green
}

# ── PASSO 4: Backend (WSL2) ─────────────────────────────────
Write-Host ""
Write-Host "[4/5] Iniciando backend..." -ForegroundColor Yellow

# Verificar se ja esta rodando
$backendCheck = curl -s http://localhost:3000/health 2>$null
if ($backendCheck -match '"status":"ok"') {
    Write-Host "  Backend ja esta rodando" -ForegroundColor Green
} else {
    # Matar processo antigo se existir
    wsl -d Ubuntu -- bash -c "pkill -f 'tsx.*src/index.ts' 2>/dev/null" 2>$null

    # Garantir que o projeto esta sincronizado
    wsl -d Ubuntu -- bash -c "mkdir -p /root/atend-ia && rsync -a --exclude=node_modules --exclude=.git /mnt/c/Users/Eliane\ F\ Camargo/Desktop/Claude/AtendIA/ /root/atend-ia/ 2>/dev/null" 2>$null

    # Instalar deps se necessario
    if (-not (wsl -d Ubuntu -- bash -c "test -d /root/atend-ia/node_modules && echo OK" 2>$null)) {
        Write-Host "  Instalando dependencias no WSL2..." -ForegroundColor Yellow
        wsl -d Ubuntu -- bash -ic "source ~/.nvm/nvm.sh && nvm use 22 && cd /root/atend-ia && npm install 2>&1 | tail -3" 2>$null
        wsl -d Ubuntu -- bash -ic "source ~/.nvm/nvm.sh && nvm use 22 && cd /root/atend-ia/packages/backend && npx prisma generate --schema=prisma/schema.prisma 2>&1 | tail -2" 2>$null
    }

    # Iniciar backend
    wsl -d Ubuntu -- bash -ic "source ~/.nvm/nvm.sh && nvm use 22 && cd /root/atend-ia/packages/backend && DATABASE_URL='postgresql://atend:atend@localhost:5432/atend_ia' JWT_SECRET='dev-jwt-secret-mude-em-producao-abc123' JWT_REFRESH_SECRET='dev-refresh-secret-mude-em-producao-xyz789' FRONTEND_URL='http://localhost:5173' REDIS_URL='redis://localhost:6379' LOG_LEVEL=info nohup npx tsx src/index.ts > /tmp/atendia-backend.log 2>&1 &" 2>$null

    # Aguardar backend
    $maxWait = 15
    $waited = 0
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 1
        $check = curl -s http://localhost:3000/health 2>$null
        if ($check -match '"status":"ok"') {
            Write-Host "  Backend rodando na porta 3000" -ForegroundColor Green
            break
        }
        $waited++
    }
    if ($waited -ge $maxWait) {
        Write-Host "  Backend nao respondeu em ${maxWait}s" -ForegroundColor Red
        Write-Host "  Log:" -ForegroundColor Gray
        wsl -d Ubuntu -- bash -c "cat /tmp/atendia-backend.log 2>/dev/null | tail -5"
        exit 1
    }
}

# ── PASSO 5: Frontend ───────────────────────────────────────
Write-Host ""
Write-Host "[5/5] Iniciando frontend..." -ForegroundColor Yellow

# Garantir que o .env existe
$frontendEnv = "$ProjectDir\packages\frontend\.env"
if (-not (Test-Path $frontendEnv)) {
    "VITE_API_URL=http://localhost:3000" | Out-File -FilePath $frontendEnv -Encoding utf8
    Write-Host "  Criado packages/frontend/.env" -ForegroundColor Gray
}

# Verificar se ja esta rodando
$frontendCheck = curl -s http://localhost:5173/ 2>$null
if ($frontendCheck -match "DOCTYPE") {
    Write-Host "  Frontend ja esta rodando" -ForegroundColor Green
} else {
    # Matar Vite anterior se existir
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "vite" } | Stop-Process -Force -ErrorAction SilentlyContinue

    Start-Process -FilePath "cmd.exe" -ArgumentList "/k cd /d `"$ProjectDir\packages\frontend`" && npx vite --host 0.0.0.0" -WindowStyle Normal

    $maxWait = 15
    $waited = 0
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 1
        $check = curl -s http://localhost:5173/ 2>$null
        if ($check -match "DOCTYPE") {
            Write-Host "  Frontend rodando na porta 5173" -ForegroundColor Green
            break
        }
        $waited++
    }
    if ($waited -ge $maxWait) {
        Write-Host "  Frontend nao respondeu em ${maxWait}s" -ForegroundColor Red
        exit 1
    }
}

# ── RESUMO ──────────────────────────────────────────────────
Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "  AtendIA esta rodando!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Abrir no navegador: " -NoNewline -ForegroundColor White
Write-Host "http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Credenciais:" -ForegroundColor White
Write-Host "    Email:    albertodecamargo@gmail.com" -ForegroundColor Gray
Write-Host "    Senha:    admin321" -ForegroundColor Gray
Write-Host ""
Write-Host "  Servicos:" -ForegroundColor White
Write-Host "    Backend:   http://localhost:3000" -ForegroundColor Gray
Write-Host "    Frontend:  http://localhost:5173" -ForegroundColor Gray
Write-Host "    Adminer:   http://localhost:8080" -ForegroundColor Gray
Write-Host "    Redis:     http://localhost:8081" -ForegroundColor Gray
Write-Host ""

# Abrir navegador
Start-Process "http://localhost:5173"
