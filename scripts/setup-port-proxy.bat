@echo off
echo ============================================
echo   AtendIA - Configurar acesso ao Docker
echo   (Execute como Administrador)
echo ============================================
echo.

:: Obter IPs dos containers Docker
for /f "tokens=*" %%i in ('wsl -d Ubuntu -- bash -c "docker inspect atendia-postgres-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"') do set PG_IP=%%i
for /f "tokens=*" %%i in ('wsl -d Ubuntu -- bash -c "docker inspect atendia-redis-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"') do set REDIS_IP=%%i

echo PostgreSQL IP: %PG_IP%
echo Redis IP:      %REDIS_IP%
echo.

:: Configurar port proxy
netsh interface portproxy add v4tov4 listenport=5432 listenaddress=127.0.0.1 connectport=5432 connectaddress=%PG_IP%
netsh interface portproxy add v4tov4 listenport=6379 listenaddress=127.0.0.1 connectport=6379 connectaddress=%REDIS_IP%

echo.
echo Port forwarding configurado!
echo PostgreSQL: localhost:5432 -^> %PG_IP%:5432
echo Redis:      localhost:6379 -^> %REDIS_IP%:6379
echo.

:: Adicionar regra de firewall
netsh advfirewall firewall add rule name="AtendIA Docker PostgreSQL" dir=in action=allow protocol=TCP localport=5432
netsh advfirewall firewall add rule name="AtendIA Docker Redis" dir=in action=allow protocol=TCP localport=6379

echo Firewall configurado!
echo.
echo Digite qualquer tecla para sair...
pause >nul
