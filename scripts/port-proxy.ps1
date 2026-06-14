# AtendIA — Port Proxy Setup (rodar como Administrador)
# Redireciona portas do Windows para os containers Docker no WSL2

# Descobrir IPs dos containers
Write-Host "Configurando port forwarding para Docker WSL2..."

# PostgreSQL
netsh interface portproxy add v4tov4 listenport=5432 listenaddress=127.0.0.1 connectport=5432 connectaddress=172.19.0.5

# Redis
netsh interface portproxy add v4tov4 listenport=6379 listenaddress=127.0.0.1 connectport=6379 connectaddress=172.19.0.3

# Verificar
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "Port forwarding configurado!"
Write-Host "PostgreSQL: localhost:5432 -> 172.19.0.5:5432"
Write-Host "Redis:      localhost:6379 -> 172.19.0.3:6379"
Write-Host ""
Write-Host "Para remover depois:"
Write-Host "  netsh interface portproxy delete v4tov4 listenport=5432 listenaddress=127.0.0.1"
Write-Host "  netsh interface portproxy delete v4tov4 listenport=6379 listenaddress=127.0.0.1"
