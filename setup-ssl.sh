#!/bin/bash

# Collaborative Whiteboard - SSL Setup Script
# Run this script to set up HTTPS with Let's Encrypt SSL certificate

set -e  # Exit on any error

echo "============================================"
echo "Collaborative Whiteboard - SSL Setup"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Prompt for domain name
read -p "Enter your domain name (e.g., whiteboard.example.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "Error: Domain name cannot be empty"
    exit 1
fi

# Prompt for email
read -p "Enter your email address for SSL certificate notifications: " EMAIL

if [ -z "$EMAIL" ]; then
    echo "Error: Email address cannot be empty"
    exit 1
fi

echo ""
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""
read -p "Is this correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 0
fi

# Update nginx configuration with domain
echo "[1/4] Updating Nginx configuration..."
sed -i "s/YOUR_DOMAIN_OR_IP/$DOMAIN/g" /etc/nginx/sites-available/whiteboard

# Reload nginx to apply domain changes
nginx -t && systemctl reload nginx

# Obtain SSL certificate
echo "[2/4] Obtaining SSL certificate from Let's Encrypt..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL

# The certbot nginx plugin automatically updates the nginx configuration
# But we can also manually enable the HTTPS block in our config if needed

# Set up auto-renewal
echo "[3/4] Setting up automatic certificate renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

# Test auto-renewal
echo "[4/4] Testing certificate renewal..."
certbot renew --dry-run

echo ""
echo "============================================"
echo "SSL Setup Complete!"
echo "============================================"
echo ""
echo "Your site is now accessible via HTTPS at: https://$DOMAIN"
echo ""
echo "Certificate will auto-renew. Check renewal with:"
echo "  certbot renew --dry-run"
echo ""
echo "Certificate details:"
certbot certificates
