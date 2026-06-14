# AtendIA — Dev Local Startup (Windows)
# Configura .env com IP do WSL2 e sobe os servicos
# Uso: powershell -ExecutionPolicy Bypass -File scripts\dev-local.ps1

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " AtendIA — Dev Local Startup" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obter IP do WSL2
Write-Host "[1/4] Detectando IP do WSL2..." -ForegroundColor Yellow
$wslIp = (wsl -d Ubuntu -- bash -c "hostname -I" 2>$null).Trim().Split()[0]
if (-not $wslIp) {
    Write-Host " Erro: Nao conseguiu obter IP do WSL2. Docker esta rodando?" -ForegroundColor Red
    exit 1
}
Write-Host " WSL2 IP: $wslIp" -ForegroundColor Green

# 2. Atualizar .env do backend
Write-Host ""
Write-Host "[2/4] Atualizando .env do backend..." -ForegroundColor Yellow
$envFile = "$ProjectDir\packages\backend\.env"
$envContent = Get-Content $envFile -Raw
$envContent = $envContent -replace 'DATABASE_URL=postgresql://atend:atend@[\d\.]+:5432', "DATABASE_URL=postgresql://atend:atend@${wslIp}:5432"
$envContent = $envContent -replace 'REDIS_URL=redis://[\d\.]+:6379', "REDIS_URL=redis://${wslIp}:6379"
Set-Content $envFile $envContent -NoNewline
Write-Host " DATABASE_URL e REDIS_URL atualizados com IP $wslIp" -ForegroundColor Green

# 3. Verificar Docker
Write-Host ""
Write-Host "[3/4] Verificando Docker..." -ForegroundColor Yellow
$pgReady = wsl -d Ubuntu -- bash -c "docker exec atendia-postgres-1 pg_isready -U atend -d atend_ia 2>/dev/null" 2>$null
if ($pgReady -match "accepting") {
    Write-Host " PostgreSQL OK" -ForegroundColor Green
} else {
    Write-Host " Iniciando Docker..." -ForegroundColor Yellow
    wsl -d Ubuntu -- bash -c "cd /mnt/c/Users/'Eliane F Camargo'/desktop/claude/atendia && docker compose up -d 2>&1"
    Start-Sleep -Seconds 10
    Write-Host " Docker iniciado" -ForegroundColor Green
}

$redisReady = wsl -d Ubuntu -- bash -c "docker exec atendia-redis-1 redis-cli ping 2>/dev/null" 2>$null
if ($redisReady -match "PONG") {
    Write-Host " Redis OK" -ForegroundColor Green
}

# 4. Verificar Prisma + gerar client
Write-Host ""
Write-Host "[4/4] Verificando Prisma..." -ForegroundColor Yellow
Push-Location "$ProjectDir\packages\backend"
npx prisma generate 2>&1 | Select-Object -Last 1
npx prisma migrate status 2>&1 | Select-Object -Last 3
Pop-Location

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Pronto para rodar!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host " Em dois terminais:" -ForegroundColor White
Write-Host "   npm run dev:backend" -ForegroundColor Cyan
Write-Host "   npm run dev:frontend" -ForegroundColor Cyan
Write-Host ""
Write-Host " Login:" -ForegroundColor White
Write-Host "   Email: albertodecamargo@gmail.com" -ForegroundColor Gray
Write-Host "   Senha: admin321" -ForegroundColor Gray
Write-Host ""
