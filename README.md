# Collaborative Whiteboard - Feather

A real-time collaborative whiteboard application designed for classroom use, enabling real-time interaction between teachers and students.

## What is this?

This is a **production-ready** application deployed on Vercel that includes:
- ✅ Full React application source code
- ✅ Vercel Serverless Functions for API endpoints
- ✅ Real-time collaboration via Ably
- ✅ Data persistence via Neon Postgres
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
   - `POSTGRES_URL` - Neon Postgres connection string (auto-configured via Vercel Neon integration)

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
│       └── persist.ts     # Neon Postgres persistence
│
├── index.html              # HTML entry point
├── package.json            # Dependencies
├── vite.config.ts          # Build configuration
├── vercel.json             # Vercel configuration
│
├── VERCEL_DEPLOY.md        # 📖 Complete deployment guide
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
- Create a `.env.local` file with your environment variables (see [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md#environment-variables))
- Or `vercel dev` will use environment variables from your Vercel project

### Set Up Environment Variables

Create a `.env.local` file in the project root:

```bash
# Ably API Key (required for real-time features)
ABLY_API_KEY=your-ably-api-key-here

# Neon Postgres Connection (required for database operations)
POSTGRES_URL=postgresql://user:password@host/database?sslmode=require
```

**Get your Ably API Key:**
1. Sign up at https://ably.com (free tier available)
2. Go to your dashboard
3. Copy your API key (format: `app-key-id:secret-key`)

**Get your Postgres URL:**
- Option A: Use Vercel's Neon integration (recommended)
  1. Go to Vercel dashboard → Your Project → Storage
  2. Create a Neon database
  3. Copy the `POSTGRES_URL` from environment variables
  
- Option B: Use your own Neon database
  1. Sign up at https://neon.tech
  2. Create a database
  3. Copy the connection string

### Set Up Database Schema

If using a new database, run the schema migration:

1. Open Neon SQL Editor (or connect via psql)
2. Run the contents of `neon-schema.sql` from the project root

The schema creates the following tables:
- `sessions` - Tracks classroom sessions
- `participants` - Tracks teachers and students in sessions
- `questions` - Tracks content sent by teachers
- `annotations` - Stores student drawings and teacher feedback

### Testing Locally

**Test Real-time Collaboration:**
1. Open the app in two browser windows/tabs
2. Create a session as a teacher in one window
3. Join as a student in the other window using the room code
4. Draw on the canvas - changes should sync in real-time

**Test API Endpoints:**
- `GET /api/token?clientId=<id>` - Get Ably authentication token
- `GET /api/sessions` - List all sessions
- `GET /api/questions/[sessionId]` - Get questions for a session
- `POST /api/strokes/persist` - Save annotations

Test them with:
```bash
# Example: Get Ably token
curl http://localhost:3000/api/token?clientId=test-client
```

**Troubleshooting:**

- **Environment Variables Not Loading**: Ensure `.env.local` is in the project root, restart dev server after changes
- **Database Connection Errors**: Verify `POSTGRES_URL` is correct, ensure SSL mode is enabled (`?sslmode=require`)
- **Ably Connection Errors**: Verify `ABLY_API_KEY` format is `app-key-id:secret-key`
- **Port Already in Use**: Vercel dev will auto-assign a different port, or specify with `PORT=3001 vercel dev`

## Deployment

### Vercel (Recommended)

The application is configured for automatic deployment on Vercel:

1. Push to your Git repository
2. Connect repository to Vercel
3. Configure environment variables
4. Deploy automatically on every push

See **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)** for complete deployment instructions.

## Documentation

- **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)** - Complete Vercel deployment guide with environment variables
- **[APP_README.md](APP_README.md)** - Application features and architecture

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
