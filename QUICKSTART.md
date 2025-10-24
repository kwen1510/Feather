# 🚀 Minimal Quick Start - 15 Minutes

Get your whiteboard running on Digital Ocean in 15 minutes.

## Before You Start

You need:
- [ ] GitHub account (upload DEPLOY folder)
- [ ] Digital Ocean account
- [ ] Ably API key from [ably.com/dashboard](https://ably.com/dashboard)

---

## Step 1: Create Droplet (5 min)

1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Click **Create → Droplets**
3. Choose:
   - **Ubuntu 22.04 (LTS) x64**
   - **$6/month** or **$12/month** plan
   - Add your **SSH key**
4. Click **Create Droplet**
5. **Copy the IP address** (e.g., `164.90.123.45`)

---

## Step 2: Upload Code to GitHub (2 min)

```bash
cd /Users/etdadmin/Desktop/Ably/DEPLOY

git init
git add .
git commit -m "Deploy whiteboard"

# Create new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## Step 3: Deploy to Droplet (8 min)

### SSH into your droplet:
```bash
ssh root@YOUR_DROPLET_IP
```

### Run these commands (copy-paste all at once):

```bash
# Update system
apt-get update && apt-get install -y git curl

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 and Nginx
npm install -g pm2
apt-get install -y nginx

# Clone your repo
cd /var/www
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git whiteboard
cd whiteboard

# Configure environment
cp .env.example .env
nano .env
```

**In nano editor:**
- Change `ABLY_API_KEY` to your actual key
- Press `Ctrl+X`, then `Y`, then `Enter` to save

**Continue:**
```bash
# Update nginx config with your IP
sed -i "s/YOUR_DOMAIN_OR_IP/YOUR_DROPLET_IP/g" nginx.conf

# Install dependencies and build
npm install --production
npm run build

# Configure nginx
cp nginx.conf /etc/nginx/sites-available/whiteboard
ln -s /etc/nginx/sites-available/whiteboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Start the app with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Configure firewall
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'

# Done!
echo "✅ Deployment complete! Access at: http://$(curl -s ifconfig.me)"
```

---

## Step 4: Test It

Open browser: `http://YOUR_DROPLET_IP`

You should see the whiteboard landing page!

---

## Common Issues

### Can't connect?
```bash
# Check app is running
pm2 status

# Check nginx
systemctl status nginx

# View logs
pm2 logs whiteboard-api
```

### App crashes?
```bash
# Check your .env file has correct Ably key
cat .env

# Restart app
pm2 restart whiteboard-api
```

### Forgot your IP?
```bash
curl ifconfig.me
```

---

## What Next?

### Update Your App
When you push changes to GitHub:
```bash
ssh root@YOUR_DROPLET_IP
cd /var/www/whiteboard
git pull
npm install --production
npm run build
pm2 restart whiteboard-api
```

### Add HTTPS (Optional)
```bash
# Install certbot
apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate (replace YOUR_DOMAIN)
certbot --nginx -d YOUR_DOMAIN --non-interactive --agree-tos -m YOUR_EMAIL
```

### View Logs
```bash
pm2 logs whiteboard-api         # App logs
pm2 monit                        # Resource monitor
```

---

## Cost

**$6-12/month** for the droplet
**Free** Ably tier (3M messages/month)

---

## Need Help?

- **Full guide**: See [DEPLOY.md](DEPLOY.md)
- **Commands**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md)
- **App info**: See [APP_README.md](APP_README.md)

---

**That's it!** Your collaborative whiteboard is now live on the internet.
