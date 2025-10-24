# Getting Started - Deploy to Digital Ocean

This guide will help you deploy your collaborative whiteboard application to Digital Ocean in about 15 minutes.

## Prerequisites

Before you begin, make sure you have:

1. **GitHub Account** - To host your code
2. **Digital Ocean Account** - Sign up at [digitalocean.com](https://digitalocean.com)
3. **Ably API Key** - Your key: `TAttrA.HBSoVA:_0PK5rsaBzwn6Xj8mWCRvkQ6bmw__K-XCQgo_V4W8jU`

## Step 1: Upload to GitHub

1. **Create a new repository on GitHub:**
   - Go to [github.com/new](https://github.com/new)
   - Name it: `collaborative-whiteboard`
   - Keep it public or private (your choice)
   - Don't initialize with README (we already have files)
   - Click "Create repository"

2. **Upload this folder to GitHub:**
   - Drag the entire `GITHUB` folder to your desktop
   - Open Terminal/Command Prompt
   - Navigate to the folder:
     ```bash
     cd /path/to/GITHUB/folder
     ```
   - Run these commands (replace YOUR_USERNAME with your GitHub username):
     ```bash
     git init
     git add .
     git commit -m "Initial commit - Collaborative Whiteboard"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/collaborative-whiteboard.git
     git push -u origin main
     ```

## Step 2: Create Digital Ocean Droplet

1. **Log in to Digital Ocean**
   - Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)

2. **Create a new Droplet:**
   - Click "Create" → "Droplets"
   - **Choose image:** Ubuntu 22.04 LTS
   - **Choose size:** Basic plan → $6/month (1GB RAM)
   - **Choose region:** Pick closest to your location
   - **Authentication:** SSH Key (recommended) or Password
   - **Hostname:** whiteboard-app (or any name you like)
   - Click "Create Droplet"

3. **Wait for droplet to be created** (takes about 1 minute)

4. **Copy your droplet's IP address** (shown on the droplet page)

## Step 3: Deploy the Application

1. **Connect to your droplet via SSH:**
   ```bash
   ssh root@YOUR_DROPLET_IP
   ```
   Replace `YOUR_DROPLET_IP` with your actual IP address (e.g., `ssh root@134.122.45.67`)

2. **Clone your GitHub repository:**
   ```bash
   cd /var/www
   git clone https://github.com/YOUR_USERNAME/collaborative-whiteboard.git whiteboard
   cd whiteboard
   ```

3. **Run the setup script** (one-time only):
   ```bash
   chmod +x setup.sh
   sudo ./setup.sh
   ```
   This will install Node.js, PM2, Nginx, and configure the firewall. Takes about 5 minutes.

4. **Configure your environment:**
   ```bash
   cp .env.example .env
   nano .env
   ```
   Update the file with your Ably API key:
   ```
   ABLY_API_KEY=TAttrA.HBSoVA:_0PK5rsaBzwn6Xj8mWCRvkQ6bmw__K-XCQgo_V4W8jU
   NODE_ENV=production
   PORT=8080
   ```
   Press `Ctrl+X`, then `Y`, then `Enter` to save.

5. **Update nginx.conf with your IP address:**
   ```bash
   nano nginx.conf
   ```
   Find the line `server_name YOUR_DOMAIN_OR_IP;` and replace it with your droplet's IP:
   ```
   server_name 134.122.45.67;
   ```
   Press `Ctrl+X`, then `Y`, then `Enter` to save.

6. **Deploy the application:**
   ```bash
   chmod +x deploy.sh
   sudo ./deploy.sh
   ```
   This will build the app and start the servers. Takes about 2 minutes.

## Step 4: Access Your Application

1. **Open your browser** and go to:
   ```
   http://YOUR_DROPLET_IP
   ```
   For example: `http://134.122.45.67`

2. **You should see the landing page!**
   - Enter a room code (e.g., "room1")
   - Choose "Teacher" or "Student"
   - Start drawing!

3. **Test real-time sync:**
   - Open the same room code in another browser/device
   - Draw on one device and see it appear on the other

## Troubleshooting

### Can't connect to application

1. **Check if services are running:**
   ```bash
   pm2 status
   systemctl status nginx
   ```

2. **Check firewall:**
   ```bash
   ufw status
   ```
   Make sure ports 80, 443, and 22 are allowed.

3. **View logs:**
   ```bash
   pm2 logs whiteboard-api
   tail -f /var/log/nginx/whiteboard-error.log
   ```

### Real-time sync not working

1. **Check Ably connection:**
   ```bash
   curl http://localhost:8080/api/token?clientId=test
   ```
   Should return a JSON token.

2. **Check browser console** for errors (F12 in most browsers)

3. **Verify both users are in the same room**

### Application shows blank page

1. **Check if build was successful:**
   ```bash
   ls -la /var/www/whiteboard/dist
   ```
   Should show files.

2. **Rebuild the application:**
   ```bash
   cd /var/www/whiteboard
   npm run build
   systemctl restart nginx
   ```

## Optional: Set Up HTTPS (Requires Domain)

If you have a domain name pointing to your droplet:

```bash
cd /var/www/whiteboard
chmod +x setup-ssl.sh
sudo ./setup-ssl.sh
```

Follow the prompts to set up a free SSL certificate.

## Updating Your Application

When you make changes to your code:

1. **Push changes to GitHub:**
   ```bash
   git add .
   git commit -m "Updated features"
   git push
   ```

2. **SSH into your droplet and redeploy:**
   ```bash
   ssh root@YOUR_DROPLET_IP
   cd /var/www/whiteboard
   ./deploy.sh
   ```

## Common Commands

### Check application status
```bash
pm2 status
systemctl status nginx
```

### View logs
```bash
pm2 logs whiteboard-api
tail -f /var/log/nginx/whiteboard-access.log
tail -f /var/log/nginx/whiteboard-error.log
```

### Restart services
```bash
pm2 restart whiteboard-api
systemctl restart nginx
```

### Stop services
```bash
pm2 stop whiteboard-api
systemctl stop nginx
```

## Need More Help?

- **Quick Setup:** See `MINIMAL.md` for fastest deployment
- **Detailed Guide:** See `DEPLOY.md` for complete documentation
- **App Details:** See `APP_README.md` for application architecture
- **Common Commands:** See `QUICK_REFERENCE.md` for useful commands

## Cost

- **Digital Ocean Droplet:** $6-12/month
- **Ably (Real-time messaging):** Free tier includes 3M messages/month
- **SSL Certificate:** Free (Let's Encrypt)
- **Total:** $6-12/month

## What You Built

You now have a production-ready collaborative whiteboard application running on:

- **Frontend:** React 19 with Vite
- **Backend:** Node.js API server
- **Real-time:** Ably WebSocket messaging
- **Web Server:** Nginx
- **Process Manager:** PM2
- **Server:** Digital Ocean Ubuntu droplet

Congratulations! Your application is live!
