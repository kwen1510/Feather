# Quick Reference - Digital Ocean Deployment

## First-Time Setup (Run Once)

```bash
# 1. SSH into your droplet
ssh root@YOUR_DROPLET_IP

# 2. Clone repository (your DEPLOY folder from GitHub)
cd /var/www
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git whiteboard
cd whiteboard

# 3. Run initial setup
chmod +x setup.sh
./setup.sh

# 4. Configure environment
cp .env.example .env
nano .env
# Add your ABLY_API_KEY

# 5. Update nginx config with your IP
nano nginx.conf
# Replace YOUR_DOMAIN_OR_IP with your droplet IP

# 6. Deploy the application
chmod +x deploy.sh
./deploy.sh

# 7. Access at http://YOUR_DROPLET_IP
```

## SSL Setup (Optional, After Domain Setup)

```bash
ssh root@YOUR_DROPLET_IP
cd /var/www/whiteboard
chmod +x setup-ssl.sh
./setup-ssl.sh
```

## Updating Your Application

```bash
# After pushing changes to GitHub:
ssh root@YOUR_DROPLET_IP
cd /var/www/whiteboard
./deploy.sh
```

## Common Commands

### Application Management
```bash
pm2 status                    # Check status
pm2 logs whiteboard-api       # View logs
pm2 restart whiteboard-api    # Restart app
pm2 stop whiteboard-api       # Stop app
pm2 monit                     # Monitor resources
```

### Nginx Management
```bash
systemctl status nginx        # Check status
systemctl restart nginx       # Restart
nginx -t                      # Test config
```

### View Logs
```bash
pm2 logs whiteboard-api --lines 100
tail -f /var/log/nginx/whiteboard-error.log
tail -f /var/log/nginx/whiteboard-access.log
```

### Firewall
```bash
ufw status                    # Check firewall
ufw allow 80/tcp              # Allow HTTP
ufw allow 443/tcp             # Allow HTTPS
```

### SSL Certificate
```bash
certbot certificates          # Check certificates
certbot renew                 # Renew manually
certbot renew --dry-run       # Test renewal
```

## Troubleshooting

### App won't start
```bash
pm2 logs whiteboard-api --err
cat /var/www/whiteboard/.env
lsof -i :8080
```

### Can't access website
```bash
systemctl status nginx
nginx -t
ufw status
curl http://localhost
```

### Real-time not working
```bash
# Check browser console
# Verify Ably key in .env
curl http://localhost:8080/api/token?clientId=test
```

## File Locations

- **App**: `/var/www/whiteboard/`
- **Nginx Config**: `/etc/nginx/sites-available/whiteboard`
- **Environment**: `/var/www/whiteboard/.env`
- **Logs**: `/var/log/nginx/` and `/var/log/pm2/`
- **SSL Certs**: `/etc/letsencrypt/live/YOUR_DOMAIN/`

## Important URLs

- **Ably Dashboard**: https://ably.com/dashboard
- **Digital Ocean Console**: https://cloud.digitalocean.com/
- **PM2 Docs**: https://pm2.keymetrics.io/
- **Let's Encrypt**: https://letsencrypt.org/

## Emergency Recovery

### Complete restart
```bash
pm2 restart whiteboard-api
systemctl restart nginx
```

### Full redeployment
```bash
cd /var/www/whiteboard
git pull
rm -rf node_modules
npm install
npm run build
pm2 restart whiteboard-api
```

### Check what's running
```bash
ps aux | grep node
ps aux | grep nginx
netstat -tlnp | grep :8080
netstat -tlnp | grep :80
```

---

For detailed instructions, see **DEPLOY.md** in the root directory.
