#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}   Feather Deployment Script${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check git status
echo -e "${YELLOW}📋 Current git status:${NC}"
git status
echo ""

# Ask if user wants to continue
read -p "Do you want to continue with deployment? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled.${NC}"
    exit 1
fi

# Ask for commit message
echo ""
echo -e "${YELLOW}✍️  Enter your commit message:${NC}"
read -r COMMIT_MESSAGE

if [ -z "$COMMIT_MESSAGE" ]; then
    echo -e "${RED}❌ Commit message cannot be empty!${NC}"
    exit 1
fi

# Stage all changes
echo ""
echo -e "${BLUE}📦 Staging changes...${NC}"
git add .

# Create commit with formatted message
echo -e "${BLUE}💾 Creating commit...${NC}"
git commit -m "$(cat <<COMMITMSG
${COMMIT_MESSAGE}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
COMMITMSG
)"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Commit failed!${NC}"
    exit 1
fi

# Push to GitHub
echo ""
echo -e "${BLUE}⬆️  Pushing to GitHub...${NC}"
git push origin main

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Push to GitHub failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Pushed to GitHub successfully!${NC}"

# Deploy to Digital Ocean
echo ""
echo -e "${BLUE}🚀 Deploying to Digital Ocean...${NC}"
echo ""

ssh root@146.190.100.142 "cd /var/www/whiteboard && git fetch origin && git reset --hard origin/main && npm run build && pm2 restart all && pm2 status"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}❌ Deployment to Digital Ocean failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}Your changes are now live at: ${NC}http://146.190.100.142"
echo ""
