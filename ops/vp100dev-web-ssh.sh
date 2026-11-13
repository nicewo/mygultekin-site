#!/usr/bin/env bash
# vp100dev: tarayıcıdan terminal (ttyd) + VP100 PLC arayüzü, Tailscale ile dışarıdan güvenli erişim.
#
# Sonuç: https://<makine>.<tailnet>.ts.net        →  vp kullanıcısıyla bash (tmux)
#        https://<makine>.<tailnet>.ts.net:8443   →  VP100 Studio (runtime web arayüzü, 127.0.0.1:8080)
#   - ttyd sadece 127.0.0.1'i dinler (ağa açık değil)
#   - tailscale serve, adresi yalnızca senin Tailscale ağındaki cihazlara açar (internete açık DEĞİL)
#
# Kullanım (vp100dev üzerinde, vp kullanıcısıyla):
#   curl -fsSLO https://raw.githubusercontent.com/nicewo/mygultekin-site/main/ops/vp100dev-web-ssh.sh
#   bash vp100dev-web-ssh.sh
set -euo pipefail

PORT=7681
VP_PORT="${VP_PORT:-8080}"   # VPRuntime --port (deploy/systemd/vp100.service varsayılanı)
RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"

if [[ "$RUN_USER" == "root" ]]; then
  echo "Bu betiği root değil, normal kullanıcıyla (vp) çalıştır." >&2
  exit 1
fi

echo "==> 1/5 ttyd kuruluyor"
sudo apt-get update -qq
sudo apt-get install -y -qq ttyd tmux curl jq

echo "==> 2/5 ttyd servisi ($RUN_USER, sadece 127.0.0.1:$PORT)"
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

echo "==> 3/5 Tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "Aşağıdaki linki tarayıcıda açıp Tailscale hesabınla giriş yap:"
  sudo tailscale up --hostname=vp100dev
fi

echo "==> 4/5 HTTPS adresi (sadece Tailscale ağına açık)"
# İlk seferde HTTPS sertifikalarını açman için bir link gösterebilir; aç, onayla, betik devam eder.
sudo tailscale serve --bg --https=443 "http://127.0.0.1:$PORT"

echo "==> 5/5 VP100 PLC arayüzü (https :8443 → 127.0.0.1:$VP_PORT)"
# Studio WebSocket'i sayfa https ise wss://<aynı host>/ws kullanır; tailscale serve WebSocket'i taşır.
sudo tailscale serve --bg --https=8443 "http://127.0.0.1:$VP_PORT"
PLC_UP=1
curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:$VP_PORT" || PLC_UP=0

DNS="$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
echo
echo "Hazır. Panel kartlarına yazılacak adresler:"
echo "  Terminal : https://$DNS"
echo "  PLC      : https://$DNS:8443"
if [[ "$PLC_UP" == 0 ]]; then
  echo
  echo "Uyarı: VPRuntime şu an 127.0.0.1:$VP_PORT'ta yanıt vermiyor. Runtime çalışınca adres kendiliğinden açılır."
  echo "Farklı portta çalışıyorsa: VP_PORT=<port> bash $0"
fi
echo
echo "Telefon/bilgisayar: Tailscale uygulaması aynı hesapla açık olmalı."
