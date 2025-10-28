#!/bin/bash

# Collaborative Whiteboard - Deployment Script
# Run this script after initial setup to deploy or update the application

set -e  # Exit on any error

echo "============================================"
echo "Collaborative Whiteboard - Deployment"
echo "============================================"
echo ""

APP_DIR="/var/www/whiteboard"
ENV_BACKUP="/etc/whiteboard/.env"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Check if app directory exists
if [ ! -d "$APP_DIR" ]; then
    echo "Error: Application directory $APP_DIR does not exist"
    echo "Please clone your repository first."
    exit 1
fi

cd $APP_DIR

# Pull latest changes (if using git)
echo "[1/9] Pulling latest changes from Git..."
if [ -d ".git" ]; then
    git pull origin main || git pull origin master
else
    echo "Not a git repository, skipping..."
fi

# Install dependencies
echo "[2/9] Installing dependencies..."
npm install

# Build the frontend
echo "[3/9] Building frontend..."
npm run build
npm prune --production

echo "[4/9] Validating environment configuration..."
if [ ! -f "$APP_DIR/.env" ]; then
    if [ -f "$ENV_BACKUP" ]; then
        echo "Restoring .env from backup..."
        cp "$ENV_BACKUP" "$APP_DIR/.env"
    else
        echo "Warning: .env file not found!"
        echo "Please copy .env.example to .env and configure it"
        exit 1
    fi
fi

mkdir -p "$(dirname "$ENV_BACKUP")"
cp "$APP_DIR/.env" "$ENV_BACKUP"

# Copy nginx configuration
echo "[5/9] Configuring Nginx..."
if [ -f "$APP_DIR/nginx.conf" ]; then
    cp $APP_DIR/nginx.conf /etc/nginx/sites-available/whiteboard

    # Create symbolic link if it doesn't exist
    if [ ! -L /etc/nginx/sites-enabled/whiteboard ]; then
        ln -s /etc/nginx/sites-available/whiteboard /etc/nginx/sites-enabled/
    fi

    # Remove default nginx site if it exists
    if [ -L /etc/nginx/sites-enabled/default ]; then
        rm /etc/nginx/sites-enabled/default
    fi

    # Test nginx configuration
    nginx -t
else
    echo "Warning: nginx.conf not found, skipping nginx setup"
fi

# PM2 will use ecosystem.config.js in the current directory
echo "[6/9] Verifying PM2 configuration..."
if [ ! -f "$APP_DIR/ecosystem.config.js" ]; then
    echo "Warning: ecosystem.config.js not found!"
    exit 1
fi

# Restart Nginx
echo "[7/9] Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

# Start/Restart PM2 application
echo "[8/9] Starting application with PM2..."
cd $APP_DIR

# Stop existing PM2 process if running
pm2 stop whiteboard-api || true
pm2 delete whiteboard-api || true

# Start the application
pm2 start ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# Show PM2 status
echo "[9/9] Application status..."
pm2 status

echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Application is now running!"
echo ""
echo "Useful commands:"
echo "  pm2 status              - Check application status"
echo "  pm2 logs whiteboard-api - View application logs"
echo "  pm2 restart whiteboard-api - Restart application"
echo "  pm2 stop whiteboard-api - Stop application"
echo "  nginx -t                - Test nginx configuration"
echo "  systemctl status nginx  - Check nginx status"
echo ""
echo "Access your application at: http://YOUR_SERVER_IP"
echo ""
