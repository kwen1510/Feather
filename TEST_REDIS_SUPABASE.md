# Redis + Supabase Testing Guide

## Quick Start Testing

### Prerequisites
1. Ensure all environment variables are set in `.env`:
   ```
   ABLY_API_KEY=...
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

2. Start the server:
   ```bash
   npm run server
   ```

3. Start the dev server (in another terminal):
   ```bash
   npm run dev
   ```

## Test Scenarios (5-10 minutes each)

### Test 1: Basic Flow with Persistence
**Goal**: Verify data saves when moving to next question

**Steps**:
1. Open teacher dashboard (http://localhost:5173/teacher)
2. Note the room code (e.g., "ABC123")
3. Open student page in incognito (http://localhost:5173/student-login)
4. Join with name "Test Student" and room code
5. **Student**: Draw some strokes
6. **Teacher**: Add annotations on student's work
7. **Teacher**: Click "Send to class" (send blank/template/image)
8. **Check Console**: Should see "✅ Persisted X student responses for question 1"
9. **Check Supabase**: 
   - Go to Supabase Dashboard → Table Editor
   - Open `questions` table → Should see question 1
   - Open `annotations` table → Should see student's work

**Expected**:
- ✅ Question 1 saved to Supabase
- ✅ Student strokes saved
- ✅ Teacher annotations saved
- ✅ Console shows success messages

---

### Test 2: Student Page Refresh
**Goal**: Verify strokes restore after student refreshes

**Steps**:
1. Continue from Test 1 (or start fresh session)
2. **Student**: Draw 5-10 strokes
3. **Student**: Refresh the browser (F5 or Cmd+R)
4. Wait for reconnection (~2 seconds)
5. **Check**: All strokes should reappear

**Expected**:
- ✅ Console shows "📥 Loading own strokes from Redis..."
- ✅ Console shows "✅ Restored X lines from Redis"
- ✅ All strokes visible on canvas
- ✅ Can continue drawing normally

---

### Test 3: Teacher Page Refresh
**Goal**: Verify all students' data restores for teacher

**Steps**:
1. Have 2-3 students join and draw
2. Teacher adds annotations on some students
3. **Teacher**: Refresh the browser
4. Wait for reconnection (~2 seconds)
5. **Check**: All student cards show their strokes

**Expected**:
- ✅ Console shows "📥 Loading strokes from Redis..."
- ✅ Console shows "✅ Loaded X students' data from Redis"
- ✅ All student cards display correctly
- ✅ All strokes visible
- ✅ All annotations visible

---

### Test 4: Session End Persistence
**Goal**: Verify final question saves on session end

**Steps**:
1. Students draw on current question
2. Teacher adds annotations
3. **Teacher**: Click "End Session" button
4. **Check Console**: "✅ Saved final X student responses"
5. **Check Supabase**: Final question data in database

**Expected**:
- ✅ Final question saved before ending
- ✅ All student work preserved
- ✅ Session status = 'ended'
- ✅ Students redirected to login

---

### Test 5: Multiple Questions
**Goal**: Verify question number tracking

**Steps**:
1. Start fresh session
2. **Teacher**: Send question 1 (blank canvas)
3. **Students**: Draw
4. **Teacher**: Send question 2 (template)
5. **Students**: Draw
6. **Teacher**: Send question 3 (image)
7. **Students**: Draw
8. **Teacher**: End session
9. **Check Supabase**: Should have 3 questions

**Expected**:
- ✅ Question numbers: 1, 2, 3
- ✅ Each question has correct type
- ✅ Each question has annotations
- ✅ No data loss between questions

---

### Test 6: Page Unload (sendBeacon)
**Goal**: Verify sendBeacon saves data on tab close

**Steps**:
1. Student joins and draws some strokes
2. **Immediately close the tab** (don't wait for debounce)
3. Rejoin as same student
4. **Check**: Strokes should be restored

**Expected**:
- ✅ Data saved via sendBeacon
- ✅ Strokes restore on rejoin
- ✅ No data loss

---

## Console Log Reference

### Teacher Success Logs
```
💾 Persisting question N before moving to next...
✅ Persisted X student responses for question N
📝 Moving to question N+1
📥 Loading strokes from Redis...
✅ Loaded X students' data from Redis
📊 Total students in state after presence load: X
```

### Student Success Logs
```
📥 Loading own strokes from Redis...
✅ Restored X lines from Redis
📤 Published student layer: X lines
```

### Server Success Logs
```
📝 Persisting question N for session {id}
✅ Saved question N to Supabase
✅ Persisted X student responses for question N
```

---

## Troubleshooting

### Redis Connection Issues
**Symptom**: "Error auto-saving to Redis" in console

**Fix**:
1. Check server.js is running: `npm run server`
2. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in .env
3. Test Redis connection:
   ```bash
   curl -X POST http://localhost:8080/api/strokes/save \
     -H "Content-Type: application/json" \
     -d '{"roomId":"test","studentId":"test","lines":[]}'
   ```
   Should return: `{"success":true}`

### Supabase Connection Issues
**Symptom**: "Failed to persist strokes" in server console

**Fix**:
1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in .env
2. Check Supabase project is active
3. Verify RLS policies allow inserts
4. Check schema has student_id column in participants table

### Data Not Restoring
**Symptom**: Refresh but strokes don't come back

**Fix**:
1. Check if data was saved (look for auto-save logs)
2. Verify 2-second debounce completed before refresh
3. Check Redis TTL hasn't expired (24 hours)
4. Try closing tab (triggers sendBeacon) instead of refresh

### Question Number Not Incrementing
**Symptom**: Always shows question 1

**Fix**:
1. Check teacher state has `currentQuestionNumber`
2. Verify "Send to class" button calls `handleSendToClass`
3. Look for `setCurrentQuestionNumber` logs
4. Try hard refresh (clear browser cache)

---

## Advanced Testing

### Load Testing
**Test**: 20+ students drawing simultaneously

**Expected**:
- Redis handles all saves
- No performance degradation
- All data persists correctly

### Network Interruption
**Test**: Disconnect internet mid-drawing

**Expected**:
- Strokes continue locally
- Auto-sync when reconnected
- No data loss

### Concurrent Sessions
**Test**: Multiple rooms at same time

**Expected**:
- Each room has isolated Redis keys
- No cross-contamination
- Correct data in each session

---

## Verification Checklist

After all tests, verify:

- [ ] Questions table has entries
- [ ] Annotations table has student work
- [ ] Participants table has student_id values
- [ ] Sessions table has correct status
- [ ] No console errors during normal use
- [ ] Page refresh restores data (teacher + student)
- [ ] Session end saves final question
- [ ] Multiple questions tracked correctly
- [ ] sendBeacon works on tab close

---

## Success Criteria

✅ **All scenarios pass**
✅ **No data loss in any situation**
✅ **Console logs show expected messages**
✅ **Supabase has complete data**
✅ **Redis caching working**
✅ **Performance remains smooth**

---

## Automated Testing (Future Enhancement)

Consider adding:
- Playwright E2E tests for refresh scenarios
- Unit tests for Redis/Supabase helpers
- Integration tests for full question lifecycle
- Load tests with artillery or k6

---

**Ready to test!** Start with Test 1 and work through each scenario systematically.

