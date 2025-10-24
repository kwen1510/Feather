#!/bin/bash

# Collaborative Whiteboard - Digital Ocean Deployment Setup Script
# This script automates the initial setup on a fresh Ubuntu 22.04 server

set -e  # Exit on any error

echo "============================================"
echo "Collaborative Whiteboard - Server Setup"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Update system packages
echo "[1/10] Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js (v20.x LTS)
echo "[2/10] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Install PM2 globally
echo "[3/10] Installing PM2 process manager..."
npm install -g pm2

# Install Nginx
echo "[4/10] Installing Nginx..."
apt-get install -y nginx

# Install Git
echo "[5/10] Installing Git..."
apt-get install -y git

# Create application directory
echo "[6/10] Creating application directory..."
mkdir -p /var/www/whiteboard
mkdir -p /var/log/pm2

# Install UFW firewall
echo "[7/10] Configuring firewall..."
apt-get install -y ufw
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80/tcp
ufw allow 443/tcp

# Configure PM2 to start on boot
echo "[8/10] Configuring PM2 startup..."
pm2 startup systemd -u root --hp /root

# Install build essentials (needed for some npm packages)
echo "[9/10] Installing build essentials..."
apt-get install -y build-essential

# Install certbot for SSL (optional, for HTTPS)
echo "[10/10] Installing Certbot for SSL..."
apt-get install -y certbot python3-certbot-nginx

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Clone your repository (DEPLOY folder) to /var/www/whiteboard"
echo "   git clone YOUR_REPO_URL /var/www/whiteboard"
echo "2. cd /var/www/whiteboard"
echo "3. Copy .env.example to .env and add your Ably API key"
echo "4. Update nginx.conf with your domain/IP"
echo "5. Run ./deploy.sh to complete deployment"
echo ""
echo "See DEPLOY.md for detailed instructions."
