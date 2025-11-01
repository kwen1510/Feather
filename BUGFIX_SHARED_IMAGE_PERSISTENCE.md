# Bug Fix: Student Shared Image Persistence on Refresh

## Issue
When a student refreshes their page, the shared image/template from the teacher does not reload. The student sees a blank canvas even though the teacher has sent an image or template.

## Root Cause
The teacher was saving the shared image to localStorage for persistence across page refreshes, but the student was NOT. Students relied entirely on Ably messages (`sync-full-state` and `clear-all-drawings`) to receive the shared image. When a student refreshed, they would request the current state from the teacher, but there was a potential race condition or the image might not be delivered immediately.

## Solution
Implement the same localStorage persistence pattern on the student side that already exists on the teacher side. This ensures that when a student refreshes, they immediately load the last shared image from localStorage, providing instant visual feedback without waiting for Ably communication.

## Changes Made

### File: `src/pages/Student.jsx`

#### 1. Added sharedImageRef (line 115)
```javascript
const [sharedImage, setSharedImage] = useState(null);
const sharedImageRef = useRef(null); // Ref to access latest sharedImage in callbacks
```

#### 2. Added localStorage Load Effect (lines 183-197)
```javascript
// Load shared image from localStorage after roomId is initialized
useEffect(() => {
  if (roomId) {
    try {
      const saved = localStorage.getItem(`sharedImage_${roomId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSharedImage(parsed);
        console.log('✅ Restored shared image from localStorage for room:', roomId);
      }
    } catch (error) {
      console.error('Error loading shared image from localStorage:', error);
    }
  }
}, [roomId]);
```

#### 3. Added localStorage Save Effect (lines 199-215)
```javascript
// Keep ref updated with latest sharedImage and save to localStorage
useEffect(() => {
  sharedImageRef.current = sharedImage;
  
  // Save shared image to localStorage for persistence across page refreshes
  if (roomId) {
    try {
      if (sharedImage) {
        localStorage.setItem(`sharedImage_${roomId}`, JSON.stringify(sharedImage));
      } else {
        localStorage.removeItem(`sharedImage_${roomId}`);
      }
    } catch (error) {
      console.error('Error saving shared image to localStorage:', error);
    }
  }
}, [sharedImage, roomId]);
```

## How It Works

### Normal Flow (No Refresh)
1. Teacher sends image/template via Ably (`clear-all-drawings` or `sync-full-state`)
2. Student receives message and updates `sharedImage` state
3. New useEffect automatically saves to localStorage

### Page Refresh Flow
1. Student page loads
2. Student immediately loads `sharedImage` from localStorage (instant display)
3. Student connects to Ably and requests current state (backup/sync)
4. Teacher responds with current image (if it changed, will update)

### Benefits
- ✅ **Instant Loading**: No waiting for Ably connection or teacher response
- ✅ **Offline Resilience**: Works even if teacher temporarily disconnected
- ✅ **Consistent UX**: Matches teacher dashboard behavior
- ✅ **No Race Conditions**: Student has image immediately, Ably sync is backup
- ✅ **Room-Scoped**: Each room has its own localStorage key

## Storage Key Format
```javascript
localStorage key: `sharedImage_${roomId}`
```

Example: `sharedImage_ABC123`

## Data Structure
The shared image object stored contains:
```javascript
{
  dataUrl: "data:image/png;base64,...",  // Base64 encoded image
  width: 800,
  height: 600,
  timestamp: 1234567890,
  type: "hanzi" | "graph-corner" | "graph-cross" | undefined,  // For templates
  filename: "example.png"  // For uploaded images
}
```

## Edge Cases Handled

### 1. Room Change
When a student joins a different room, the new roomId triggers the useEffect to load that room's specific image.

### 2. Image Cleared
When teacher sends a blank canvas, `sharedImage` is set to `null`, which triggers removal from localStorage.

### 3. localStorage Unavailable
Wrapped in try-catch blocks to handle browsers with disabled localStorage or quota exceeded errors.

### 4. Corrupted Data
JSON parsing errors are caught and logged without crashing the app.

## Testing

Test the following scenarios:

1. **Teacher sends template → Student refreshes**
   - ✅ Template should immediately reappear

2. **Teacher sends image → Student refreshes**
   - ✅ Image should immediately reappear

3. **Teacher clears canvas → Student refreshes**
   - ✅ Canvas should remain blank

4. **Multiple rooms**
   - ✅ Each room maintains its own image independently

5. **Teacher changes image → Student already has old one cached**
   - ✅ Student receives new image via Ably and updates localStorage

## Performance Impact
- **Negligible**: localStorage read/write is synchronous but very fast (~1ms)
- **Storage**: Images are already compressed by teacher (typically 50-200KB)
- **No Network**: Reduces unnecessary Ably traffic on refresh

## Related Files
- `src/pages/TeacherDashboard.jsx` - Teacher side with same pattern (lines 120-152)
- `src/pages/Student.jsx` - Student side (now matching teacher pattern)

## Future Improvements
Consider implementing:
- IndexedDB for larger images (if localStorage quota is an issue)
- Cache versioning to force reload on updates
- Cleanup of old room data from localStorage

