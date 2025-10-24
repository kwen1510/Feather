# Collaborative Whiteboard - Complete Deployment Package

This repository contains everything you need to deploy the real-time collaborative whiteboard application to Digital Ocean.

## What is this?

This is a **complete, production-ready** application package that includes:
- ✅ Full React application source code
- ✅ Node.js API server for Ably authentication
- ✅ Automated deployment scripts
- ✅ Nginx web server configuration
- ✅ PM2 process manager setup
- ✅ SSL certificate automation (optional)
- ✅ Comprehensive documentation

## Repository Structure

```
.
├── src/                    # React application
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   └── pages/
│       ├── Landing.jsx     # Room selection
│       ├── Student.jsx     # Student whiteboard view
│       ├── Teacher.jsx     # Teacher whiteboard view
│       └── *.css           # Styles
│
├── server.js               # Node.js token server
├── index.html              # HTML entry point
├── package.json            # Dependencies
├── vite.config.js          # Build configuration
│
├── setup.sh                # ⚙️ Initial server setup
├── deploy.sh               # 🚀 Deployment script
├── setup-ssl.sh            # 🔒 SSL certificate setup
│
├── nginx.conf              # Web server config
├── ecosystem.config.js     # Process manager config
├── .env.example            # Environment template
│
├── DEPLOY.md               # 📖 Complete deployment guide
├── QUICK_REFERENCE.md      # ⚡ Quick commands
├── APP_README.md           # Application documentation
└── README.md               # This file
```

## 🚦 Choose Your Path

| Guide | Time | Best For |
|-------|------|----------|
| **[MINIMAL.md](MINIMAL.md)** | 10 min | Just want it running NOW |
| **[QUICKSTART.md](QUICKSTART.md)** | 15 min | Quick but with explanations |
| **[DEPLOY.md](DEPLOY.md)** | 45 min | Full guide with troubleshooting |

**Recommended:** Start with MINIMAL.md or QUICKSTART.md

---

## Quick Start

### 1. Upload to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Collaborative Whiteboard"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Deploy to Digital Ocean

Follow the complete guide in **[DEPLOY.md](DEPLOY.md)**

**TL;DR:**
1. Create a Digital Ocean Droplet (Ubuntu 22.04)
2. SSH into your droplet
3. Clone this repository
4. Run `./setup.sh` (one-time setup)
5. Configure `.env` with your Ably API key
6. Run `./deploy.sh` (deployment)
7. Access at `http://YOUR_DROPLET_IP`

**Time:** 30-45 minutes
**Cost:** $6-12/month

## File Descriptions

### Application Files

- **src/**: React application source code
  - Uses React 19, Vite for building
  - Konva.js for canvas drawing
  - React Router for navigation

- **server.js**: Node.js server
  - Provides Ably authentication tokens
  - Runs on port 8080
  - Uses environment variables for security

- **package.json**: Dependencies and build scripts
  - `npm run dev` - Development server
  - `npm run build` - Production build
  - `npm run server` - Start token server

### Deployment Scripts (Automated)

#### setup.sh - Initial Server Setup
**Run once** on a fresh Ubuntu 22.04 server.

Installs:
- Node.js v20.x LTS
- PM2 (process manager)
- Nginx (web server)
- Certbot (SSL certificates)
- UFW firewall

**Usage:**
```bash
chmod +x setup.sh
sudo ./setup.sh
```

#### deploy.sh - Application Deployment
**Run** this script to deploy or update the application.

Does:
1. Pull latest code from Git
2. Install npm dependencies
3. Build React frontend
4. Configure Nginx
5. Start/restart PM2 application
6. Verify everything is running

**Usage:**
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

#### setup-ssl.sh - HTTPS Setup
**Optional** script to enable HTTPS with free SSL certificate.

Requires:
- A domain name pointing to your droplet
- Email address for certificate notifications

**Usage:**
```bash
chmod +x setup-ssl.sh
sudo ./setup-ssl.sh
```

### Configuration Files

#### nginx.conf - Web Server Configuration
- Serves React app from `/var/www/whiteboard/dist`
- Proxies API requests to Node.js server (port 8080)
- Includes security headers
- Enables gzip compression
- Configured for WebSocket support (Ably)

**Before deployment:** Replace `YOUR_DOMAIN_OR_IP` with your droplet's IP address or domain.

#### ecosystem.config.js - PM2 Configuration
- Defines how the Node.js server runs
- Auto-restart on crashes
- Logging configuration
- Memory limits
- Production environment settings

#### .env.example - Environment Template
Copy this to `.env` and fill in your values:
```bash
ABLY_API_KEY=your-ably-api-key:your-secret
NODE_ENV=production
PORT=8080
```

**⚠️ Never commit your `.env` file to Git!**

### Documentation

- **DEPLOY.md** - Complete deployment guide
  - Step-by-step Digital Ocean setup
  - Troubleshooting section
  - Security best practices
  - Maintenance instructions

- **QUICK_REFERENCE.md** - Common commands
  - Quick setup commands
  - PM2 management
  - Nginx commands
  - Log viewing

- **APP_README.md** - Application documentation
  - How the app works
  - Architecture overview
  - Local development
  - Feature details

## Prerequisites

To deploy this application, you need:

1. **Digital Ocean Account**
   - Sign up at [digitalocean.com](https://www.digitalocean.com/)
   - Add SSH key for secure access
   - $6-12/month for a droplet

2. **Ably Account**
   - Sign up at [ably.com](https://ably.com/)
   - Free tier includes 3M messages/month
   - Get your API key from the dashboard

3. **Optional: Domain Name**
   - For HTTPS and professional URLs
   - $10-15/year from any registrar
   - Point A record to your droplet's IP

## How It Works

### Architecture

```
User Browser (HTTPS)
        ↓
    Nginx (Port 443/80)
    ├─→ Static Files (React App)
    └─→ /api/* → Node.js (Port 8080)
                      ↓
                  Ably Realtime
```

### Deployment Flow

1. **Clone** repository to `/var/www/whiteboard`
2. **Install** dependencies and build React app
3. **Nginx** serves the built app and proxies API
4. **PM2** keeps Node.js server running 24/7
5. **Firewall** protects the server
6. **SSL** encrypts all traffic (optional)

### Real-time Sync

- Students and teachers connect via Ably
- Each draws on their own layer
- Updates sync in real-time via WebSocket
- Separate channels for student/teacher layers
- Undo/redo works independently per layer

## Development vs Production

### Local Development

```bash
# Terminal 1 - API Server
npm run server

# Terminal 2 - React Dev Server
npm run dev

# Access at http://localhost:5173
```

### Production (Digital Ocean)

```bash
# One-time setup
./setup.sh

# Configure environment
cp .env.example .env
nano .env

# Deploy
./deploy.sh

# Access at http://YOUR_DROPLET_IP
```

## Common Tasks

### Update Application

After making changes and pushing to GitHub:

```bash
ssh root@YOUR_DROPLET_IP
cd /var/www/whiteboard
./deploy.sh
```

### View Logs

```bash
# Application logs
pm2 logs whiteboard-api

# Nginx logs
tail -f /var/log/nginx/whiteboard-error.log
tail -f /var/log/nginx/whiteboard-access.log
```

### Restart Application

```bash
pm2 restart whiteboard-api
```

### Restart Nginx

```bash
systemctl restart nginx
```

### Check Status

```bash
pm2 status                  # Application status
systemctl status nginx      # Web server status
ufw status                  # Firewall status
```

## Security

✅ **Firewall configured** - Only ports 22, 80, 443 open
✅ **SSL supported** - Free certificates via Let's Encrypt
✅ **Environment variables** - Secrets not in code
✅ **Security headers** - XSS, clickjacking protection
✅ **Process isolation** - PM2 manages Node.js safely
✅ **Auto-updates** - SSL certificates renew automatically

## Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs whiteboard-api --err

# Check environment
cat .env

# Check if port 8080 is available
lsof -i :8080
```

### Can't access website

```bash
# Check Nginx
systemctl status nginx
nginx -t

# Check firewall
ufw status

# Test locally
curl http://localhost
```

### Real-time sync not working

- Check browser console for errors
- Verify Ably API key in `.env`
- Test token endpoint: `curl http://localhost:8080/api/token?clientId=test`
- Check that both users are in the same room

## Cost Breakdown

| Service | Free Tier | Paid |
|---------|-----------|------|
| **Digital Ocean Droplet** | - | $6-12/month |
| **Ably** | 3M messages/month | $29+/month |
| **Domain** (optional) | - | ~$12/year |
| **SSL Certificate** | ✅ Free (Let's Encrypt) | - |
| **Total** | - | **$6-12/month** |

## Support

- **Deployment Issues**: See [DEPLOY.md](DEPLOY.md#troubleshooting)
- **Application Issues**: See [APP_README.md](APP_README.md)
- **Quick Commands**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

## What's Next?

After deployment:

1. ✅ Test with multiple users
2. ✅ Set up SSL for HTTPS
3. ✅ Configure backups
4. ✅ Monitor application logs
5. ✅ Plan for scaling if needed

## License

MIT License - Free for personal and commercial use.

## Credits

Built with:
- [React 19](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Konva.js](https://konvajs.org/) - Canvas library
- [Ably](https://ably.com/) - Real-time messaging
- [PM2](https://pm2.keymetrics.io/) - Process manager
- [Nginx](https://nginx.org/) - Web server

---

**Ready to deploy?** Start with [DEPLOY.md](DEPLOY.md) for the complete guide!

**Need help?** Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common commands.
