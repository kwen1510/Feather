# Feather Collaborative Whiteboard

This repository hosts a React-based classroom whiteboard that streams strokes between teachers and students in real time. The focus of this codebase is the core app — the React components, a lightweight token server, and the assets required to run them locally or in production.

## Quick start

```bash
npm install
npm run dev         # start Vite on http://localhost:5173
npm run server      # start the Ably token server on port 8080 (optional for dev)
npm run build       # produce a production build in dist/
```

> Most ancillary files (e.g., load testing, Playwright configs, deployment scripts) can be ignored if you only need the app running locally.

## App structure

```
src/
├─ App.jsx             # Route map
├─ main.jsx            # React/Vite entry
├─ index.css           # Global styles
├─ components/
│  ├─ student/         # Reusable student UI pieces
│  │  ├─ StudentCanvas.jsx
│  │  ├─ StudentStatusBar.jsx
│  │  ├─ StudentToolbar.jsx
│  │  ├─ SessionStatusOverlay.jsx
│  │  └─ SharedImageLayer.jsx
│  └─ ...              # Shared components
├─ pages/
│  ├─ Landing.jsx      # Marketing/entry screen
│  ├─ Student.jsx      # Student workspace composed from student components
│  ├─ TeacherDashboard.jsx
│  ├─ StudentLogin.jsx
│  └─ Test*.jsx        # Test harness pages
└─ utils/              # IndexedDB helpers, image utilities, identity helpers
```

The student experience is now composed from focused components (status bar, toolbar, canvas, session overlays) instead of a single monolith, keeping rendering concerns separate from real-time/IndexedDB logic.

## Environment

Create a `.env` file with your Ably API key if you plan to use the real-time features:

```
ABLY_API_KEY=your-ably-api-key:secret
PORT=8080
```

Start the token server with `npm run server` when you need authenticated Ably connections; the React dev server alone is enough for static UI work.

## Deployment notes

For production, build with `npm run build` and serve `dist/` behind your preferred web server. The optional `server.js` can run alongside it (e.g., via PM2) to issue Ably tokens. Other deployment scripts and markdown guides in the repo are provided for reference but are not required to run the app locally.

## License

MIT License - Free for personal and commercial use.

## Credits

Built with:
- [React 19](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Konva.js](https://konvajs.org/) - Canvas library
- [Ably](https://ably.com/) - Real-time messaging
- [PM2](https://pm2.keymetrics.io/) - Process manager
- [Nginx](https://nginx.org/) - Web server

---

**Ready to deploy?** Start with [DEPLOY.md](DEPLOY.md) for the complete guide!

**Need help?** Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common commands.
