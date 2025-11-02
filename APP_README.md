# Real-time Collaborative Whiteboard

A two-layer collaborative whiteboard application designed for classroom use, enabling real-time interaction between teachers and students. Each user draws on their own layer while seeing the other's work in real-time.

## Features

### Core Functionality
- **Dual-Layer Architecture**: Separate editable layers for teachers and students
- **Real-time Synchronization**: Instant updates across all connected clients via Ably
- **Drawing Tools**: Pen and eraser with undo/redo functionality
- **Layer Isolation**: Teachers cannot edit student work and vice versa, but both can view each other's annotations
- **Clear Canvas**: Reset your layer while preserving the other layer
- **Visual Differentiation**: Student strokes (black) vs Teacher annotations (red)

### Technical Highlights
- Built with React 19 and Vite for modern, fast development
- Konva.js for high-performance HTML5 canvas rendering
- Ably for reliable real-time pub/sub messaging
- Separate undo/redo stacks per layer
- Optimized eraser logic that only saves undo state when lines are actually erased

## Tech Stack

- **Frontend**: React 19 + Vite
- **Canvas**: Konva.js + react-konva
- **Real-time**: Ably Realtime SDK
- **Routing**: React Router v6
- **Backend**: Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- An Ably account and API key ([Get one free at ably.com](https://ably.com))
- A Supabase project ([Get free tier](https://supabase.com))
- A Vercel account ([Sign up free](https://vercel.com))

## Setup and Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
ABLY_API_KEY=your-app-key:your-secret-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Or use Vercel CLI to pull environment variables:
```bash
vercel pull
```

### 3. Run the Application Locally

**Option A: Development Server Only**
```bash
npm run dev
```
App runs at `http://localhost:5000`

**Option B: With Serverless Functions (Recommended)**
```bash
vercel dev
```
Runs full Vercel environment locally including API functions.

**Option C: Legacy Local Server (for testing)**
```bash
# Terminal 1 - Ably Token Server (Port 8080)
npm run server

# Terminal 2 - Vite Dev Server (Port 5000)
npm run dev
```

### 4. Access the Application

Open your browser and navigate to:
```
http://localhost:5000
```

You'll see a landing page where you can:
1. Enter a room ID (or use the default "demo")
2. Choose to join as a Student or Teacher
3. Open multiple browser windows to test real-time collaboration

## Project Structure

```
Feather/
├── src/
│   ├── App.tsx              # Main app with routing
│   ├── main.tsx             # React entry point
│   ├── index.css            # Global styles
│   ├── components/          # React components
│   ├── pages/               # Page components
│   └── ...
├── api/                     # Vercel Serverless Functions
│   ├── token.ts             # Ably token authentication
│   └── strokes/
│       └── persist.ts       # Supabase persistence
├── server.ts                # Legacy server (for local testing)
├── index.html               # HTML entry point
├── vite.config.ts           # Vite configuration
├── vercel.json              # Vercel configuration
├── package.json             # Dependencies and scripts
└── .env.local               # Environment variables (create this)
```

## How It Works

### Architecture Overview

1. **Authentication Flow**:
   - Client requests a token from `/api/token` endpoint
   - Server generates an Ably TokenRequest using the API key
   - Client uses the token to connect to Ably Realtime

2. **Channel Structure**:
   - Each room uses a single channel: `room-{roomId}`
   - Two event types: `student-layer` and `teacher-layer`
   - Each role publishes to their own event and subscribes to both

3. **Layer Management**:
   - **Student View**:
     - Editable student layer (black strokes)
     - Read-only teacher layer overlay (red strokes)
   - **Teacher View**:
     - Read-only student layer (black strokes)
     - Editable teacher layer (red strokes)

4. **Drawing System**:
   - Each stroke is a Konva Line with points, color, and strokeWidth
   - Lines are stored in state arrays and synced to Ably
   - 150ms debounce prevents excessive publishing during rapid drawing

5. **Undo/Redo Logic**:
   - Each action (drawing, erasing, clearing) saves state to undo stack
   - Redo stack is cleared on new actions
   - Eraser only saves state when lines are actually removed (not on empty clicks)

### Key Components

#### Teacher.jsx & Student.jsx
Both components share similar structure with role-specific differences:

- **State Management**:
  - Own editable lines (teacherLines/studentLines)
  - Read-only lines from the other role
  - Drawing state (tool, isDrawing)
  - Connection state (isConnected, clientId)

- **Event Handlers**:
  - `handleMouseDown`: Initiates drawing or erasing
  - `handleMouseMove`: Extends lines or removes lines within eraser radius
  - `handleMouseUp`: Ends drawing session
  - `handleUndo/Redo`: Manages history stacks
  - `handleClear`: Resets the canvas layer

- **Ably Integration**:
  - Publishes own layer changes with debouncing
  - Subscribes to both layer events
  - Uses `isRemoteUpdate` flag to prevent feedback loops

### Important Implementation Details

#### Layer Isolation
```jsx
// Read-only layer has listening={false}
<Layer listening={false}>
  {/* Other role's lines rendered here */}
</Layer>

// Editable layer accepts mouse events
<Layer>
  {/* Own lines rendered here */}
</Layer>
```

#### Eraser Undo Optimization
The eraser was fixed to only save undo state when lines are actually erased:
- Uses `eraserStateSaved` ref to track if state was saved in current session
- Compares line count before/after erasing
- Only saves state on first successful erasure per mouse drag

#### Signal Transmission
All state changes are transmitted via useEffect with debouncing:
```jsx
useEffect(() => {
  if (!isRemoteUpdate.current && channel) {
    const timer = setTimeout(() => {
      channel.publish('layer-event', { lines, clientId });
    }, 150);
    return () => clearTimeout(timer);
  }
}, [lines, channel, clientId]);
```

## Deployment

### Building for Production

```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

### Deployment

The application is configured for deployment on Vercel. See **[VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)** for complete instructions.

**Quick deployment:**

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Link your project:
```bash
vercel link
```

3. Configure environment variables in Vercel dashboard (see [VERCEL_ENV.md](VERCEL_ENV.md))

4. Deploy:
```bash
vercel --prod
```

**Automatic deployments:** Connect your Git repository to Vercel for automatic deployments on every push.

## Testing Checklist

Before deploying, verify these requirements:

- [ ] Teachers and students cannot edit each other's work
- [ ] Both roles can see each other's annotations in real-time
- [ ] Eraser tool works correctly
- [ ] Undo button only works when there's something to undo
- [ ] Clicking with eraser without erasing doesn't create undo points
- [ ] Redo works after undo
- [ ] Clear button resets only your layer
- [ ] Multiple clients in the same room sync properly
- [ ] Connection status indicator shows correct state

## Troubleshooting

### Common Issues

1. **"Connected to Ably" not showing**:
   - Verify environment variables are set correctly in Vercel dashboard
   - Check `/api/token` endpoint is accessible
   - Check browser console for error messages
   - For local dev: ensure `vercel dev` is running or `npm run server` is running

2. **Changes not syncing between clients**:
   - Ensure both clients are in the same room
   - Check that both clients show "Connected"
   - Look for network errors in browser console

3. **Undo not working**:
   - Undo only works after you've made changes
   - Each role has separate undo history
   - Cannot undo the other role's work

4. **Build warnings about chunk size**:
   - This is normal due to Ably and Konva bundle sizes
   - Consider code splitting for production optimization

## Development Notes

### Recent Fixes

**Eraser Undo Logic (Latest)**:
Fixed a bug where clicking with the eraser tool without actually erasing any lines would still create an undo point. Now the application only saves undo state when lines are actually removed.

### Future Enhancements

Consider these improvements for production use:

- **Authentication**: Add proper user authentication
- **Persistence**: Store drawings in a database for session recovery
- **Room Management**: Add room creation, listing, and access control
- **Drawing Features**: Add color picker, stroke width control, shapes
- **Export**: Allow downloading canvas as image
- **Mobile**: Improve touch/stylus support for tablets
- **Performance**: Implement canvas virtualization for large drawings
- **Compression**: Compress stroke data for long sessions

## API Reference

### Ably Events

#### `student-layer`
Published by students, received by teachers and other students.

**Payload**:
```javascript
{
  lines: Array<Line>,  // Array of line objects
  clientId: string     // Sender's client ID
}
```

#### `teacher-layer`
Published by teachers, received by students and other teachers.

**Payload**:
```javascript
{
  lines: Array<Line>,  // Array of line objects
  clientId: string     // Sender's client ID
}
```

### Line Object Structure

```javascript
{
  tool: 'pen' | 'eraser',
  points: number[],      // [x1, y1, x2, y2, ...]
  color: string,         // 'black' or 'red'
  strokeWidth: number    // 3
}
```

## License

MIT License - feel free to use this for educational purposes.

## Support

For issues, questions, or contributions:
- Check the browser console for error messages
- Verify Ably connection status
- Ensure both servers are running
- Test with multiple browser windows/tabs

## Credits

Built with:
- [React](https://react.dev/)
- [Konva.js](https://konvajs.org/)
- [Ably](https://ably.com/)
- [Vite](https://vitejs.dev/)
