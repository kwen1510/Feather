# Quick Reference - Vercel Deployment

## First-Time Setup

### 1. Install Vercel CLI
```bash
npm i -g vercel
```

### 2. Link Project
```bash
vercel link
```

### 3. Configure Environment Variables
Add these in Vercel dashboard (Settings → Environment Variables):
- `ABLY_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

See [VERCEL_ENV.md](VERCEL_ENV.md) for details.

### 4. Deploy
```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

## Updating Your Application

### Automatic (Recommended)
Just push to your Git repository - Vercel deploys automatically!

```bash
git add .
git commit -m "Update app"
git push
```

### Manual Deployment
```bash
# Preview
vercel

# Production
vercel --prod
```

## Local Development

### Development Server
```bash
npm run dev
```
App runs at `http://localhost:5000`

### With Serverless Functions
```bash
vercel dev
```
Runs full Vercel environment locally including API functions.

### Local API Server (Legacy)
```bash
npm run server
```
Runs the legacy `server.ts` on port 8080 (for testing only).

## Vercel CLI Commands

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
```

## Viewing Logs

### Function Logs (CLI)
```bash
vercel logs [deployment-url]
```

### Function Logs (Dashboard)
1. Go to Vercel dashboard
2. Select your project
3. Click on a deployment
4. Click "Functions" tab
5. View logs for each function

### Real-time Logs
```bash
vercel logs --follow
```

## Monitoring

### Deployment Status
```bash
vercel ls                 # List all deployments
vercel inspect [url]      # Inspect specific deployment
```

### Analytics
- View in Vercel dashboard: **Analytics** tab
- Enable in **Settings** → **Analytics**

## Environment Variables

### Add Variable
```bash
vercel env add VARIABLE_NAME
```

### List Variables
```bash
vercel env ls
```

### Remove Variable
```bash
vercel env rm VARIABLE_NAME
```

### Pull to Local
```bash
vercel pull
```
Creates `.env.local` with variables from Vercel.

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
rm -rf node_modules dist .vercel
npm install
vercel --prod
```

### Functions Not Working
1. Check function logs in Vercel dashboard
2. Verify environment variables are set
3. Check `vercel.json` configuration
4. Ensure functions are in `api/` directory

### Environment Variables Not Working
- Ensure variables are set for correct environment (Production/Preview/Development)
- Redeploy after adding variables: `vercel --prod`
- Check variable names match exactly (case-sensitive)

### CORS Issues
- CORS is configured in serverless functions
- Check browser console for specific errors
- Verify API routes use relative paths (`/api/token`, not absolute URLs)

## Common Tasks

### Rollback Deployment
1. Go to Vercel dashboard
2. Select project → Deployments
3. Find previous deployment
4. Click "..." → "Promote to Production"

### Custom Domain
1. Go to **Settings** → **Domains**
2. Add your domain
3. Update DNS records as instructed
4. Wait for SSL certificate (automatic)

### Team Collaboration
1. Go to **Settings** → **Team**
2. Invite team members
3. Set permissions (Viewer/Developer/Admin)

## File Locations

- **Serverless Functions**: `api/` directory
- **Configuration**: `vercel.json`
- **Environment Variables**: Vercel dashboard or `.env.local` (local)
- **Build Output**: `dist/` (created during build)

## Important URLs

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Ably Dashboard**: https://ably.com/dashboard
- **Supabase Dashboard**: https://app.supabase.com
- **Vercel Docs**: https://vercel.com/docs

## Emergency Recovery

### Redeploy Previous Version
```bash
# List deployments
vercel ls

# Promote specific deployment
# (use dashboard UI - Settings → Deployments → Promote)
```

### Reset Environment
1. Go to Vercel dashboard
2. Settings → Environment Variables
3. Verify all required variables are set
4. Redeploy: `vercel --prod`

---

For detailed instructions, see **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)**
