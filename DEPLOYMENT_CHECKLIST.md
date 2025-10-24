# Deployment Checklist

Use this checklist to ensure your application is ready for deployment to Digital Ocean.

## Pre-Deployment Checks

### Application Files
- [x] Source code is complete (`src/` folder)
- [x] Server file is configured (`server.js`)
- [x] Package dependencies are defined (`package.json`)
- [x] Build configuration is set (`vite.config.js`)
- [x] HTML entry point exists (`index.html`)

### Configuration Files
- [x] Nginx configuration included (`nginx.conf`)
- [x] PM2 ecosystem config included (`ecosystem.config.js`)
- [x] Environment template provided (`.env.example`)
- [x] Gitignore configured (`.gitignore`)

### Deployment Scripts
- [x] Setup script ready (`setup.sh`)
- [x] Deploy script ready (`deploy.sh`)
- [x] SSL setup script ready (`setup-ssl.sh`)
- [x] Scripts are executable (chmod +x)

### Documentation
- [x] Main README provided (`README.md`)
- [x] Getting started guide (`GETTING_STARTED.md`)
- [x] Deployment guide (`DEPLOY.md`)
- [x] Quick start guide (`QUICKSTART.md`)
- [x] Minimal guide (`MINIMAL.md`)
- [x] Quick reference (`QUICK_REFERENCE.md`)
- [x] App documentation (`APP_README.md`)

### Dependencies Check
- [x] React 19 installed
- [x] Vite build tool configured
- [x] Konva.js for canvas drawing
- [x] Ably for real-time communication
- [x] React Router for navigation
- [x] Dotenv for environment variables

## Deployment Steps

### Step 1: GitHub Setup
- [ ] Create GitHub repository
- [ ] Initialize Git in GITHUB folder (`git init`)
- [ ] Add all files (`git add .`)
- [ ] Create initial commit (`git commit -m "Initial commit"`)
- [ ] Add remote origin (`git remote add origin [URL]`)
- [ ] Push to GitHub (`git push -u origin main`)

### Step 2: Digital Ocean Setup
- [ ] Create Digital Ocean account
- [ ] Add payment method
- [ ] Generate/upload SSH key
- [ ] Create Ubuntu 22.04 droplet ($6-12/month)
- [ ] Note droplet IP address

### Step 3: Server Configuration
- [ ] SSH into droplet (`ssh root@YOUR_IP`)
- [ ] Clone repository to `/var/www/whiteboard`
- [ ] Run setup script (`sudo ./setup.sh`)
- [ ] Copy `.env.example` to `.env`
- [ ] Add Ably API key to `.env`
- [ ] Update `nginx.conf` with droplet IP

### Step 4: Application Deployment
- [ ] Run deploy script (`sudo ./deploy.sh`)
- [ ] Verify PM2 is running (`pm2 status`)
- [ ] Verify Nginx is running (`systemctl status nginx`)
- [ ] Check firewall rules (`ufw status`)
- [ ] Test token endpoint (`curl http://localhost:8080/api/token?clientId=test`)

### Step 5: Verification
- [ ] Open browser to `http://YOUR_DROPLET_IP`
- [ ] Landing page loads correctly
- [ ] Can create/join a room
- [ ] Drawing works on canvas
- [ ] Real-time sync works between devices
- [ ] Teacher layer visible to students
- [ ] Student layer visible to teacher
- [ ] Undo/redo functionality works

### Step 6: Optional - SSL Setup
- [ ] Point domain to droplet IP
- [ ] Wait for DNS propagation (5 minutes to 24 hours)
- [ ] Run SSL setup script (`sudo ./setup-ssl.sh`)
- [ ] Verify HTTPS access (`https://YOUR_DOMAIN`)

## Production Ready Checklist

### Security
- [x] Environment variables not committed to Git
- [x] Firewall configured (only ports 22, 80, 443)
- [x] CORS headers configured
- [x] Security headers in Nginx
- [x] API key stored securely in `.env`

### Performance
- [x] Production build optimized
- [x] Gzip compression enabled
- [x] Static assets cached
- [x] WebSocket connections supported
- [x] Process manager (PM2) configured

### Reliability
- [x] Auto-restart on crashes (PM2)
- [x] Error logging configured
- [x] Access logging configured
- [x] Process monitoring available

### Documentation
- [x] Deployment guide provided
- [x] Troubleshooting section included
- [x] Common commands documented
- [x] Update procedures documented

## Post-Deployment Tasks

### Monitoring
- [ ] Check PM2 logs regularly (`pm2 logs`)
- [ ] Monitor Nginx logs (`tail -f /var/log/nginx/whiteboard-access.log`)
- [ ] Watch for errors (`tail -f /var/log/nginx/whiteboard-error.log`)
- [ ] Monitor server resources (`htop`)

### Maintenance
- [ ] Set up automatic OS updates
- [ ] Plan for application updates
- [ ] Consider backup strategy
- [ ] Monitor Ably usage (dashboard)
- [ ] Review SSL certificate expiry

### Testing
- [ ] Test with multiple simultaneous users
- [ ] Test on different devices (mobile, tablet, desktop)
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test drawing performance with complex shapes
- [ ] Test real-time sync with high latency
- [ ] Test reconnection after network interruption

## Quick Reference Commands

### Check Status
```bash
pm2 status                     # Application status
systemctl status nginx         # Web server status
ufw status                     # Firewall status
```

### View Logs
```bash
pm2 logs whiteboard-api       # Application logs
tail -f /var/log/nginx/whiteboard-error.log    # Nginx errors
tail -f /var/log/nginx/whiteboard-access.log   # Access logs
```

### Restart Services
```bash
pm2 restart whiteboard-api    # Restart Node.js server
systemctl restart nginx       # Restart web server
```

### Update Application
```bash
cd /var/www/whiteboard
git pull origin main          # Pull latest changes
./deploy.sh                   # Redeploy
```

## Troubleshooting

### Application won't start
1. Check `.env` file has correct Ably API key
2. Verify Node.js is installed: `node --version`
3. Check PM2 logs: `pm2 logs whiteboard-api --err`
4. Verify port 8080 is free: `lsof -i :8080`

### Can't access website
1. Check firewall: `ufw status` (should allow 80, 443, 22)
2. Check Nginx: `systemctl status nginx`
3. Test locally: `curl http://localhost`
4. Verify nginx.conf has correct server_name

### Real-time sync not working
1. Check browser console for errors (F12)
2. Test token endpoint: `curl http://localhost:8080/api/token?clientId=test`
3. Verify Ably API key in `.env`
4. Check both users are in same room
5. Verify WebSocket connection in browser network tab

### SSL certificate issues
1. Verify domain points to droplet: `dig YOUR_DOMAIN`
2. Check certificate status: `certbot certificates`
3. Renew manually: `certbot renew`
4. Check Nginx SSL config: `nginx -t`

## Your Ably API Key

Your Ably API key is already configured:
```
ABLY_API_KEY=TAttrA.HBSoVA:_0PK5rsaBzwn6Xj8mWCRvkQ6bmw__K-XCQgo_V4W8jU
```

Add this to your `.env` file on the server.

## Estimated Costs

- **Digital Ocean Droplet**: $6-12/month
- **Ably (Free Tier)**: $0 (up to 3M messages/month)
- **Domain (Optional)**: ~$12/year
- **SSL Certificate**: $0 (Let's Encrypt)

**Total**: $6-12/month

## Support Resources

- **Getting Started**: `GETTING_STARTED.md` - Simple step-by-step guide
- **Minimal Setup**: `MINIMAL.md` - Fastest deployment (10 min)
- **Quick Start**: `QUICKSTART.md` - Balanced approach (15 min)
- **Complete Guide**: `DEPLOY.md` - Full documentation (45 min)
- **Quick Commands**: `QUICK_REFERENCE.md` - Command reference
- **App Details**: `APP_README.md` - Application architecture

---

## Ready to Deploy?

1. **Fastest**: Follow `MINIMAL.md` - 10 minutes
2. **Recommended**: Follow `GETTING_STARTED.md` - 15 minutes
3. **Complete**: Follow `DEPLOY.md` - 45 minutes

All files are ready in the GITHUB folder. Just drag it to GitHub and follow the guide!
