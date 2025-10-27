# Supabase Setup Guide

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose your organization
4. Fill in project details:
   - **Name**: Feather Classroom (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
5. Click "Create new project" and wait 1-2 minutes

## 2. Get Your API Credentials

1. In your project dashboard, click on the **Settings** icon (gear) in the left sidebar
2. Go to **API** section
3. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

## 3. Add Credentials to Your App

1. Create a `.env` file in the root of your project (if it doesn't exist)
2. Copy the contents from `.env.example`
3. Add your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. Run the Database Schema

1. In your Supabase project dashboard, click on **SQL Editor** in the left sidebar
2. Click "New query"
3. Copy the entire contents of `database/schema.sql`
4. Paste it into the SQL editor
5. Click "Run" or press `Ctrl/Cmd + Enter`
6. You should see success messages confirming tables were created

## 5. Verify Setup

1. Click on **Table Editor** in the left sidebar
2. You should see 4 new tables:
   - `sessions`
   - `participants`
   - `questions`
   - `annotations`

## 6. (Optional) View Your Data

- Use the Table Editor to view data in real-time
- Use the SQL Editor to run custom queries
- Data will start appearing as teachers create sessions and students join

## Database Structure

### sessions
Tracks each classroom session
- `id`: Unique identifier
- `room_code`: 6-character code (e.g., "ABC123")
- `status`: 'created' → 'active' → 'ended'
- `started_at`: When teacher sends first content
- `ended_at`: When teacher closes/refreshes

### participants
All teachers and students in sessions
- Links to session
- Tracks join/leave times
- Stores flagged status

### questions
Each piece of content sent by teacher
- Question number (1, 2, 3...)
- Content type (blank/template/image)
- Template data or image data

### annotations
Student work and teacher feedback
- Student drawings (lines array)
- Teacher annotations (lines array)
- Auto-saved every 10 seconds
- One record per student per question

## Troubleshooting

**Error: "Missing Supabase environment variables"**
- Make sure you've created a `.env` file with the correct keys
- Restart your dev server after adding `.env`

**Error: "relation does not exist"**
- Run the `schema.sql` file in Supabase SQL Editor
- Make sure it completed without errors

**No data appearing**
- Check the Network tab in browser DevTools
- Look for Supabase API calls
- Check Supabase logs in the dashboard

Need help? Check the [Supabase documentation](https://supabase.com/docs)
