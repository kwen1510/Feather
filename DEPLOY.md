# Digital Ocean Deployment Guide

Complete guide for deploying the Collaborative Whiteboard application to a Digital Ocean Droplet.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Droplet Setup](#droplet-setup)
3. [Initial Server Configuration](#initial-server-configuration)
4. [Deploy the Application](#deploy-the-application)
5. [Configure Domain and SSL](#configure-domain-and-ssl)
6. [Maintenance and Updates](#maintenance-and-updates)
7. [Troubleshooting](#troubleshooting)
8. [Security Best Practices](#security-best-practices)

---

## Prerequisites

Before you begin, ensure you have:

- [ ] A Digital Ocean account ([Sign up here](https://www.digitalocean.com/))
- [ ] An Ably API key ([Get free key at ably.com](https://ably.com/))
- [ ] SSH key for secure server access ([How to create](https://docs.digitalocean.com/products/droplets/how-to/add-ssh-keys/))
- [ ] (Optional) A domain name for HTTPS access
- [ ] Git repository with your code (GitHub, GitLab, Bitbucket, etc.)

**Estimated Time**: 30-45 minutes

**Estimated Cost**: $6-12/month for a basic droplet

---

## Droplet Setup

### Step 1: Create a New Droplet

1. Log in to your Digital Ocean account
2. Click **Create** → **Droplets**
3. Choose configuration:

   **Image**: Ubuntu 22.04 (LTS) x64

   **Droplet Type**: Basic

   **CPU Options**: Regular (Shared CPU)

   **Size**:
   - For testing: $6/month (1 GB RAM, 1 CPU)
   - For production: $12/month (2 GB RAM, 1 CPU) - Recommended

   **Datacenter Region**: Choose closest to your users

   **Authentication**: Select your SSH key

   **Hostname**: `whiteboard-app` (or your preference)

4. Click **Create Droplet**
5. Wait 1-2 minutes for droplet creation
6. Note your droplet's IP address (e.g., `164.90.123.45`)

### Step 2: Access Your Droplet

Open your terminal and SSH into your droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Example:
```bash
ssh root@164.90.123.45
```

You should see a welcome message from Ubuntu.

---

## Initial Server Configuration

### Step 1: Run Initial Setup Script

First, update your server and install required software:

```bash
# Update package lists
apt-get update

# Install git
apt-get install -y git

# Clone your repository (the DEPLOY folder)
cd /var/www
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git whiteboard
cd whiteboard

# Make setup script executable
chmod +x setup.sh

# Run the setup script
./setup.sh
```

The setup script will install:
- Node.js v20.x (LTS)
- PM2 (Process Manager)
- Nginx (Web Server)
- UFW Firewall
- Certbot (for SSL certificates)
- Build tools

**This takes 5-10 minutes.**

### Step 2: Configure Environment Variables

Create and configure your `.env` file:

```bash
cd /var/www/whiteboard

# Copy example environment file
cp .env.example .env

# Edit the .env file
nano .env
```

Update the following in the `.env` file:

```bash
ABLY_API_KEY=your-actual-ably-key:your-actual-secret
NODE_ENV=production
PORT=8080
```

**How to get your Ably API key:**
1. Go to [ably.com/dashboard](https://ably.com/dashboard)
2. Select your app or create a new one
3. Click "API Keys" tab
4. Copy the full key (format: `app-key-id:secret`)

Save and exit:
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

### Step 3: Update Nginx Configuration

Edit the nginx configuration to use your server IP:

```bash
nano /var/www/whiteboard/nginx.conf
```

Replace `YOUR_DOMAIN_OR_IP` with your droplet's IP address:

```nginx
server_name 164.90.123.45;  # Your droplet IP
```

Save and exit (`Ctrl + X`, `Y`, `Enter`).

---

## Deploy the Application

### Run Deployment Script

Now deploy the application:

```bash
cd /var/www/whiteboard

# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The deployment script will:
1. Install Node.js dependencies
2. Build the React frontend
3. Configure Nginx
4. Start the Node.js backend with PM2
5. Enable services to start on boot

**This takes 3-5 minutes.**

### Verify Deployment

Check if everything is running:

```bash
# Check PM2 status
pm2 status

# Check Nginx status
systemctl status nginx

# View application logs
pm2 logs whiteboard-api --lines 50
```

### Test Your Application

Open your browser and navigate to:

```
http://YOUR_DROPLET_IP
```

You should see the Collaborative Whiteboard landing page!

**Test the functionality:**
1. Enter a room name (e.g., "test")
2. Open as Student in one browser tab
3. Open as Teacher in another tab
4. Draw in both and verify real-time sync

---

## Configure Domain and SSL

### Step 1: Point Domain to Droplet

If you have a domain name:

1. Go to your domain registrar (GoDaddy, Namecheap, etc.)
2. Add an A record:
   - **Type**: A
   - **Name**: @ (or subdomain like `whiteboard`)
   - **Value**: YOUR_DROPLET_IP
   - **TTL**: 3600

3. Wait for DNS propagation (5-60 minutes)

4. Verify DNS:
```bash
# From your local machine
nslookup your-domain.com
```

### Step 2: Set Up SSL Certificate

Once your domain is pointing to the droplet:

```bash
cd /var/www/whiteboard

# Make SSL setup script executable
chmod +x setup-ssl.sh

# Run SSL setup
./setup-ssl.sh
```

You'll be prompted for:
- Your domain name (e.g., `whiteboard.example.com`)
- Your email address (for certificate expiration notices)

The script will:
1. Update Nginx configuration with your domain
2. Obtain a free SSL certificate from Let's Encrypt
3. Configure auto-renewal
4. Redirect HTTP to HTTPS

### Step 3: Update Application URLs

After SSL is set up, update the application to use HTTPS:

```bash
nano /var/www/whiteboard/src/pages/Teacher.jsx
```

Find this line (around line 35):
```javascript
authUrl: 'http://localhost:8080/api/token',
```

Change to:
```javascript
authUrl: '/api/token',  // Use relative URL
```

Do the same for `src/pages/Student.jsx`.

Then rebuild and redeploy:

```bash
npm run build
pm2 restart whiteboard-api
```

Now access your app securely at:
```
https://your-domain.com
```

---

## Maintenance and Updates

### Updating Your Application

When you push changes to your Git repository:

```bash
# SSH into your droplet
ssh root@YOUR_DROPLET_IP

# Run the deploy script
cd /var/www/whiteboard
./deploy.sh
```

The script will:
- Pull latest changes
- Install new dependencies
- Rebuild frontend
- Restart the backend

### Viewing Logs

**Application logs:**
```bash
pm2 logs whiteboard-api
pm2 logs whiteboard-api --lines 100
pm2 logs whiteboard-api --err  # Only errors
```

**Nginx logs:**
```bash
tail -f /var/log/nginx/whiteboard-access.log
tail -f /var/log/nginx/whiteboard-error.log
```

### PM2 Commands

```bash
pm2 status                    # View status
pm2 restart whiteboard-api    # Restart app
pm2 stop whiteboard-api       # Stop app
pm2 start whiteboard-api      # Start app
pm2 delete whiteboard-api     # Remove from PM2
pm2 monit                     # Monitor resources
```

### Nginx Commands

```bash
systemctl status nginx        # Check status
systemctl restart nginx       # Restart Nginx
systemctl reload nginx        # Reload config
nginx -t                      # Test configuration
```

### SSL Certificate Renewal

Certificates auto-renew, but you can manually renew:

```bash
certbot renew
certbot renew --dry-run  # Test renewal
```

---

## Troubleshooting

### Application Not Accessible

**Check Nginx:**
```bash
systemctl status nginx
nginx -t
```

**Check firewall:**
```bash
ufw status
ufw allow 80/tcp
ufw allow 443/tcp
```

**Check if port 8080 is in use:**
```bash
lsof -i :8080
```

### PM2 Application Crashed

**View error logs:**
```bash
pm2 logs whiteboard-api --err --lines 50
```

**Common issues:**
- Missing `.env` file
- Invalid Ably API key
- Port 8080 already in use

**Restart the app:**
```bash
pm2 restart whiteboard-api
```

### Ably Connection Issues

**Check environment variables:**
```bash
cat /var/www/whiteboard/.env
```

**Verify API key format:**
- Should be: `app-key:secret-key`
- No spaces or quotes

**Test token endpoint:**
```bash
curl http://localhost:8080/api/token?clientId=test
```

Should return a JSON token response.

### SSL Certificate Issues

**Check certificate status:**
```bash
certbot certificates
```

**Renew certificate:**
```bash
certbot renew --force-renewal
```

**Check Nginx HTTPS config:**
```bash
nginx -t
cat /etc/nginx/sites-available/whiteboard
```

### Real-time Sync Not Working

**Check if both layers are publishing:**
- Open browser console (F12)
- Look for "Published" messages
- Check for Ably connection errors

**Verify CORS settings:**
The server.js already allows all origins for development.
For production, you may want to restrict this.

### Build Errors

**Clear and rebuild:**
```bash
cd /var/www/whiteboard
rm -rf node_modules
rm -rf dist
npm install
npm run build
```

---

## Security Best Practices

### 1. Create a Non-Root User

```bash
# Create new user
adduser deployer

# Add to sudo group
usermod -aG sudo deployer

# Copy SSH keys
rsync --archive --chown=deployer:deployer ~/.ssh /home/deployer

# Switch to new user
su - deployer
```

Then use this user instead of root.

### 2. Configure Firewall Properly

```bash
# Check current rules
ufw status verbose

# Only allow necessary ports
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### 3. Keep System Updated

```bash
# Regular updates
apt-get update
apt-get upgrade -y

# Enable automatic security updates
apt-get install unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

### 4. Secure Nginx

Already configured in `nginx.conf`:
- Security headers
- XSS protection
- Frame options
- Content type sniffing prevention

### 5. Rate Limiting (Optional)

Add to nginx.conf to prevent abuse:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
    limit_req zone=api burst=20;
    # ... rest of config
}
```

### 6. Monitor Your Application

**Set up monitoring:**
```bash
# Install monitoring tools
pm2 install pm2-logrotate

# Set up alerts
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 7. Backup Strategy

**Backup important files:**
```bash
# Create backup script
cat > /root/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/whiteboard_$DATE.tar.gz \
    /var/www/whiteboard/.env \
    /var/www/whiteboard/DEPLOY \
    /etc/nginx/sites-available/whiteboard
# Keep only last 7 backups
ls -t $BACKUP_DIR/*.tar.gz | tail -n +8 | xargs rm -f
EOF

chmod +x /root/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /root/backup.sh") | crontab -
```

---

## Architecture Overview

### How It Works in Production

```
User Browser
    ↓
HTTPS (Port 443)
    ↓
Nginx (Reverse Proxy)
    ├─→ Static Files (/var/www/whiteboard/dist)
    └─→ API Requests → Node.js Server (localhost:8080)
                           ↓
                       Ably Realtime
```

### File Structure on Server

```
/var/www/whiteboard/       # Your cloned GitHub repository
├── dist/                  # Built React app (served by Nginx)
├── src/                   # Source code
├── server.js              # Node.js API server (runs on PM2)
├── .env                   # Environment variables (KEEP SECURE!)
├── nginx.conf             # Nginx configuration
├── ecosystem.config.js    # PM2 configuration
├── setup.sh               # Initial setup script
├── deploy.sh              # Deployment script
├── setup-ssl.sh           # SSL setup script
├── APP_README.md          # Application documentation
├── DEPLOY.md              # This deployment guide
└── node_modules/          # Dependencies

/etc/nginx/
└── sites-available/
    └── whiteboard         # Nginx configuration (copied from above)

/var/log/
├── nginx/
│   ├── whiteboard-access.log
│   └── whiteboard-error.log
└── pm2/
    └── whiteboard-*.log
```

---

## Costs Breakdown

### Digital Ocean Droplet
- **Basic**: $6/month (1GB RAM) - For testing
- **Recommended**: $12/month (2GB RAM) - For production
- **Bandwidth**: 1-2 TB included

### Ably
- **Free Tier**: 3M messages/month, 200 concurrent connections
- **Paid**: Starts at $29/month for higher limits

### Domain (Optional)
- **Cost**: $10-15/year
- **SSL**: Free with Let's Encrypt

### Total Monthly Cost
- **Minimum**: $6/month (droplet only, no domain)
- **Recommended**: $12/month + domain

---

## Next Steps

After deployment:

1. **Test thoroughly**: Try multiple users, different rooms
2. **Monitor performance**: Use `pm2 monit` and check logs
3. **Set up backups**: Run the backup script daily
4. **Monitor costs**: Check Digital Ocean billing dashboard
5. **Scale if needed**: Upgrade droplet size if you get more users

---

## Support and Resources

- **Digital Ocean Docs**: [docs.digitalocean.com](https://docs.digitalocean.com/)
- **PM2 Docs**: [pm2.keymetrics.io](https://pm2.keymetrics.io/)
- **Nginx Docs**: [nginx.org/en/docs/](http://nginx.org/en/docs/)
- **Let's Encrypt**: [letsencrypt.org](https://letsencrypt.org/)
- **Ably Docs**: [ably.com/docs](https://ably.com/docs)

---

## Appendix: Quick Command Reference

```bash
# SSH into droplet
ssh root@YOUR_IP

# Update application
cd /var/www/whiteboard && ./deploy.sh

# View logs
pm2 logs whiteboard-api
tail -f /var/log/nginx/whiteboard-error.log

# Restart services
pm2 restart whiteboard-api
systemctl restart nginx

# Check status
pm2 status
systemctl status nginx

# SSL renewal
certbot renew

# Firewall
ufw status
ufw allow PORT/tcp
```

---

**Congratulations!** Your Collaborative Whiteboard is now deployed on Digital Ocean and accessible to the world!

If you encounter any issues not covered here, check the logs first, then refer to the Troubleshooting section.
