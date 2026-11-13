#!/usr/bin/env bash
# vp100dev: tarayıcıdan terminal (ttyd) + Tailscale ile dışarıdan güvenli erişim.
#
# Sonuç: https://<makine>.<tailnet>.ts.net  →  vp kullanıcısıyla bash
#   - ttyd sadece 127.0.0.1'i dinler (ağa açık değil)
#   - tailscale serve, adresi yalnızca senin Tailscale ağındaki cihazlara açar (internete açık DEĞİL)
#
# Kullanım (vp100dev üzerinde, vp kullanıcısıyla):
#   curl -fsSLO https://raw.githubusercontent.com/nicewo/mygultekin-site/main/ops/vp100dev-web-ssh.sh
#   bash vp100dev-web-ssh.sh
set -euo pipefail

PORT=7681
RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

if [[ "$RUN_USER" == "root" ]]; then
  echo "Bu betiği root değil, normal kullanıcıyla (vp) çalıştır." >&2
  exit 1
fi

echo "==> 1/4 ttyd kuruluyor"
sudo apt-get update -qq
sudo apt-get install -y -qq ttyd tmux curl jq

echo "==> 2/4 ttyd servisi ($RUN_USER, sadece 127.0.0.1:$PORT)"
sudo tee /etc/systemd/system/ttyd.service >/dev/null <<EOF
[Unit]
Description=ttyd web terminal for $RUN_USER
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$RUN_HOME
Environment=TERM=xterm-256color
# -i lo: sadece yerel arayüz. -W: yazılabilir terminal.
# tmux: sekme kapansa da oturum ve çalışan komutlar kaybolmaz.
ExecStart=/usr/bin/ttyd -i lo -p $PORT -W -t titleFixed=vp100dev -t fontSize=15 -t disableLeaveAlert=true tmux new -A -s web
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now ttyd
sleep 1
if ! curl -fsS -o /dev/null "http://127.0.0.1:$PORT"; then
  echo "ttyd yanıt vermiyor: sudo journalctl -u ttyd -n 50" >&2
  exit 1
fi

echo "==> 3/4 Tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "Aşağıdaki linki tarayıcıda açıp Tailscale hesabınla giriş yap:"
  sudo tailscale up --hostname=vp100dev
fi

echo "==> 4/4 HTTPS adresi (sadece Tailscale ağına açık)"
# İlk seferde HTTPS sertifikalarını açman için bir link gösterebilir; aç, onayla, betik devam eder.
sudo tailscale serve --bg --https=443 "http://127.0.0.1:$PORT"

DNS="$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
echo
echo "Hazır. Panel kartına yazılacak adres:"
echo "  https://$DNS"
echo
echo "Telefon/bilgisayar: Tailscale uygulaması aynı hesapla açık olmalı."
