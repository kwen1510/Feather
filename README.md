# Collaborative Whiteboard - Feather

A real-time collaborative whiteboard application designed for classroom use, enabling real-time interaction between teachers and students.

## What is this?

This is a **production-ready** application deployed on Vercel that includes:
- ✅ Full React application source code
- ✅ Vercel Serverless Functions for API endpoints
- ✅ Real-time collaboration via Ably
- ✅ Data persistence via Supabase
- ✅ Automatic deployments via Git

## Quick Start

### Deploy to Vercel

1. **Fork or clone this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Deploy to Vercel**
   ```bash
   npm i -g vercel
   vercel
   ```

4. **Configure environment variables** in Vercel dashboard:
   - `ABLY_API_KEY` - Your Ably API key
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key
   - `SUPABASE_URL` - Same as VITE_SUPABASE_URL (backend fallback)
   - `SUPABASE_ANON_KEY` - Same as VITE_SUPABASE_ANON_KEY (backend fallback)

5. **Redeploy** after adding environment variables:
   ```bash
   vercel --prod
   ```

For detailed instructions, see **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)**

## Repository Structure

```
.
├── src/                    # React application
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/         # React components
│   ├── pages/             # Page components
│   └── ...
│
├── api/                    # Vercel Serverless Functions
│   ├── token.ts           # Ably token generation
│   └── strokes/
│       └── persist.ts     # Supabase persistence
│
├── index.html              # HTML entry point
├── package.json            # Dependencies
├── vite.config.ts          # Build configuration
├── vercel.json             # Vercel configuration
│
├── VERCEL_DEPLOY.md        # 📖 Complete deployment guide
├── VERCEL_ENV.md           # 🔐 Environment variables guide
├── MIGRATION_SUMMARY.md    # 📋 Migration overview
├── APP_README.md           # 📱 Application documentation
└── README.md               # This file
```

## Features

- **Dual-Layer Architecture**: Separate editable layers for teachers and students
- **Real-time Synchronization**: Instant updates across all connected clients via Ably
- **Drawing Tools**: Pen and eraser with undo/redo functionality
- **Layer Isolation**: Teachers cannot edit student work and vice versa
- **Data Persistence**: Save sessions and responses to Neon Postgres
- **History View**: Review past sessions and student responses

## Tech Stack

- **Frontend**: React 19 + Vite
- **Canvas**: Konva.js + react-konva
- **Real-time**: Ably Realtime SDK
- **Database**: Neon Postgres (via Vercel integration)
- **Backend**: Vercel Serverless Functions
- **Deployment**: Vercel

## Local Development

### Run the application locally

**Recommended: Use Vercel CLI (matches production environment)**

```bash
# Install dependencies
npm install

# Install Vercel CLI globally (if not already installed)
npm i -g vercel

# Run local development server (runs frontend + serverless functions)
vercel dev
```

This will:
- Start the Vite dev server for the frontend
- Run serverless functions (`api/token.ts` and `api/strokes/persist.ts`) locally
- Match production behavior exactly

**Alternative: Frontend only (API calls won't work)**

```bash
npm run dev
```

The app will be available at `http://localhost:5000` (or the port Vercel assigns)

**Note**: For local development, you'll need to:
- Create a `.env.local` file with your environment variables (see `VERCEL_ENV.md`)
- Or `vercel dev` will use environment variables from your Vercel project

## Deployment

### Vercel (Recommended)

The application is configured for automatic deployment on Vercel:

1. Push to your Git repository
2. Connect repository to Vercel
3. Configure environment variables
4. Deploy automatically on every push

See **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)** for complete instructions.

### Environment Variables

Required environment variables:
- `ABLY_API_KEY` - Ably API key for real-time messaging
- `POSTGRES_URL` - Neon Postgres connection string (auto-configured via Vercel)

See **[VERCEL_ENV.md](VERCEL_ENV.md)** for details.

## Documentation

- **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)** - Complete Vercel deployment guide
- **[VERCEL_ENV.md](VERCEL_ENV.md)** - Environment variables documentation
- **[APP_README.md](APP_README.md)** - Application features and architecture
- **[MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)** - Migration from Digital Ocean to Vercel

## Prerequisites

- Node.js (v18 or higher)
- A Vercel account ([Sign up free](https://vercel.com/signup))
- An Ably account ([Get free tier](https://ably.com))
- A Neon Postgres database (via Vercel integration)

## How It Works

### Architecture

```
User Browser
    ↓
Vercel Edge Network (CDN)
    ├─→ Static Files (React App)
    └─→ /api/* → Serverless Functions
                      ├─→ /api/token → Ably Authentication
                      ├─→ /api/sessions → Session Management
                      ├─→ /api/questions → Question Queries
                      ├─→ /api/responses → Response Queries
                      └─→ /api/strokes/persist → Neon Postgres
```

### Real-time Sync

- Students and teachers connect via Ably
- Each draws on their own layer
- Updates sync in real-time via WebSocket
- Separate channels for student/teacher layers
- Undo/redo works independently per layer

## Cost Breakdown

| Service | Free Tier | Paid |
|---------|-----------|------|
| **Vercel** | Unlimited personal projects | $20/month (Pro) |
| **Ably** | 3M messages/month | $29+/month |
| **Neon Postgres** | 512MB database, autoscaling | $19+/month |
| **Total** | **Free** (for small scale) | **$44+/month** (scaled) |

## Support

- **Deployment Issues**: See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md#troubleshooting)
- **Application Issues**: See [APP_README.md](APP_README.md)
- **Environment Setup**: See [VERCEL_ENV.md](VERCEL_ENV.md)

## License

MIT License - Free for personal and commercial use.

## Credits

Built with:
- [React 19](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Konva.js](https://konvajs.org/) - Canvas library
- [Ably](https://ably.com/) - Real-time messaging
- [Neon](https://neon.tech/) - Serverless Postgres database
- [Vercel](https://vercel.com/) - Deployment platform

---

**Ready to deploy?** See [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md) for step-by-step instructions!
