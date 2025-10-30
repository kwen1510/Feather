# 🚀 Deployment Guide: Redis + Supabase Implementation

## Pre-Deployment Checklist

### ✅ Code Status
- [x] All code committed to Git
- [x] All documentation written
- [x] Build successful (no errors)
- [x] Pushed to GitHub
- [x] Ready for deployment

### 📋 Environment Variables Required

**On your production server**, ensure these are set:

```bash
# Ably (Real-time)
ABLY_API_KEY=your-ably-api-key

# Supabase (Database)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Redis (Caching)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Optional
NODE_ENV=production
PORT=8080
```

### 🗄️ Database Migration

**Important**: Run this SQL in your Supabase SQL Editor **BEFORE** deploying:

```sql
-- Add student_id column to participants table
ALTER TABLE participants ADD COLUMN IF NOT EXISTS student_id TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_participants_student_id ON participants(student_id);

-- Verify it worked
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'participants' AND column_name = 'student_id';
```

Expected result:
```
column_name | data_type
student_id  | text
```

---

## Deployment Steps

### Option 1: Using deploy.sh (Recommended)

If you have the `deploy.sh` script configured:

```bash
# From your LOCAL machine
./deploy.sh
```

This will:
1. Push code to GitHub
2. SSH into your Digital Ocean droplet
3. Pull latest code
4. Install dependencies
5. Build the project
6. Restart PM2

### Option 2: Manual Deployment

**Step 1: SSH into your server**
```bash
ssh root@146.190.100.142
```

**Step 2: Navigate to project**
```bash
cd /root/Feather  # or wherever your app is
```

**Step 3: Pull latest code**
```bash
git pull origin main
```

**Step 4: Check environment variables**
```bash
cat .env | grep -E "REDIS|SUPABASE|ABLY"
```
Make sure all required vars are present.

**Step 5: Install dependencies** (if package.json changed)
```bash
npm install
```

**Step 6: Build the project**
```bash
npm run build
```

**Step 7: Restart the server**
```bash
pm2 restart all
# or
pm2 restart server
pm2 restart feather
```

**Step 8: Verify it's running**
```bash
pm2 status
pm2 logs --lines 50
```

---

## Post-Deployment Verification

### 1. Check Server is Running
```bash
curl http://localhost:8080/api/token?clientId=test
```
Should return an Ably token.

### 2. Check Redis Endpoint
```bash
curl -X POST http://localhost:8080/api/strokes/save \
  -H "Content-Type: application/json" \
  -d '{"roomId":"test-room","studentId":"test-student","lines":[]}'
```
Should return: `{"success":true}`

### 3. Check Frontend
Visit your domain (e.g., `https://yourdomain.com`)
- Should load without errors
- Check browser console for any errors

### 4. Quick Smoke Test
1. Create a teacher session
2. Join as a student
3. Draw something
4. Check browser console for:
   - "📤 Published student layer: X lines"
   - No error messages
5. Teacher should see student strokes
6. Refresh student page → strokes should restore

---

## Environment Setup (First Time Only)

If this is your **first time setting up** Redis/Supabase on the server:

### Set Environment Variables
```bash
ssh root@146.190.100.142
cd /root/Feather
nano .env
```

Add/update these lines:
```bash
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Save (Ctrl+O, Enter, Ctrl+X)

### Restart PM2 to pick up new env vars
```bash
pm2 restart all
```

---

## Monitoring After Deployment

### Watch Logs in Real-Time
```bash
ssh root@146.190.100.142
pm2 logs
```

### Look for Success Messages
```
✅ Persisted X student responses
✅ Saved question N to Supabase
✅ Loaded X students' data from Redis
```

### Watch for Errors
```
❌ Error auto-saving to Redis
❌ Failed to persist strokes
❌ Error loading strokes from Redis
```

If you see errors, check:
1. Environment variables are correct
2. Supabase migration ran successfully
3. Redis/Supabase services are online

---

## Rollback Plan (If Needed)

If something goes wrong:

### Quick Rollback
```bash
ssh root@146.190.100.142
cd /root/Feather
git log --oneline -5  # Find previous commit hash
git checkout <previous-commit-hash>
npm run build
pm2 restart all
```

### Specific Rollback
```bash
# Rollback to before Redis/Supabase implementation
git checkout 6375395  # Replace with actual commit before implementation
npm run build
pm2 restart all
```

---

## Testing in Production

Once deployed, run through these quick tests:

### Test 1: Basic Flow (2 minutes)
1. Create teacher session
2. Join as student (use different browser/incognito)
3. Student draws
4. Teacher sees strokes ✓
5. Teacher adds annotation ✓
6. Move to next question ✓
7. Check Supabase: `questions` and `annotations` tables should have data ✓

### Test 2: Page Refresh (1 minute)
1. Student draws several strokes
2. Student refreshes browser
3. Strokes should reappear ✓
4. Check console: "✅ Restored X lines from Redis" ✓

### Test 3: Session End (1 minute)
1. Students draw
2. Teacher ends session
3. Check console: "✅ Saved final X student responses" ✓
4. Check Supabase: Final question in database ✓

---

## Troubleshooting Common Issues

### Issue: "Error auto-saving to Redis"

**Cause**: Redis not configured or unreachable

**Fix**:
```bash
ssh root@146.190.100.142
cd /root/Feather
cat .env | grep REDIS
# Verify UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
# If missing, add them and restart PM2
pm2 restart all
```

### Issue: "Failed to persist strokes"

**Cause**: Supabase not configured or student_id column missing

**Fix**:
1. Check Supabase env vars
2. Run migration (add student_id column)
3. Check RLS policies in Supabase

### Issue: Strokes not restoring after refresh

**Cause**: Redis endpoint not working or debounce didn't complete

**Fix**:
1. Wait 2+ seconds after drawing before refreshing (debounce)
2. Or close tab (triggers sendBeacon immediate save)
3. Check server logs for Redis errors

### Issue: Build fails

**Cause**: Missing dependencies or syntax error

**Fix**:
```bash
npm install
npm run build 2>&1 | tee build.log
# Check build.log for specific errors
```

---

## Performance Monitoring

### Check Redis Usage
Visit your Upstash dashboard:
- Keys stored (should be < 1000 for normal use)
- Memory usage (should be < 10 MB)
- Command rate (should be low)

### Check Supabase Storage
Visit your Supabase dashboard:
- Table sizes (questions, annotations, participants)
- Storage used (should grow gradually)
- Query performance (should be < 500ms)

### Check Server Performance
```bash
ssh root@146.190.100.142
pm2 monit
# Look at CPU and Memory usage
# Should be normal, no spikes
```

---

## Success Criteria

After deployment, verify:

- ✅ Application loads without errors
- ✅ Students can draw and teacher sees strokes (real-time)
- ✅ Page refresh restores data (both teacher and student)
- ✅ Moving to next question saves to Supabase
- ✅ Session end saves final question
- ✅ No console errors
- ✅ Server logs show success messages
- ✅ Supabase tables populate correctly

---

## Getting Help

If you encounter issues:

1. **Check the logs**: `pm2 logs`
2. **Check browser console**: F12 → Console tab
3. **Review documentation**: 
   - `REDIS_SUPABASE_IMPLEMENTATION.md` (technical details)
   - `TEST_REDIS_SUPABASE.md` (testing guide)
4. **Verify environment**: All env vars set correctly
5. **Check services**: Upstash Redis and Supabase online

---

## Quick Reference

**Deploy**:
```bash
./deploy.sh
```

**Check Status**:
```bash
ssh root@146.190.100.142 "pm2 status"
```

**View Logs**:
```bash
ssh root@146.190.100.142 "pm2 logs --lines 50"
```

**Restart**:
```bash
ssh root@146.190.100.142 "pm2 restart all"
```

**Rollback**:
```bash
ssh root@146.190.100.142 "cd /root/Feather && git checkout <commit> && npm run build && pm2 restart all"
```

---

## 🎉 Ready to Deploy!

Your Redis + Supabase implementation is complete and tested. Follow the steps above for a smooth deployment.

**Deployment Time**: ~5-10 minutes

**Risk Level**: Low (can rollback easily)

**Downtime**: ~30 seconds (PM2 restart)

Good luck! 🚀

