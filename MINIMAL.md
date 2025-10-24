# ⚡ Absolute Minimum - Copy & Paste

## 1. Create Droplet

- Go to digitalocean.com → Create Droplet
- Choose: **Ubuntu 22.04**, **$6 or $12 plan**
- Get your **IP address**

## 2. Upload to GitHub

```bash
cd /Users/etdadmin/Desktop/Ably/DEPLOY
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## 3. Deploy (One Command Block)

SSH into droplet: `ssh root@YOUR_DROPLET_IP`

Then **copy-paste this entire block**:

```bash
apt-get update && apt-get install -y git curl && \
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
apt-get install -y nodejs nginx && npm install -g pm2 && \
cd /var/www && \
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git whiteboard && \
cd whiteboard && \
cp .env.example .env && \
echo "" && echo "⚠️  EDIT .env NOW - Add your Ably API key:" && \
nano .env
```

After saving .env, continue:

```bash
sed -i "s/YOUR_DOMAIN_OR_IP/$(curl -s ifconfig.me)/g" nginx.conf && \
npm install --production && npm run build && \
cp nginx.conf /etc/nginx/sites-available/whiteboard && \
ln -s /etc/nginx/sites-available/whiteboard /etc/nginx/sites-enabled/ && \
rm -f /etc/nginx/sites-enabled/default && \
nginx -t && systemctl restart nginx && \
pm2 start ecosystem.config.js --env production && \
pm2 save && pm2 startup && \
ufw --force enable && ufw allow OpenSSH && ufw allow 'Nginx Full' && \
echo "" && echo "✅ DONE! Visit: http://$(curl -s ifconfig.me)"
```

## 4. Access

Open browser: `http://YOUR_DROPLET_IP`

---

## Troubleshoot

```bash
pm2 logs whiteboard-api    # View logs
pm2 restart whiteboard-api # Restart app
systemctl status nginx     # Check nginx
cat .env                   # Verify Ably key
```

---

**That's it. 3 command blocks.**
