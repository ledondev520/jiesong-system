#!/bin/sh
# DRAFT: read-only host inventory. No env, secret files, process arguments,
# application data, installs, network changes, service changes or restarts.
set -eu
printf 'os='
if [ -r /etc/os-release ]; then
    sed -n 's/^PRETTY_NAME=//p' /etc/os-release
else
    uname -s
fi
printf 'arch='; uname -m
printf 'node='; if command -v node >/dev/null 2>&1; then node --version; else echo absent; fi
printf 'npm='; if command -v npm >/dev/null 2>&1; then npm --version; else echo absent; fi
# Do not invoke pm2: even listing can start its daemon. Existence only.
if command -v pm2 >/dev/null 2>&1; then echo 'pm2_binary=present'; else echo 'pm2_binary=absent'; fi
if command -v docker >/dev/null 2>&1; then
    docker --version
    if docker compose version >/dev/null 2>&1; then echo 'compose_cli=present'; else echo 'compose_cli=absent'; fi
    if docker --host unix:///var/run/docker.sock info --format '{{.ServerVersion}}' >/dev/null 2>&1; then echo 'docker_daemon_access=yes'; else echo 'docker_daemon_access=no'; fi
else echo 'docker=absent'; fi
if command -v caddy >/dev/null 2>&1; then echo 'caddy_binary=present'; else echo 'caddy_binary=absent'; fi
if command -v nginx >/dev/null 2>&1; then echo 'nginx_binary=present'; else echo 'nginx_binary=absent'; fi
printf 'disk_root_kib_total_used_available='; df -Pk / | awk 'NR==2 {print $2, $3, $4}'
if [ -r /proc/meminfo ]; then
    awk '/^(MemTotal|MemAvailable|SwapTotal):/ { print $1 " " $2 " KiB" }' /proc/meminfo
fi
if command -v ss >/dev/null 2>&1; then
    for port in 80 443 3001 3002 4173; do
        # Output only a count, never process metadata or addresses.
        count=$(ss -H -ltn "sport = :$port" | wc -l | tr -d ' ')
        printf 'tcp_port_%s_listeners=%s\n' "$port" "$count"
    done
else echo 'ports=unknown_ss_absent'; fi
printf 'result=read_only_inventory_finished\n'
