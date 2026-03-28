# ChUB 2000 Web — Deployment Guide

## Prerequisites
- Raspberry Pi 5 with Node.js 22+ installed
- nginx running as reverse proxy
- Cloudflare tunnel (cloudflared) configured

## Installation

1. Copy project to Pi:
   Files sync automatically via Syncthing to /home/pi/projects/CHUB
   Or manually: scp -r . pi@192.168.1.25:/home/pi/projects/CHUB

2. Install dependencies:
   ssh pi@192.168.1.25
   cd /home/pi/projects/CHUB
   npm install --production

3. Install systemd service:
   sudo cp deploy/chub.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable chub
   sudo systemctl start chub

4. Configure nginx:
   Add the contents of deploy/nginx-chub.conf to /etc/nginx/sites-available/jarvis
   sudo nginx -t
   sudo systemctl reload nginx

5. Configure Cloudflare tunnel:
   Add the entries from deploy/cloudflare-tunnel.yaml to your tunnel config
   sudo systemctl restart cloudflared

## Access

| Method | URL |
|--------|-----|
| Local (ethernet) | http://192.168.1.25/chub/ |
| Local (wifi) | http://192.168.1.10/chub/ |
| Direct | http://192.168.1.25:9012/ |
| Cloudflare | https://chub.cpr0duct.com/ |
| Cloudflare | https://chub.cpr0duct.work/ |
| ngrok | https://<ngrok-url>/chub/ |

## Management

- Start: sudo systemctl start chub
- Stop: sudo systemctl stop chub
- Restart: sudo systemctl restart chub
- Logs: journalctl -u chub -f
- Status: sudo systemctl status chub
