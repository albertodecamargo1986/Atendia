#!/usr/bin/env bash
# =============================================================================
#  AtendIA — Instalador automático para VPS (Ubuntu 22.04/24.04, Debian 12)
#
#  Uso (no terminal SSH do servidor):
#    curl -fsSL https://raw.githubusercontent.com/albertodecamargo1986/Atendia/main/install/install.sh | sudo bash
#
#  Pode rodar de novo quantas vezes quiser: ele reaproveita as senhas/segredos
#  já gerados e só corrige o que faltar.
#
#  Modo sem perguntas (automação), exemplo:
#    curl -fsSL .../install.sh | sudo ATENDIA_NONINTERACTIVE=1 \
#      ATENDIA_ADMIN_EMAIL=voce@exemplo.com ATENDIA_COMPANY="Minha Loja" bash
#  Variáveis aceitas: ATENDIA_DOMAIN, ATENDIA_ADMIN_EMAIL, ATENDIA_ADMIN_PASSWORD,
#    ATENDIA_COMPANY, ATENDIA_OPENAI_KEY, ATENDIA_NONINTERACTIVE=1,
#    ATENDIA_DIR (padrão /opt/atendia), ATENDIA_BRANCH (padrão main),
#    ATENDIA_GITHUB_TOKEN (só se o repositório for privado),
#    ATENDIA_GHCR_USER / ATENDIA_GHCR_TOKEN (só se as imagens forem privadas).
# =============================================================================
set -Eeuo pipefail

# ----------------------------------------------------------------------------
# Configuração
# ----------------------------------------------------------------------------
ATENDIA_REPO="${ATENDIA_REPO:-albertodecamargo1986/Atendia}"
ATENDIA_BRANCH="${ATENDIA_BRANCH:-main}"
ATENDIA_DIR="${ATENDIA_DIR:-/opt/atendia}"
LOG_FILE="/var/log/atendia-install.log"
CRED_FILE="/root/atendia-credenciais.txt"
CLI_PATH="/usr/local/bin/atendia"
GIT_CRED_FILE="/root/.atendia-git-credentials"
HEALTH_TIMEOUT="${ATENDIA_HEALTH_TIMEOUT:-180}"

NONINTERACTIVE="${ATENDIA_NONINTERACTIVE:-0}"
HAS_TTY=0
USE_WHIPTAIL=0
CURRENT_STEP="início"
TOTAL_STEPS=12

# Preenchidas durante a execução
OS_ID="" OS_VERSION="" ARCH="" RAM_MB=0 SWAP_MB=0
IS_GCP=0 IS_ORACLE=0 GCP_MISSING_TAGS=""
PUBLIC_IP="" DOMAIN="" COMPANY="" ADMIN_EMAIL="" ADMIN_PASSWORD="" OPENAI_KEY=""
PASSWORD_GENERATED=0 REINSTALL=0 OLD_ENV_FILE="" BUILD_LOCAL=0
PUBLIC_URL="" SITE_ADDRESS=""

# Cores (desligadas se não houver terminal)
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m' C_BOLD=$'\033[1m' C_RED=$'\033[31m' C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m' C_BLUE=$'\033[34m' C_CYAN=$'\033[36m'
else
  C_RESET="" C_BOLD="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE="" C_CYAN=""
fi

# ----------------------------------------------------------------------------
# Mensagens
# ----------------------------------------------------------------------------
info()  { printf '%s\n' "  ${C_CYAN}•${C_RESET} $*"; }
ok()    { printf '%s\n' "  ${C_GREEN}✓${C_RESET} $*"; }
warn()  { printf '%s\n' "  ${C_YELLOW}!${C_RESET} ${C_YELLOW}$*${C_RESET}"; }
fail()  { printf '%s\n' "  ${C_RED}✗ $*${C_RESET}" >&2; }
die()   { fail "$*"; printf '\n  Log completo: %s\n\n' "$LOG_FILE" >&2; exit 1; }
step()  {
  CURRENT_STEP="$2"
  printf '\n%s\n' "${C_BOLD}${C_BLUE}[$1/${TOTAL_STEPS}] $2${C_RESET}"
}

# Escreve direto no terminal (não vai para o log). Usado para spinner e senhas.
tty_print() {
  if [[ "$HAS_TTY" == 1 ]]; then printf '%s' "$*" >/dev/tty; else printf '%s' "$*"; fi
}

on_error() {
  local code=$1 line=$2 cmd=$3
  trap - ERR
  printf '\n' >&2
  fail "Algo deu errado na etapa: ${CURRENT_STEP}"
  fail "Comando: ${cmd} (linha ${line}, código ${code})"
  printf '\n  %s\n' "Veja os detalhes no log:  sudo tail -n 80 ${LOG_FILE}" >&2
  printf '  %s\n\n' "Depois de corrigir, é só rodar o instalador de novo (ele continua de onde parou)." >&2
  exit "$code"
}

# ----------------------------------------------------------------------------
# Perguntas (whiptail com fallback para read). Tudo lê de /dev/tty porque,
# com "curl | bash", a entrada padrão é o próprio script.
# ----------------------------------------------------------------------------
detect_tty() {
  if [[ "$NONINTERACTIVE" != 1 ]] && (exec </dev/tty) 2>/dev/null && (exec >/dev/tty) 2>/dev/null; then
    HAS_TTY=1
    if command -v whiptail >/dev/null 2>&1; then USE_WHIPTAIL=1; fi
  else
    HAS_TTY=0
    NONINTERACTIVE=1
  fi
}

# ask_input "Título" "Texto" "padrão" -> imprime resposta
ask_input() {
  local title=$1 text=$2 default=${3:-} answer
  if [[ "$USE_WHIPTAIL" == 1 ]]; then
    answer=$(whiptail --title "$title" --inputbox "$text" 16 76 "$default" 3>&1 1>/dev/tty 2>&3 </dev/tty) || return 1
  else
    printf '\n%s\n' "${C_BOLD}${title}${C_RESET}" >/dev/tty
    printf '%b\n' "$text" >/dev/tty
    if [[ -n "$default" ]]; then printf '[%s] > ' "$default" >/dev/tty; else printf '> ' >/dev/tty; fi
    IFS= read -r answer </dev/tty || return 1
    [[ -z "$answer" ]] && answer=$default
  fi
  printf '%s' "$answer"
}

# ask_password "Título" "Texto" -> imprime resposta (pode ser vazia)
ask_password() {
  local title=$1 text=$2 answer
  if [[ "$USE_WHIPTAIL" == 1 ]]; then
    answer=$(whiptail --title "$title" --passwordbox "$text" 16 76 3>&1 1>/dev/tty 2>&3 </dev/tty) || return 1
  else
    printf '\n%s\n%b\n> ' "${C_BOLD}${title}${C_RESET}" "$text" >/dev/tty
    IFS= read -rs answer </dev/tty || return 1
    printf '\n' >/dev/tty
  fi
  printf '%s' "$answer"
}

# ask_yesno "Título" "Texto" -> retorna 0 para sim
ask_yesno() {
  local title=$1 text=$2 answer
  if [[ "$USE_WHIPTAIL" == 1 ]]; then
    whiptail --title "$title" --yes-button "Sim" --no-button "Não" --yesno "$text" 22 78 </dev/tty >/dev/tty 2>&1
    return $?
  fi
  printf '\n%s\n%b\n(s/n) > ' "${C_BOLD}${title}${C_RESET}" "$text" >/dev/tty
  IFS= read -r answer </dev/tty || return 1
  [[ "$answer" =~ ^[sSyY] ]]
}

show_msg() {
  local title=$1 text=$2
  if [[ "$USE_WHIPTAIL" == 1 ]]; then
    whiptail --title "$title" --ok-button "OK" --msgbox "$text" 22 78 </dev/tty >/dev/tty 2>&1 || true
  elif [[ "$HAS_TTY" == 1 ]]; then
    printf '\n%s\n%b\n' "${C_BOLD}${title}${C_RESET}" "$text" >/dev/tty
    printf 'Pressione Enter para continuar...' >/dev/tty
    IFS= read -r _ </dev/tty || true
  else
    printf '\n%s\n%b\n' "$title" "$text"
  fi
}

# ----------------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------------
apt_install() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
    -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
    "$@"
}

rand_hex() {
  local n=$1 v
  while :; do
    v=$(openssl rand -hex "$n")
    # O backend recusa segredos com sequências "fracas" (ex.: 123456, abc123)
    if [[ ! "$v" =~ (123456|abc123) ]]; then printf '%s' "$v"; return 0; fi
  done
}

gen_password() {
  local p
  while :; do
    p=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-16)
    if [[ ${#p} -eq 16 && "$p" =~ [A-Z] && "$p" =~ [a-z] && "$p" =~ [0-9] ]]; then
      printf '%s' "$p"; return 0
    fi
  done
}

valid_email()  { [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; }
valid_domain() { [[ "$1" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$ ]]; }
valid_ipv4()   { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }
password_ok()  { [[ ${#1} -ge 8 && "$1" =~ [A-Z] && "$1" =~ [a-z] && "$1" =~ [0-9] && "$1" != *"'"* ]]; }

# Lê KEY de um arquivo .env (sem executar o arquivo)
env_get() {
  local key=$1 file=$2 line val
  [[ -f "$file" ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)
  [[ -z "$line" ]] && return 0
  val=${line#*=}
  val=${val%$'\r'}
  if [[ "$val" =~ ^\'(.*)\'$ ]]; then val=${BASH_REMATCH[1]}
  elif [[ "$val" =~ ^\"(.*)\"$ ]]; then val=${BASH_REMATCH[1]}
  fi
  printf '%s' "$val"
}

# Formata uma linha KEY=valor segura para o .env do Docker Compose
env_line() {
  local key=$1 val=$2
  if [[ "$val" =~ ^[A-Za-z0-9_./:@,+=-]*$ ]]; then
    printf '%s=%s\n' "$key" "$val"
  else
    printf "%s='%s'\n" "$key" "$val"
  fi
}

# Remove caracteres que quebram o .env em textos livres (nome da empresa)
sanitize_text() {
  local s=$1
  s=${s//\'/’}
  s=$(printf '%s' "$s" | tr -d '"$`\\' | tr -d '\r\n')
  printf '%s' "$s"
}

compose() { (cd "$ATENDIA_DIR" && docker compose "$@"); }

# ----------------------------------------------------------------------------
# 1. Verificações
# ----------------------------------------------------------------------------
check_system() {
  step 1 "Verificando o servidor"

  [[ $EUID -eq 0 ]] || die "Rode como administrador:  curl -fsSL https://raw.githubusercontent.com/${ATENDIA_REPO}/${ATENDIA_BRANCH}/install/install.sh | sudo bash"

  [[ -r /etc/os-release ]] || die "Sistema operacional não reconhecido (sem /etc/os-release)."
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID=${ID:-desconhecido}
  OS_VERSION=${VERSION_ID:-?}
  case "${OS_ID}:${OS_VERSION}" in
    ubuntu:22.04|ubuntu:24.04|debian:12) ok "Sistema: ${PRETTY_NAME:-$OS_ID $OS_VERSION}" ;;
    ubuntu:*|debian:*)
      warn "Sistema ${PRETTY_NAME:-$OS_ID $OS_VERSION} não foi testado (recomendado: Ubuntu 24.04 LTS). Vou tentar mesmo assim." ;;
    *) die "Sistema ${PRETTY_NAME:-$OS_ID} não suportado. Use Ubuntu 22.04/24.04 ou Debian 12." ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) ARCH=amd64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) die "Processador $(uname -m) não suportado (precisa ser amd64/x86_64 ou arm64)." ;;
  esac
  ok "Processador: ${ARCH}"

  RAM_MB=$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo)
  SWAP_MB=$(awk '/^SwapTotal:/ {printf "%d", $2/1024}' /proc/meminfo)
  if (( RAM_MB < 700 )); then
    die "Memória RAM muito baixa (${RAM_MB} MB). O mínimo é 1 GB."
  fi
  ok "Memória RAM: ${RAM_MB} MB (swap atual: ${SWAP_MB} MB)"

  local free_mb
  free_mb=$(df -Pm / | awk 'NR==2 {print $4}')
  if (( free_mb < 4000 )); then
    die "Pouco espaço livre em disco (${free_mb} MB). Precisa de pelo menos 4 GB livres (recomendado: disco de 30 GB)."
  elif (( free_mb < 8000 )); then
    warn "Espaço livre em disco: ${free_mb} MB. Funciona, mas o recomendado é ter 10 GB+ livres."
  else
    ok "Espaço livre em disco: $(( free_mb / 1024 )) GB"
  fi

  if [[ -f "$ATENDIA_DIR/.env" ]]; then
    REINSTALL=1
    info "Instalação anterior encontrada em ${ATENDIA_DIR}: vou reaproveitar as senhas e configurações."
  fi
}

# ----------------------------------------------------------------------------
# 2. Swap
# ----------------------------------------------------------------------------
setup_swap() {
  step 2 "Memória extra (swap)"
  if (( RAM_MB >= 2000 )); then
    ok "RAM suficiente (${RAM_MB} MB): swap não é necessário."
    return 0
  fi
  if (( SWAP_MB >= 1500 )); then
    ok "Swap já configurado (${SWAP_MB} MB)."
  else
    local swapfile=/swapfile
    local active
    active=$'\n'"$(swapon --show=NAME --noheadings 2>/dev/null || true)"$'\n'
    if [[ -f "$swapfile" && "$active" != *$'\n'"$swapfile"$'\n'* ]]; then
      swapoff "$swapfile" 2>/dev/null || true
      rm -f "$swapfile"
    fi
    if [[ ! -f "$swapfile" ]]; then
      info "Criando arquivo de swap de 2 GB (ajuda muito em servidores de 1 GB)..."
      if ! fallocate -l 2G "$swapfile" 2>/dev/null; then
        dd if=/dev/zero of="$swapfile" bs=1M count=2048 status=none
      fi
      chmod 600 "$swapfile"
      mkswap "$swapfile" >/dev/null
    fi
    swapon "$swapfile" 2>/dev/null || true
    if ! grep -qE "^[[:space:]]*${swapfile}[[:space:]]" /etc/fstab; then
      printf '%s none swap sw 0 0\n' "$swapfile" >> /etc/fstab
    fi
    SWAP_MB=$(awk '/^SwapTotal:/ {printf "%d", $2/1024}' /proc/meminfo)
    ok "Swap ativo: ${SWAP_MB} MB"
  fi
  printf 'vm.swappiness=10\nvm.vfs_cache_pressure=50\n' > /etc/sysctl.d/99-atendia.conf
  sysctl -q -p /etc/sysctl.d/99-atendia.conf >/dev/null 2>&1 || true
  ok "Ajuste de uso de memória aplicado (swappiness=10)."
}

# ----------------------------------------------------------------------------
# 3. Pacotes + Docker
# ----------------------------------------------------------------------------
install_packages() {
  step 3 "Instalando programas necessários (Docker, git...)"
  info "Atualizando lista de pacotes (pode levar 1-2 minutos)..."
  DEBIAN_FRONTEND=noninteractive apt-get update -q -o DPkg::Lock::Timeout=600 >/dev/null
  apt_install curl git openssl ca-certificates whiptail cron gzip tar >/dev/null
  ok "curl, git, openssl, whiptail, cron instalados."
  if [[ "$HAS_TTY" == 1 ]] && command -v whiptail >/dev/null 2>&1; then USE_WHIPTAIL=1; fi

  if command -v docker >/dev/null 2>&1; then
    ok "Docker já instalado: $(docker --version | sed 's/,.*//')"
  else
    info "Instalando Docker (script oficial get.docker.com)..."
    local tmp
    tmp=$(mktemp)
    curl -fsSL https://get.docker.com -o "$tmp"
    sh "$tmp" >/dev/null
    rm -f "$tmp"
    ok "Docker instalado: $(docker --version | sed 's/,.*//')"
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! docker compose version >/dev/null 2>&1; then
    info "Instalando o plugin docker compose..."
    apt_install docker-compose-plugin >/dev/null 2>&1 || apt_install docker-compose-v2 >/dev/null 2>&1 || true
  fi
  docker compose version >/dev/null 2>&1 || die "Não consegui instalar o docker compose."
  ok "Docker Compose: $(docker compose version --short)"

  # Usuário que chamou o sudo pode usar docker sem sudo
  if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != root ]] && id "$SUDO_USER" >/dev/null 2>&1; then
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  fi
}

# ----------------------------------------------------------------------------
# 4. Firewall / nuvem
# ----------------------------------------------------------------------------
gcp_meta() {
  curl -fsS -m 3 -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1" 2>/dev/null
}

setup_firewall() {
  step 4 "Liberando acesso (firewall)"

  if gcp_meta "instance/id" >/dev/null; then
    IS_GCP=1
    ok "Servidor do Google Cloud detectado."
    local tags
    tags=$(gcp_meta "instance/tags" || true)
    [[ "$tags" == *'"http-server"'* ]] || GCP_MISSING_TAGS="HTTP"
    [[ "$tags" == *'"https-server"'* ]] || GCP_MISSING_TAGS="${GCP_MISSING_TAGS:+$GCP_MISSING_TAGS e }HTTPS"
    if [[ -n "$GCP_MISSING_TAGS" ]]; then
      warn "No painel do Google Cloud falta marcar: 'Permitir tráfego ${GCP_MISSING_TAGS}'."
      warn "Compute Engine > Instâncias de VM > (sua VM) > Editar > Firewall > marque as caixas > Salvar."
    else
      ok "Tráfego HTTP/HTTPS liberado no painel do Google Cloud."
    fi
  elif curl -fsS -m 3 -H 'Authorization: Bearer Oracle' http://169.254.169.254/opc/v2/instance/ >/dev/null 2>&1; then
    IS_ORACLE=1
    ok "Servidor da Oracle Cloud detectado."
  fi

  if command -v ufw >/dev/null 2>&1 && [[ "$(ufw status 2>/dev/null || true)" == *"Status: active"* ]]; then
    ufw allow 22/tcp >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
    ufw allow 443/udp >/dev/null
    ok "UFW: portas 22, 80 e 443 liberadas."
  fi

  # Oracle Cloud (e outras imagens) vêm com iptables bloqueando tudo (REJECT)
  if command -v iptables >/dev/null 2>&1 && [[ "$(iptables -S INPUT 2>/dev/null || true)" == *"-j REJECT"* ]]; then
    local port pos
    for port in 80 443; do
      if ! iptables -C INPUT -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT 2>/dev/null; then
        pos=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT" {print $1; exit}')
        iptables -I INPUT "${pos:-1}" -p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT
      fi
    done
    if command -v netfilter-persistent >/dev/null 2>&1; then
      netfilter-persistent save >/dev/null 2>&1 || true
    elif [[ -d /etc/iptables ]]; then
      iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
    ok "iptables: portas 80 e 443 liberadas."
    if [[ "$IS_ORACLE" == 1 ]]; then
      warn "Oracle Cloud: libere também as portas 80 e 443 na 'Security List' da VCN (painel da Oracle)."
    fi
  fi
  ok "Firewall do servidor verificado."
}

# ----------------------------------------------------------------------------
# 5. Código
# ----------------------------------------------------------------------------
git_auth_args=()

# 404 na API do GitHub = repositório privado (ou inexistente)
repo_is_private() {
  local code
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://api.github.com/repos/${ATENDIA_REPO}" 2>/dev/null || true)
  [[ "$code" == 404 ]]
}

setup_git_auth() {
  repo_is_private || die "Não consegui baixar o código do GitHub. Verifique a internet do servidor e tente de novo."
  local token=${ATENDIA_GITHUB_TOKEN:-}
  if [[ -z "$token" && "$NONINTERACTIVE" != 1 ]]; then
    token=$(ask_password "Repositório privado" \
      "Não consegui baixar o código: o repositório parece ser PRIVADO.\n\nCole um token do GitHub com permissão de leitura (github.com > Settings > Developer settings > Personal access tokens).\n\nToken:") || true
  fi
  [[ -n "$token" ]] || die "Sem acesso ao repositório ${ATENDIA_REPO}. Torne-o público ou informe ATENDIA_GITHUB_TOKEN."
  umask 077
  printf 'https://x-access-token:%s@github.com\n' "$token" > "$GIT_CRED_FILE"
  chmod 600 "$GIT_CRED_FILE"
  git_auth_args=(-c "credential.helper=store --file=${GIT_CRED_FILE}")
}

fetch_code() {
  step 5 "Baixando o AtendIA em ${ATENDIA_DIR}"
  local url="https://github.com/${ATENDIA_REPO}.git"
  export GIT_TERMINAL_PROMPT=0
  [[ -f "$GIT_CRED_FILE" ]] && git_auth_args=(-c "credential.helper=store --file=${GIT_CRED_FILE}")

  # Instalação antiga (sem git) no mesmo diretório: guarda e reaproveita o .env
  if [[ -d "$ATENDIA_DIR" && ! -d "$ATENDIA_DIR/.git" ]] && [[ -n "$(ls -A "$ATENDIA_DIR" 2>/dev/null)" ]]; then
    local old
    old="${ATENDIA_DIR}.antigo-$(date +%Y%m%d-%H%M%S)"
    mv "$ATENDIA_DIR" "$old"
    warn "Encontrei uma instalação antiga (sem git). Ela foi movida para ${old}."
    if [[ -f "$old/.env" ]]; then
      OLD_ENV_FILE="$old/.env"
      info "Vou reaproveitar senhas e chaves do .env antigo."
    fi
    REINSTALL=0
  fi

  if [[ -d "$ATENDIA_DIR/.git" ]]; then
    info "Atualizando código existente..."
    if ! git "${git_auth_args[@]}" -C "$ATENDIA_DIR" fetch --depth 1 origin "$ATENDIA_BRANCH" >/dev/null 2>&1; then
      setup_git_auth
      git "${git_auth_args[@]}" -C "$ATENDIA_DIR" fetch --depth 1 origin "$ATENDIA_BRANCH" >/dev/null
    fi
    if [[ -n "$(git -C "$ATENDIA_DIR" status --porcelain --untracked-files=no)" ]]; then
      mkdir -p "$ATENDIA_DIR/backups"
      local patch
      patch="$ATENDIA_DIR/backups/alteracoes-locais-$(date +%Y%m%d-%H%M%S).patch"
      git -C "$ATENDIA_DIR" diff > "$patch" || true
      warn "Arquivos do sistema tinham sido editados à mão. Cópia das alterações: ${patch}"
    fi
    git -C "$ATENDIA_DIR" reset --hard FETCH_HEAD >/dev/null
  else
    info "Clonando ${url} (branch ${ATENDIA_BRANCH})..."
    mkdir -p "$(dirname "$ATENDIA_DIR")"
    if ! git "${git_auth_args[@]}" clone --depth 1 --branch "$ATENDIA_BRANCH" "$url" "$ATENDIA_DIR" >/dev/null 2>&1; then
      rm -rf "$ATENDIA_DIR"
      setup_git_auth
      git "${git_auth_args[@]}" clone --depth 1 --branch "$ATENDIA_BRANCH" "$url" "$ATENDIA_DIR" >/dev/null
    fi
  fi
  if [[ -f "$GIT_CRED_FILE" ]]; then
    git -C "$ATENDIA_DIR" config credential.helper "store --file=${GIT_CRED_FILE}"
  fi
  git -C "$ATENDIA_DIR" config core.fileMode false
  mkdir -p "$ATENDIA_DIR/backups"
  chmod 700 "$ATENDIA_DIR/backups"
  [[ -f "$ATENDIA_DIR/docker-compose.yml" ]] || die "Código baixado, mas docker-compose.yml não foi encontrado."
  ok "Código pronto (versão $(git -C "$ATENDIA_DIR" rev-parse --short HEAD))."
}

# ----------------------------------------------------------------------------
# 6. IP público
# ----------------------------------------------------------------------------
detect_ip() {
  step 6 "Descobrindo o endereço IP público"
  local ip="" src
  if [[ "$IS_GCP" == 1 ]]; then
    ip=$(gcp_meta "instance/network-interfaces/0/access-configs/0/external-ip" || true)
  fi
  if ! valid_ipv4 "${ip:-x}"; then
    for src in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
      ip=$(curl -4 -fsS -m 5 "$src" 2>/dev/null | tr -d '[:space:]' || true)
      valid_ipv4 "${ip:-x}" && break
      ip=""
    done
  fi
  if ! valid_ipv4 "${ip:-x}"; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    warn "Não consegui descobrir o IP público pela internet; usando ${ip:-desconhecido}."
  fi
  PUBLIC_IP=$ip
  ok "IP público: ${PUBLIC_IP}"
  if [[ "$IS_GCP" == 1 ]]; then
    info "Dica: reserve este IP como 'estático' no Google Cloud para ele não mudar (veja o guia)."
  fi
}

# ----------------------------------------------------------------------------
# 7. Perguntas
# ----------------------------------------------------------------------------
existing() {
  # Valor atual do .env (ou do .env de uma instalação antiga)
  local v
  v=$(env_get "$1" "$ATENDIA_DIR/.env")
  if [[ -z "$v" && -n "$OLD_ENV_FILE" ]]; then v=$(env_get "$1" "$OLD_ENV_FILE"); fi
  printf '%s' "$v"
}

previous_password() {
  [[ -f "$CRED_FILE" ]] || return 0
  awk '/^Senha:/ { sub(/^Senha:[[:space:]]*/, ""); print; exit }' "$CRED_FILE"
}

ask_questions() {
  step 7 "Configuração"

  local def_company def_email def_domain def_site cur_openai prev_pw
  def_company=$(existing ATENDIA_COMPANY_NAME)
  def_email=$(existing ATENDIA_ADMIN_EMAIL)
  def_site=$(existing SITE_ADDRESS)
  def_domain=""
  if [[ -n "$def_site" && "$def_site" != :* ]]; then def_domain=$def_site; fi
  cur_openai=$(existing OPENAI_API_KEY)
  prev_pw=$(previous_password)

  COMPANY=${ATENDIA_COMPANY:-$def_company}
  ADMIN_EMAIL=${ATENDIA_ADMIN_EMAIL:-$def_email}
  ADMIN_PASSWORD=${ATENDIA_ADMIN_PASSWORD:-}
  DOMAIN=${ATENDIA_DOMAIN-$def_domain}
  OPENAI_KEY=${ATENDIA_OPENAI_KEY:-$cur_openai}

  if [[ "$NONINTERACTIVE" == 1 ]]; then
    COMPANY=${COMPANY:-Minha Empresa}
    valid_email "${ADMIN_EMAIL:-x}" || die "Modo automático: defina ATENDIA_ADMIN_EMAIL com um e-mail válido."
  else
    show_msg "Instalação do AtendIA" \
"Bem-vindo! Vou fazer algumas perguntas rápidas.

Dica: onde houver valor sugerido, é só apertar Enter.
As opções marcadas como (opcional) podem ser configuradas
depois, pelo painel ou pelo comando:  sudo atendia config"

    # Empresa
    while :; do
      COMPANY=$(ask_input "1/5 — Nome da empresa" "Qual o nome da sua empresa?\n(aparece no painel; pode mudar depois)" "${COMPANY:-Minha Empresa}") || die "Instalação cancelada."
      COMPANY=$(sanitize_text "$COMPANY")
      [[ -n "$COMPANY" ]] && break
    done

    # E-mail
    while :; do
      ADMIN_EMAIL=$(ask_input "2/5 — E-mail do administrador" "Seu e-mail. Ele será o LOGIN do administrador no painel\n(e também usado para o certificado HTTPS, se tiver domínio)." "$ADMIN_EMAIL") || die "Instalação cancelada."
      ADMIN_EMAIL=$(printf '%s' "$ADMIN_EMAIL" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
      valid_email "$ADMIN_EMAIL" && break
      show_msg "E-mail inválido" "\"${ADMIN_EMAIL}\" não parece um e-mail válido. Tente de novo."
    done

    # Senha
    if [[ -z "$ADMIN_PASSWORD" ]]; then
      local p1 p2 hint="Aperte Enter para eu GERAR uma senha forte automaticamente (recomendado)."
      [[ -n "$prev_pw" ]] && hint="Aperte Enter para MANTER a senha atual (está em ${CRED_FILE})."
      while :; do
        p1=$(ask_password "3/5 — Senha do administrador" "Crie uma senha para entrar no painel.\nMínimo 8 caracteres, com letra MAIÚSCULA, minúscula e número.\n\n${hint}") || die "Instalação cancelada."
        if [[ -z "$p1" ]]; then break; fi
        if ! password_ok "$p1"; then
          show_msg "Senha fraca" "A senha precisa ter pelo menos 8 caracteres, com letra maiúscula, letra minúscula e número (e sem aspas simples)."
          continue
        fi
        p2=$(ask_password "3/5 — Confirme a senha" "Digite a mesma senha de novo:") || die "Instalação cancelada."
        if [[ "$p1" == "$p2" ]]; then ADMIN_PASSWORD=$p1; break; fi
        show_msg "Senhas diferentes" "As duas senhas não são iguais. Vamos tentar de novo."
      done
    fi

    # Domínio
    while :; do
      DOMAIN=$(ask_input "4/5 — Domínio (opcional)" "Tem um domínio apontando para este servidor (ex.: minhaempresa.duckdns.org)?\n\nSe NÃO tiver, apenas aperte Enter: o sistema vai funcionar pelo IP\nhttp://${PUBLIC_IP}\ne você pode adicionar domínio + HTTPS depois com:  sudo atendia config" "$DOMAIN") || die "Instalação cancelada."
      DOMAIN=$(printf '%s' "$DOMAIN" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
      DOMAIN=${DOMAIN#http://}; DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN%%/*}
      [[ -z "$DOMAIN" ]] && break
      if ! valid_domain "$DOMAIN"; then
        show_msg "Domínio inválido" "\"${DOMAIN}\" não parece um domínio válido (exemplo: minhaempresa.duckdns.org)."
        continue
      fi
      local resolved
      resolved=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)
      if [[ " $resolved " == *" $PUBLIC_IP "* ]]; then
        break
      fi
      if ask_yesno "Domínio ainda não aponta para cá" \
"O domínio ${DOMAIN} aponta para: ${resolved:-nenhum IP}
Mas o IP deste servidor é: ${PUBLIC_IP}

Sem isso o HTTPS não funciona. Quer continuar SÓ COM O IP agora
e adicionar o domínio depois (sudo atendia config)?

Sim = usar só o IP agora    Não = digitar o domínio de novo"; then
        DOMAIN=""
        break
      fi
    done

    # OpenAI
    local openai_text="Cole sua chave da OpenAI (começa com sk-) para a IA responder.\n\n(opcional) Aperte Enter para PULAR e configurar depois no painel."
    [[ -n "$OPENAI_KEY" ]] && openai_text="Já existe uma chave OpenAI configurada.\n\nAperte Enter para MANTER, ou cole uma nova."
    local k
    k=$(ask_input "5/5 — Chave da OpenAI (opcional)" "$openai_text" "") || die "Instalação cancelada."
    k=$(printf '%s' "$k" | tr -d '[:space:]')
    if [[ -n "$k" ]]; then
      if [[ "$k" =~ ^[A-Za-z0-9_.-]+$ ]]; then OPENAI_KEY=$k
      else warn "Chave OpenAI com caracteres inválidos: ignorada (configure depois no painel)."
      fi
    fi
  fi

  COMPANY=$(sanitize_text "$COMPANY")
  if [[ -n "$DOMAIN" ]] && ! valid_domain "$DOMAIN"; then
    warn "Domínio '${DOMAIN}' inválido: usando só o IP."
    DOMAIN=""
  fi
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    if [[ -n "$prev_pw" ]]; then
      ADMIN_PASSWORD=$prev_pw
    else
      ADMIN_PASSWORD=$(gen_password)
      PASSWORD_GENERATED=1
    fi
  elif ! password_ok "$ADMIN_PASSWORD"; then
    die "A senha do administrador precisa ter 8+ caracteres, com maiúscula, minúscula e número."
  fi

  if [[ -n "$DOMAIN" ]]; then
    SITE_ADDRESS=$DOMAIN
    PUBLIC_URL="https://${DOMAIN}"
  else
    SITE_ADDRESS=":80"
    PUBLIC_URL="http://${PUBLIC_IP}"
  fi
  ok "Respostas registradas."
}

# ----------------------------------------------------------------------------
# 8. Arquivo .env
# ----------------------------------------------------------------------------
write_env() {
  step 8 "Gerando configuração segura (.env)"
  local env_file="$ATENDIA_DIR/.env" tmp
  umask 077

  local db_pw redis_pw jwt jwt_r sess
  db_pw=$(existing DB_PASSWORD);            [[ -n "$db_pw" ]]    || db_pw=$(rand_hex 24)
  redis_pw=$(existing REDIS_PASSWORD);      [[ -n "$redis_pw" ]] || redis_pw=$(rand_hex 24)
  jwt=$(existing JWT_SECRET);               [[ ${#jwt} -ge 32 ]]   || jwt=$(rand_hex 32)
  jwt_r=$(existing JWT_REFRESH_SECRET);     [[ ${#jwt_r} -ge 32 ]] || jwt_r=$(rand_hex 32)
  # A chave de sessão NUNCA é trocada se já existir (criptografa sessões WhatsApp e chaves de API)
  sess=$(existing SESSION_ENCRYPTION_KEY);  [[ ${#sess} -ge 32 ]]  || sess=$(rand_hex 32)

  # Instalação antiga usava senhas com formato qualquer: só letras/números são seguras na URL
  if [[ ! "$db_pw" =~ ^[A-Za-z0-9]+$ ]]; then
    warn "A senha antiga do banco tem caracteres especiais; ela será mantida, mas pode causar erro de conexão."
  fi

  if [[ -f "$env_file" ]]; then
    cp -p "$env_file" "$ATENDIA_DIR/backups/env-$(date +%Y%m%d-%H%M%S).bak"
  fi

  v_or() { local v; v=$(existing "$1"); printf '%s' "${v:-$2}"; }

  tmp=$(mktemp "$ATENDIA_DIR/.env.XXXXXX")
  {
    printf '# AtendIA — configuração de produção\n'
    printf '# Gerado pelo instalador em %s. Para alterar use: sudo atendia config\n' "$(date '+%d/%m/%Y %H:%M')"
    printf '# ATENÇÃO: nunca troque SESSION_ENCRYPTION_KEY depois de conectar o WhatsApp.\n\n'
    printf '# --- Endereço ---\n'
    env_line PUBLIC_URL "$PUBLIC_URL"
    env_line SITE_ADDRESS "$SITE_ADDRESS"
    env_line ACME_EMAIL "$ADMIN_EMAIL"
    printf '\n# --- Administrador / empresa (usado pelo comando atendia) ---\n'
    env_line ATENDIA_ADMIN_EMAIL "$ADMIN_EMAIL"
    env_line ATENDIA_COMPANY_NAME "$COMPANY"
    env_line ATENDIA_PUBLIC_IP "$PUBLIC_IP"
    printf '\n# --- Segredos (gerados automaticamente) ---\n'
    env_line DB_PASSWORD "$db_pw"
    env_line REDIS_PASSWORD "$redis_pw"
    env_line JWT_SECRET "$jwt"
    env_line JWT_REFRESH_SECRET "$jwt_r"
    env_line SESSION_ENCRYPTION_KEY "$sess"
    printf '\n# --- Inteligência Artificial (opcional) ---\n'
    env_line OPENAI_API_KEY "$OPENAI_KEY"
    env_line ANTHROPIC_API_KEY "$(existing ANTHROPIC_API_KEY)"
    env_line ELEVENLABS_API_KEY "$(existing ELEVENLABS_API_KEY)"
    env_line DEFAULT_AI_MODEL "$(v_or DEFAULT_AI_MODEL gpt-4o-mini)"
    printf '\n# --- E-mail / SMTP (opcional) ---\n'
    env_line SMTP_HOST "$(existing SMTP_HOST)"
    env_line SMTP_PORT "$(v_or SMTP_PORT 587)"
    env_line SMTP_SECURE "$(v_or SMTP_SECURE false)"
    env_line SMTP_USER "$(existing SMTP_USER)"
    env_line SMTP_PASS "$(existing SMTP_PASS)"
    env_line EMAIL_FROM "$(v_or EMAIL_FROM "${COMPANY} <noreply@atendia.local>")"
    printf '\n# --- Pagamentos (opcional) ---\n'
    env_line MP_ACCESS_TOKEN "$(existing MP_ACCESS_TOKEN)"
    env_line MP_WEBHOOK_SECRET "$(existing MP_WEBHOOK_SECRET)"
    env_line MP_SANDBOX "$(v_or MP_SANDBOX false)"
    env_line STRIPE_SECRET_KEY "$(existing STRIPE_SECRET_KEY)"
    env_line STRIPE_WEBHOOK_SECRET "$(existing STRIPE_WEBHOOK_SECRET)"
    printf '\n# --- Avançado ---\n'
    env_line LOG_LEVEL "$(v_or LOG_LEVEL info)"
    env_line ATENDIA_VERSION "$(v_or ATENDIA_VERSION latest)"
    local pg_img cf
    pg_img=$(existing POSTGRES_IMAGE)
    # Banco de uma instalação antiga (imagem pgvector, Debian): mantém Postgres Debian
    # para não haver diferença de collation (glibc x musl) nos índices existentes.
    if [[ -z "$pg_img" && -n "$OLD_ENV_FILE" ]] && docker volume inspect atendia_pgdata >/dev/null 2>&1; then
      pg_img="postgres:15"
    fi
    [[ -n "$pg_img" ]] && env_line POSTGRES_IMAGE "$pg_img"
    cf=$(existing COMPOSE_FILE)
    [[ -n "$cf" ]] && env_line COMPOSE_FILE "$cf"

    # Preserva variáveis extras que o usuário tenha adicionado
    if [[ -f "$env_file" ]]; then
      local known=" PUBLIC_URL SITE_ADDRESS ACME_EMAIL ATENDIA_ADMIN_EMAIL ATENDIA_COMPANY_NAME ATENDIA_PUBLIC_IP DB_PASSWORD REDIS_PASSWORD JWT_SECRET JWT_REFRESH_SECRET SESSION_ENCRYPTION_KEY OPENAI_API_KEY ANTHROPIC_API_KEY ELEVENLABS_API_KEY DEFAULT_AI_MODEL SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS EMAIL_FROM MP_ACCESS_TOKEN MP_WEBHOOK_SECRET MP_SANDBOX STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET LOG_LEVEL ATENDIA_VERSION POSTGRES_IMAGE COMPOSE_FILE "
      local extra_header=0 line key
      while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)= ]] || continue
        key=${BASH_REMATCH[1]}
        [[ "$known" == *" $key "* ]] && continue
        if [[ $extra_header == 0 ]]; then printf '\n# --- Outras (preservadas) ---\n'; extra_header=1; fi
        printf '%s\n' "$line"
      done < "$env_file"
    fi
  } > "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$env_file"
  chown root:root "$env_file"
  ok ".env salvo em ${env_file} (somente o root consegue ler)."
}

# ----------------------------------------------------------------------------
# 9. Resumo
# ----------------------------------------------------------------------------
confirm_summary() {
  step 9 "Resumo"
  local pw_line="(a senha que você digitou)"
  [[ "$PASSWORD_GENERATED" == 1 ]] && pw_line="(gerada automaticamente — aparece no final)"
  local summary
  summary="Empresa:        ${COMPANY}
Administrador:  ${ADMIN_EMAIL}
Senha:          ${pw_line}
Endereço:       ${PUBLIC_URL}
HTTPS:          $([[ -n "$DOMAIN" ]] && echo "sim (automático)" || echo "não (só IP — adicione domínio depois)")
Chave OpenAI:   $([[ -n "$OPENAI_KEY" ]] && echo "configurada" || echo "não (configure depois no painel)")
Pasta:          ${ATENDIA_DIR}"
  printf '%s\n' "$summary" | sed 's/^/    /'
  if [[ "$NONINTERACTIVE" != 1 ]]; then
    ask_yesno "Confirma a instalação?" "${summary}

Instalar agora? (leva de 3 a 10 minutos)" || die "Instalação cancelada por você. Nada foi iniciado."
  fi
}

# ----------------------------------------------------------------------------
# 10. Subir containers
# ----------------------------------------------------------------------------
ghcr_login() {
  local user=${ATENDIA_GHCR_USER:-} token=${ATENDIA_GHCR_TOKEN:-}
  if [[ -z "$token" && "$NONINTERACTIVE" != 1 ]]; then
    user=$(ask_input "Imagens privadas" "As imagens prontas do AtendIA estão PRIVADAS no GitHub (ghcr.io).\n\nInforme seu usuário do GitHub:" "${user:-${ATENDIA_REPO%%/*}}") || return 1
    token=$(ask_password "Imagens privadas" "Cole um token do GitHub com a permissão 'read:packages'.\n(Ou torne os pacotes públicos — veja o guia — e aperte Enter para pular.)") || return 1
  fi
  [[ -n "$token" ]] || return 1
  printf '%s' "$token" | docker login ghcr.io -u "${user:-${ATENDIA_REPO%%/*}}" --password-stdin >/dev/null 2>&1
}

enable_local_build() {
  local total=$(( RAM_MB + SWAP_MB ))
  if (( total < 2500 )); then
    die "Não consegui baixar as imagens prontas e este servidor tem pouca memória (${total} MB de RAM+swap) para compilar.
   Verifique se as imagens foram publicadas (GitHub > Actions > 'Publicar imagens Docker') e se os pacotes estão públicos."
  fi
  warn "Imagens prontas indisponíveis. Vou COMPILAR no servidor — isso pode levar de 15 a 40 minutos."
  local env_file="$ATENDIA_DIR/.env"
  if ! grep -q '^COMPOSE_FILE=' "$env_file"; then
    printf '\n# Compilação local (imagens do GHCR indisponíveis)\nCOMPOSE_FILE=docker-compose.yml:docker-compose.build.yml\n' >> "$env_file"
  fi
  BUILD_LOCAL=1
}

start_services() {
  step 10 "Baixando e iniciando o sistema"
  local cf
  cf=$(env_get COMPOSE_FILE "$ATENDIA_DIR/.env")
  [[ "$cf" == *build* ]] && BUILD_LOCAL=1

  if [[ "$BUILD_LOCAL" != 1 ]]; then
    info "Baixando imagens prontas (primeira vez: 2 a 5 minutos)..."
    if ! compose pull --quiet; then
      warn "Falha ao baixar as imagens."
      if ghcr_login && compose pull --quiet; then
        ok "Login no GHCR feito; imagens baixadas."
      else
        enable_local_build
      fi
    fi
  fi
  if [[ "$BUILD_LOCAL" == 1 ]]; then
    compose pull --quiet --ignore-buildable 2>/dev/null || compose pull --quiet postgres redis
    info "Compilando imagens (demorado; acompanhe em ${LOG_FILE})..."
    compose build
  fi
  ok "Imagens prontas."

  info "Iniciando banco de dados, fila, sistema e servidor web..."
  compose up -d --remove-orphans
  ok "Containers iniciados."
}

# ----------------------------------------------------------------------------
# 11. Esperar ficar pronto
# ----------------------------------------------------------------------------
backend_health() {
  local cid
  cid=$(compose ps -q backend 2>/dev/null || true)
  [[ -n "$cid" ]] || { echo "missing"; return; }
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo "missing"
}

wait_healthy() {
  step 11 "Aguardando o sistema ficar pronto"
  info "Na primeira vez o banco de dados é criado; em servidores pequenos leva 1 a 3 minutos."
  local frames='|/-\' i=0 start now elapsed status limit=$HEALTH_TIMEOUT extended=0 cid restarts
  start=$(date +%s)
  while :; do
    status=$(backend_health)
    cid=$(compose ps -q backend 2>/dev/null || true)
    restarts=0
    [[ -n "$cid" ]] && restarts=$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)
    if (( restarts >= 4 )); then
      # Reiniciando em loop: não adianta esperar
      status="reiniciando sem parar (${restarts}x)"
      limit=0
      extended=1
    fi
    if [[ "$status" == healthy ]] && compose exec -T backend wget -qO- http://127.0.0.1:3001/health >/dev/null 2>&1; then
      tty_print $'\r\033[K'
      ok "Sistema respondendo (health OK)."
      break
    fi
    now=$(date +%s); elapsed=$(( now - start ))
    if (( elapsed >= limit )); then
      # Ainda iniciando (não travado)? Dá mais 2 minutos uma única vez.
      if [[ $extended == 0 && "$status" == starting ]]; then
        extended=1; limit=$(( limit + 120 ))
        tty_print $'\r\033[K'
        warn "Está demorando mais que o normal (servidor pequeno). Aguardando mais 2 minutos..."
        continue
      fi
      tty_print $'\r\033[K'
      fail "O sistema não ficou pronto após ${elapsed}s (estado: ${status})."
      printf '\n  %s\n' "Últimas linhas do log do sistema:"
      compose logs --tail=50 backend 2>&1 | sed 's/^/    /' || true
      printf '\n  %s\n' "Dicas:"
      printf '  %s\n' "- Veja se há erro de configuração acima (ex.: variável faltando)."
      printf '  %s\n' "- Memória: rode 'free -m' (precisa de swap em servidores de 1 GB)."
      printf '  %s\n' "- Tente de novo: sudo bash ${ATENDIA_DIR}/install/install.sh"
      die "O sistema não iniciou."
    fi
    tty_print $'\r'"  ${frames:i++%4:1} Iniciando... ${elapsed}s (estado: ${status})   "
    sleep 3
  done

  # Servidor web (Caddy)
  local code
  code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1/ 2>/dev/null || true)
  case "$code" in
    200|301|302|308) ok "Servidor web respondendo (HTTP ${code})." ;;
    *) warn "Servidor web respondeu '${code:-nada}'. Veja: sudo atendia logs web" ;;
  esac
}

# ----------------------------------------------------------------------------
# 12. Admin, backup, CLI, credenciais
# ----------------------------------------------------------------------------
create_admin() {
  info "Criando o usuário administrador..."
  if ! compose exec -T backend test -f dist/scripts/create-admin.js; then
    warn "Script create-admin não encontrado nesta versão. Crie sua conta pela tela 'Criar conta' do painel."
    return 0
  fi
  local out
  if ! out=$(cd "$ATENDIA_DIR" && ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      COMPANY_NAME="$COMPANY" ADMIN_NAME="Administrador" \
      docker compose exec -T -e ADMIN_EMAIL -e ADMIN_PASSWORD -e COMPANY_NAME -e ADMIN_NAME \
      backend node dist/scripts/create-admin.js 2>&1); then
    printf '%s\n' "$out" | sed 's/^/    /'
    die "Falha ao criar o administrador."
  fi
  printf '%s\n' "$out" | sed 's/^/    /'
  # Reinstalação: garante que a senha mostrada no final é a que funciona
  if [[ "$REINSTALL" == 1 || -n "$OLD_ENV_FILE" ]]; then
    if ! out=$(cd "$ATENDIA_DIR" && ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
        docker compose exec -T -e ADMIN_EMAIL -e ADMIN_PASSWORD \
        backend node dist/scripts/create-admin.js --reset-password 2>&1); then
      printf '%s\n' "$out" | sed 's/^/    /'
      warn "Não consegui redefinir a senha do administrador. Use depois: sudo atendia senha-admin"
    fi
  fi
  ok "Administrador pronto: ${ADMIN_EMAIL}"
}

install_extras() {
  step 12 "Finalizando (administrador, backup automático, comando atendia)"
  create_admin

  install -m 755 "$ATENDIA_DIR/install/atendia" "$CLI_PATH"
  ok "Comando 'atendia' instalado (digite: sudo atendia)."

  cat > /etc/cron.d/atendia <<EOF
# AtendIA — backup diário às 03:00 (mantém os 7 mais recentes em ${ATENDIA_DIR}/backups)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root ${CLI_PATH} backup --auto >> /var/log/atendia-backup.log 2>&1
EOF
  chmod 644 /etc/cron.d/atendia
  systemctl enable --now cron >/dev/null 2>&1 || true
  cat > /etc/logrotate.d/atendia <<'EOF'
/var/log/atendia-backup.log /var/log/atendia-install.log {
  monthly
  rotate 3
  compress
  missingok
  notifempty
}
EOF
  ok "Backup automático diário configurado (03:00)."

  umask 077
  cat > "$CRED_FILE" <<EOF
AtendIA — dados de acesso (guarde em local seguro e apague este arquivo se quiser)
Gerado em: $(date '+%d/%m/%Y %H:%M')

Endereço: ${PUBLIC_URL}
E-mail: ${ADMIN_EMAIL}
Senha: ${ADMIN_PASSWORD}

Configuração do servidor: ${ATENDIA_DIR}/.env
Backups: ${ATENDIA_DIR}/backups
Trocar senha do admin:  sudo atendia senha-admin
EOF
  chmod 600 "$CRED_FILE"
  ok "Credenciais salvas em ${CRED_FILE} (só o root lê)."
}

final_screen() {
  local g=$C_GREEN b=$C_BOLD r=$C_RESET y=$C_YELLOW c=$C_CYAN
  local out
  out="
${g}${b}╔══════════════════════════════════════════════════════════════╗
║            AtendIA instalado com sucesso!  🎉                ║
╚══════════════════════════════════════════════════════════════╝${r}

  ${b}Endereço do painel:${r}  ${c}${PUBLIC_URL}${r}
  ${b}E-mail (login):${r}      ${ADMIN_EMAIL}
  ${b}Senha:${r}               ${ADMIN_PASSWORD}
  $( [[ "$PASSWORD_GENERATED" == 1 ]] && printf '%s' "${y}(senha gerada automaticamente — ANOTE!)${r}" )

  Esses dados também estão em: ${CRED_FILE}
  (para ver de novo:  sudo cat ${CRED_FILE})

  ${b}Próximos passos:${r}
   1. Abra ${c}${PUBLIC_URL}${r} no navegador (computador ou celular)
   2. Entre com o e-mail e a senha acima
   3. Siga o assistente de configuração que aparece na tela
   4. Conecte o WhatsApp: no celular, WhatsApp > Aparelhos conectados >
      Conectar aparelho > aponte a câmera para o QR Code do painel
"
  if [[ -n "$GCP_MISSING_TAGS" ]]; then
    out+="
  ${y}${b}ATENÇÃO (Google Cloud):${r}${y} o site só abre depois de marcar
  'Permitir tráfego ${GCP_MISSING_TAGS}' na sua VM:
  Compute Engine > Instâncias de VM > (sua VM) > Editar > Firewall.${r}
"
  fi
  if [[ "$IS_ORACLE" == 1 ]]; then
    out+="
  ${y}Oracle Cloud: libere as portas 80 e 443 na Security List da VCN.${r}
"
  fi
  if [[ -z "$DOMAIN" ]]; then
    out+="
  Quer um endereço com nome e cadeado (HTTPS)?  ${b}sudo atendia config${r} > Domínio
"
  fi
  out+="
  ${b}Comandos úteis:${r}
    sudo atendia status        situação do sistema e uso de memória
    sudo atendia logs          ver o que está acontecendo (Ctrl+C para sair)
    sudo atendia config        domínio/HTTPS, chaves de IA, e-mail, Mercado Pago
    sudo atendia backup        fazer um backup agora
    sudo atendia update        atualizar para a versão mais nova
    sudo atendia senha-admin   trocar a senha do administrador
"
  tty_print "${out}"$'\n'
  if [[ "$HAS_TTY" == 1 ]]; then
    printf '\n[instalação concluída — dados de acesso exibidos na tela e salvos em %s]\n' "$CRED_FILE"
  fi
}

# ----------------------------------------------------------------------------
main() {
  # Com "curl | bash" a entrada padrão é o script: nada deve lê-la.
  exec </dev/null

  touch "$LOG_FILE" 2>/dev/null && chmod 600 "$LOG_FILE" 2>/dev/null || true
  if [[ -w "$LOG_FILE" ]]; then
    exec > >(tee -a "$LOG_FILE") 2>&1
  fi
  printf '\n===== Instalação AtendIA — %s =====\n' "$(date '+%d/%m/%Y %H:%M:%S')"

  trap 'on_error $? $LINENO "$BASH_COMMAND"' ERR
  detect_tty

  printf '%s\n' "${C_BOLD}${C_CYAN}
   █████╗ ████████╗███████╗███╗   ██╗██████╗ ██╗ █████╗
  ██╔══██╗╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██║██╔══██╗
  ███████║   ██║   █████╗  ██╔██╗ ██║██║  ██║██║███████║
  ██╔══██║   ██║   ██╔══╝  ██║╚██╗██║██║  ██║██║██╔══██║
  ██║  ██║   ██║   ███████╗██║ ╚████║██████╔╝██║██║  ██║
  ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚═╝╚═╝  ╚═╝${C_RESET}
        Instalador automático — atendimento com IA no WhatsApp
"
  [[ "$NONINTERACTIVE" == 1 ]] && info "Modo automático (sem perguntas)."

  check_system
  setup_swap
  install_packages
  setup_firewall
  fetch_code
  detect_ip
  ask_questions
  write_env
  confirm_summary
  start_services
  wait_healthy
  install_extras
  final_screen
}

main "$@"; exit $?
