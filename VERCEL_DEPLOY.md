# Vercel Deployment Guide

Complete guide for deploying the Feather collaborative whiteboard application to Vercel.

## Prerequisites

Before you begin, make sure you have:
- ✅ A Vercel account ([Sign up free](https://vercel.com/signup))
- ✅ An Ably API key ([Get from ably.com](https://ably.com/dashboard))
- ✅ Node.js installed (v18 or higher)
- ✅ Git repository set up (optional, but recommended)

## Quick Start

Get your collaborative whiteboard running on Vercel in 10 minutes:

### Step 1: Install Vercel CLI (2 min)

```bash
npm i -g vercel
```

Verify installation:
```bash
vercel --version
```

### Step 2: Link Your Project (1 min)

From the project root directory:

```bash
vercel link
```

You'll be prompted to:
1. Log in to Vercel (opens browser)
2. Choose to link to existing project or create new one
3. Set project name and settings

### Step 3: Set Up Neon Postgres Database

1. **Create Database via Vercel Dashboard:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Select your project
   - Navigate to **Storage** → **Create Database** → **Neon**
   - Choose your region (closest to your users)
   - Click **Create**
   - Vercel will automatically add `POSTGRES_URL` to your environment variables

2. **Set Up Database Schema:**
   - Go to **Storage** → Your Neon database → **SQL Editor**
   - Copy and paste the contents of `neon-schema.sql` from the project root
   - Run the SQL script to create all tables

### Step 4: Configure Environment Variables (3 min)

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:

   **ABLY_API_KEY**
   - Key: `ABLY_API_KEY`
   - Value: Your Ably API key (format: `app-key-id:secret-key`)
   - Get from: https://ably.com/dashboard
   - Used by: `/api/token` serverless function
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

   **POSTGRES_URL** (should be auto-added by Neon integration)
   - Key: `POSTGRES_URL`
   - Value: Automatically set by Vercel when you create Neon database
   - The `POSTGRES_URL` is a pooled connection string optimized for serverless
   - Verify it exists in **Settings** → **Environment Variables**

#### Option B: Via Vercel CLI

```bash
# Add Ably API Key
vercel env add ABLY_API_KEY

# When prompted, enter your Ably API key (format: app-key-id:secret-key)
# Select all environments (production, preview, development)
```

For each variable, you'll be prompted to:
1. Enter the value
2. Select which environments to apply it to (Production, Preview, Development)

### Step 5: Deploy (2 min)

#### Preview Deployment

```bash
vercel
```

This creates a preview deployment with a unique URL. Use this to test before going to production.

#### Production Deployment

```bash
vercel --prod
```

This deploys to your production domain.

### Step 6: Verify Deployment (2 min)

After deployment, test the following:

1. **Visit your deployment URL**
   - Preview: Shown after `vercel` command
   - Production: Shown after `vercel --prod` command

2. **Test Ably Connection:**
   - Open the app in browser
   - Check browser console (F12) for connection logs
   - Create a room as teacher
   - Join as student in another tab/window
   - Verify real-time drawing sync works

3. **Test Database Persistence:**
   - Create a session as teacher
   - Have a student join and draw
   - Send content to class
   - Verify data is saved (check Neon SQL Editor)

4. **Test API Endpoints:**
   - Visit `https://your-app.vercel.app/api/token?clientId=test`
   - Should return JSON with Ably token
   - Check `/api/strokes/persist` endpoint (used internally)

## Environment Variables

### Required Environment Variables

#### Ably API Key
```
ABLY_API_KEY=your-ably-api-key-here
```
- Format: `app-key-id:secret-key`
- Get from: https://ably.com/dashboard
- Used by: `/api/token` serverless function

#### Neon Postgres Connection (Auto-configured via Vercel Integration)
```
POSTGRES_URL=postgresql://user:password@host/database?sslmode=require
```
- **Automatically provided** when you integrate Neon Postgres via Vercel dashboard
- Get from: Vercel dashboard → Project Settings → Storage → Neon (after integration)
- Used by: Backend API endpoints and serverless functions only
- The `POSTGRES_URL` is a pooled connection string optimized for serverless
- **Note**: Database credentials are kept secure on the backend - frontend connects through API endpoints

### Setting Up Neon Postgres with Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Create Database** → **Neon**
3. Choose your region and create the database
4. Vercel will automatically add `POSTGRES_URL` to your environment variables
5. Run the `neon-schema.sql` file in Neon SQL Editor to create the schema

### How to Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable for all environments (Production, Preview, Development)
4. Redeploy your project for changes to take effect

### Local Development

For local development, create a `.env.local` file in the project root:

```bash
# Ably API Key
ABLY_API_KEY=your-ably-api-key-here

# Neon Postgres Connection (get from Neon dashboard)
POSTGRES_URL=postgresql://user:password@host/database?sslmode=require
```

## Continuous Deployment

Vercel automatically deploys when you push to your Git repository:

1. **Connect Git Repository:**
   - Go to Vercel Dashboard → Your Project → **Settings** → **Git**
   - Connect your Git provider (GitHub, GitLab, Bitbucket)
   - Select your repository
   - Vercel will automatically deploy on pushes

2. **Automatic Deployments:**
   - Push to `main` branch → Production deployment
   - Push to other branches → Preview deployment
   - Pull requests → Preview deployment with comments

## Monitoring

- **Function Logs**: View in Vercel dashboard under **Deployments** → **Function Logs**
- **Analytics**: Enable in **Settings** → **Analytics**
- **Real-time Logs**: Use `vercel logs` command or view in dashboard

### Viewing Logs

**Function Logs (CLI):**
```bash
vercel logs [deployment-url]
vercel logs --follow  # Real-time logs
```

**Function Logs (Dashboard):**
1. Go to Vercel dashboard
2. Select your project
3. Click on a deployment
4. Click "Functions" tab
5. View logs for each function

### Deployment Status

```bash
vercel ls                 # List all deployments
vercel inspect [url]      # Inspect specific deployment
```

## Troubleshooting

### Build Errors

If you encounter build errors:

```bash
# Clear cache and rebuild
rm -rf node_modules dist .vercel
npm install
vercel --prod
```

### Environment Variables Not Working

- Ensure variables are set for the correct environment (Production/Preview/Development)
- Redeploy after adding new environment variables: `vercel --prod`
- Check function logs in Vercel dashboard: **Deployments** → **Function Logs**
- Check variable names match exactly (case-sensitive)

### API Functions Not Found

- Verify `api/` directory is in the project root
- Check `vercel.json` configuration
- Ensure functions are deployed: Check **Deployments** → **Functions** tab

### Database Connection Issues

- Verify `POSTGRES_URL` is set in environment variables
- Check Neon database is running: Vercel Dashboard → **Storage** → Your database
- Verify schema is created: Run `neon-schema.sql` in Neon SQL Editor

### CORS Issues

CORS headers are already configured in the serverless functions. If you still encounter issues:

- Check browser console for specific error messages
- Verify the request is going to the correct Vercel domain
- Ensure API routes use relative paths (`/api/token`, not `http://localhost:8080/api/token`)

## Quick Reference

### Vercel CLI Commands

```bash
vercel                    # Deploy preview
vercel --prod            # Deploy to production
vercel link               # Link to existing project
vercel env add            # Add environment variable
vercel env ls             # List environment variables
vercel env rm             # Remove environment variable
vercel logs               # View function logs
vercel inspect            # Inspect deployment
vercel pull               # Pull environment variables
vercel ls                 # List all deployments
```

### Common Tasks

**Rollback Deployment:**
1. Go to Vercel dashboard
2. Select project → Deployments
3. Find previous deployment
4. Click "..." → "Promote to Production"

**Custom Domain:**
1. Go to **Settings** → **Domains**
2. Add your domain
3. Update DNS records as instructed
4. Wait for SSL certificate (automatic)

**Team Collaboration:**
1. Go to **Settings** → **Team**
2. Invite team members
3. Set permissions (Viewer/Developer/Admin)

### File Locations

- **Serverless Functions**: `api/` directory
- **Configuration**: `vercel.json`
- **Environment Variables**: Vercel dashboard or `.env.local` (local)
- **Build Output**: `dist/` (created during build)

### Important URLs

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Ably Dashboard**: https://ably.com/dashboard
- **Neon Dashboard**: https://console.neon.tech
- **Vercel Docs**: https://vercel.com/docs

## Next Steps

- 🎨 **Custom Domain**: Add in **Settings** → **Domains**
- 📊 **Analytics**: Enable in **Settings** → **Analytics**
- 🔍 **Monitoring**: Set up alerts in **Deployments** → **Function Logs**
- 🚀 **Optimize**: Review performance in **Analytics** dashboard

## Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Application Docs**: See [APP_README.md](APP_README.md) for feature documentation
- **Local Development**: See [README.md](README.md#local-development) for local setup

---

**Ready to deploy?** Run `vercel link` to get started! 🚀
