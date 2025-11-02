# 🚀 Quick Start - Vercel Deployment

Get your collaborative whiteboard running on Vercel in 10 minutes.

## Before You Start

You need:
- [ ] A Vercel account ([Sign up free](https://vercel.com/signup))
- [ ] An Ably API key ([Get from ably.com](https://ably.com/dashboard))
- [ ] A Supabase project ([Get from supabase.com](https://supabase.com))
- [ ] Node.js installed locally

---

## Step 1: Install Vercel CLI (2 min)

```bash
npm i -g vercel
```

Verify installation:
```bash
vercel --version
```

---

## Step 2: Link Your Project (1 min)

From the project root directory:

```bash
vercel link
```

You'll be prompted to:
1. Log in to Vercel (opens browser)
2. Choose to link to existing project or create new one
3. Set project name and settings

---

## Step 3: Configure Environment Variables (3 min)

### Option A: Via Vercel Dashboard (Recommended)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:

   ```
   ABLY_API_KEY=your-ably-api-key-here
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key-here
   ```

5. Select **Production**, **Preview**, and **Development** for each
6. Click **Save**

### Option B: Via CLI

```bash
vercel env add ABLY_API_KEY
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
```

For each, enter the value and select environments.

See [VERCEL_ENV.md](VERCEL_ENV.md) for where to get these values.

---

## Step 4: Deploy (2 min)

### Preview Deployment
```bash
vercel
```

This creates a preview deployment with a unique URL.

### Production Deployment
```bash
vercel --prod
```

This deploys to your production domain.

---

## Step 5: Test It (2 min)

1. Open your deployment URL
2. Create a room
3. Open as Teacher in one tab
4. Open as Student in another tab
5. Draw in both - verify real-time sync works!

---

## What's Next?

### Automatic Deployments

Connect your Git repository for automatic deployments:

1. Go to Vercel dashboard → **Settings** → **Git**
2. Connect your repository
3. Every push to `main` → Production deployment
4. Every push to other branches → Preview deployment

### Local Development

```bash
# Development server
npm run dev

# Or with serverless functions
vercel dev
```

### View Logs

```bash
# Function logs
vercel logs

# Or view in dashboard
# Deployments → Select deployment → Functions → Logs
```

---

## Troubleshooting

### Build Fails

```bash
# Clear and rebuild
rm -rf node_modules dist .vercel
npm install
vercel --prod
```

### Functions Not Working

1. Check function logs in Vercel dashboard
2. Verify environment variables are set correctly
3. Ensure variables are set for Production environment
4. Redeploy: `vercel --prod`

### Environment Variables Not Working

- Variables must be set for the environment you're deploying to
- Redeploy after adding variables
- Check variable names match exactly (case-sensitive)

---

## Common Commands

```bash
vercel                    # Deploy preview
vercel --prod            # Deploy production
vercel logs               # View logs
vercel env ls             # List env vars
vercel link               # Link project
```

---

## Cost

**Free tier includes:**
- Unlimited personal projects
- 100GB bandwidth/month
- Automatic SSL certificates
- Global CDN

**When you need more:**
- Pro plan: $20/month
- Team plan: $20/user/month

See [vercel.com/pricing](https://vercel.com/pricing)

---

## Need Help?

- **Full guide**: See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)
- **Environment variables**: See [VERCEL_ENV.md](VERCEL_ENV.md)
- **App features**: See [APP_README.md](APP_README.md)
- **Troubleshooting**: See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md#troubleshooting)

---

**That's it!** Your collaborative whiteboard is now live on Vercel with automatic deployments! 🎉
