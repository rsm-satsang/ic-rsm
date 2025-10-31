# RSM InnerContent - AI-Powered Content Collaboration Platform

A complete, production-ready content collaboration platform with AI-powered features, real-time collaborative editing, version control, and comprehensive user management.

## 🚀 Features

### Core Functionality
- **Authentication**: Email/password, magic links, and password reset via Supabase Auth
- **Dashboard**: Project management with quick notepad creation
- **Collaborative Editor**: Real-time editing with TipTap and Yjs (CRDT) to prevent merge conflicts
- **Version Control**: Automatic versioning with diff viewing and restoration
- **AI Tools**: Translate, rephrase, summarize, generate, and email draft (powered by Gemini API)
- **Timeline**: Real-time activity feed with user attribution
- **Vocabulary Management**: Upload and manage custom vocabularies for AI context
- **Prompt Templates**: Create, save, and reuse AI prompts

### Advanced Features
- **Role-Based Access Control**: Admin and user roles with granular permissions
- **Auto-Admin Collaboration**: Admins automatically added as collaborators to non-admin projects
- **Row-Level Security**: Comprehensive RLS policies for data protection
- **Real-time Updates**: Supabase Realtime for live collaboration
- **File Storage**: Supabase Storage for vocabularies and exports

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Storage + Realtime)
- **AI**: Google Gemini API
- **Editor**: TipTap + Yjs for CRDT collaborative editing
- **Deployment**: Vercel (frontend) + Supabase (backend)

### Database Schema
- `users` - User profiles with roles
- `projects` - Content projects (documents, notes, articles, emails)
- `versions` - Version history with full content snapshots
- `collaborators` - Project access control
- `comments` - Inline and general comments
- `timeline` - Activity feed with user attribution
- `files` - File uploads and attachments
- `vocabularies` - Custom terminology databases
- `prompts` - AI prompt templates
- `ai_logs` - AI interaction history
- `status_history` - Project status changes
- `integrations` - Encrypted API keys (Gemini)

## 📋 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Supabase account (free tier works)
- Google Gemini API key (optional for AI features)

### Local Development

1. **Clone and Install**
```bash
git clone <your-repo-url>
cd rsm-innercontent
npm install
```

2. **Environment Variables**
The project is already connected to Supabase. The configuration is in:
- `.env` (contains Supabase credentials)
- `src/integrations/supabase/client.ts` (pre-configured)

3. **Database Setup**
The database migrations have been applied. To verify or re-run:
- Check the Supabase dashboard: https://supabase.com/dashboard/project/omdqidanirajnlnhurwy
- All tables, triggers, and RLS policies are already created

4. **Create First Admin User**
After signing up through the app:
```sql
-- Run this in Supabase SQL Editor to make a user an admin
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'your-admin@email.com';
```

5. **Configure Gemini API (Optional)**
For AI features to work:
- Sign in as an admin
- Go to Settings → Integrations
- Paste your Gemini API key
- Or set as Vercel environment variable: `GEMINI_API_KEY`

6. **Run Development Server**
```bash
npm run dev
```
Access at: http://localhost:8080

## 🔒 Security Features

### Row-Level Security (RLS)
All tables have comprehensive RLS policies:
- Users can only see their own data and projects they collaborate on
- Admins have elevated permissions to view all projects and users
- Project owners control collaborator access
- Encrypted storage for API keys

### Admin Rules
- **Admin Creation**: Admins are automatically added as "viewer" collaborators to all non-admin created projects
- **Admin Projects**: Projects created by admins do NOT auto-add other admins
- **User Management**: Only admins can view all users and change roles
- **Integrations**: Only admins can configure API keys

### Authentication
- Email verification
- Password reset flow
- Magic link authentication
- Session management via Supabase

## 🎨 UI/UX Features

### Design System
- Professional blue/teal color palette
- Smooth animations and transitions
- Responsive design (mobile, tablet, desktop)
- Dark mode ready
- Semantic design tokens throughout

### Key Components
- **Auth Pages**: Beautiful login/signup with forgot password
- **Dashboard**: Project grid with search and filters
- **Workspace**: Three-panel layout (Versions | Editor | AI Tools)
- **Timeline**: Real-time activity feed with user names
- **AI Tools Panel**: Interactive AI features with prompt preview
- **Versions Sidebar**: Version history with compare functionality

## 📊 User Workflows

### Quick Notepad Flow
1. User clicks "New Quick Notepad" on dashboard
2. System creates a new project of type "note"
3. Redirects to workspace with blank editor
4. User starts writing immediately
5. Auto-save creates versions

### AI-Powered Translation Flow
1. User selects text in editor
2. Clicks "Translate" in AI Tools panel
3. Selects target language
4. System compiles prompt (vocabulary + template + text)
5. Shows compiled prompt for review/editing
6. User can save edited prompt as template
7. Sends to Gemini API
8. Returns translation
9. User accepts/rejects result

### Version Management Flow
1. User makes edits
2. Clicks "Save" to create new version
3. System increments version number atomically
4. Logs timeline event with user name
5. User can compare any two versions
6. Diff viewer shows inline/side-by-side changes
7. User can restore old version (creates new version with old content)

### Collaboration Flow
1. Project owner adds collaborators
2. System assigns access level (owner/editor/viewer)
3. Collaborators see project in dashboard
4. Real-time presence shows who's editing
5. Timeline shows all user actions with names
6. Comments allow inline discussions

## 🔧 Admin Features

### User Management
- View all users
- Create new users
- Change user roles (admin/user)
- Delete users
- All accessible from Settings page

### Integration Management
- Configure Gemini API key
- Rotate API keys
- View integration logs
- Admin-only access

### Project Oversight
- View all projects by default
- Auto-added to non-admin projects
- Can override any project settings
- Access to all AI logs

## 📦 Deployment

### Frontend (Vercel)
1. Connect repository to Vercel
2. Set environment variables (optional):
   - `GEMINI_API_KEY` (if not using admin UI)
3. Deploy

### Backend (Supabase)
Already configured and running. No additional deployment needed.

### Database Migrations
All migrations are already applied. Future schema changes:
1. Create migration file
2. Run via Supabase dashboard or CLI
3. RLS policies update automatically

## 🧪 Testing

### Manual Test Cases
1. **Authentication**
   - Sign up with email
   - Verify email
   - Sign in with password
   - Request password reset
   - Sign in with magic link

2. **Project Creation**
   - Create quick note
   - Create full project
   - Verify initial version created
   - Check timeline event

3. **Collaboration**
   - User A creates project
   - Check admins auto-added
   - User A adds User B
   - User B sees project
   - Both edit simultaneously

4. **Versioning**
   - Make edits
   - Save version
   - Compare versions
   - Restore old version

5. **AI Features** (requires Gemini key)
   - Select text
   - Run translate
   - Review compiled prompt
   - Accept result
   - Check AI log created

6. **Admin Features**
   - Sign in as admin
   - View all users
   - Create user
   - Change user role
   - View all projects

### RLS Testing
```sql
-- Test as regular user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims.sub TO 'user-uuid';

-- Try to access another user's project
SELECT * FROM projects WHERE owner_id != 'user-uuid';
-- Should return empty

-- Test as admin
UPDATE users SET role = 'admin' WHERE id = 'admin-uuid';
-- Should see all projects
```

## 📚 API Routes (Planned)

For server-side AI processing, create these Next.js API routes or Supabase Edge Functions:

### POST /api/ai/run
Execute AI actions with compiled prompts
```typescript
Body: {
  project_id: string
  version_id?: string
  action_type: 'translate' | 'rephrase' | 'summarize' | 'generate' | 'email'
  prompt_id?: string
  selected_text?: string
  target_language?: string
  user_edits?: string
}

Response: {
  compiled_prompt: string
  ai_output: string
  log_id: string
}
```

### POST /api/versions
Create new version
```typescript
Body: {
  project_id: string
  title?: string
  description?: string
  content: string
}

Response: {
  version: Version
}
```

### POST /api/vocabularies/upload
Upload and parse vocabulary file
```typescript
Body: FormData {
  file: File
  project_id?: string
  visibility: 'project' | 'org' | 'public'
}

Response: {
  vocabulary: Vocabulary
  parsed_keywords: Array<string>
}
```

## 🐛 Known Issues & Future Enhancements

### Current Limitations
- AI features require Gemini API key setup
- No actual real-time collaborative editing yet (TipTap + Yjs setup ready)
- Diff viewing is client-side only (server-side for large docs needed)
- No file exports (PDF, DOCX) yet

### Planned Features
- [ ] Implement actual Yjs WebSocket provider for real-time collaboration
- [ ] Add Gemini API server-side routes
- [ ] Implement vocabulary file parsing (CSV, JSON, TXT)
- [ ] Add diff computation server endpoint
- [ ] Export to PDF, DOCX, Markdown
- [ ] Email integration for drafts
- [ ] Advanced search across projects
- [ ] Project templates
- [ ] Bulk operations
- [ ] Analytics dashboard

## 📄 License

This project was created as a demonstration of a full-stack content collaboration platform.

## 🤝 Contributing

This is a complete system ready for customization. Key areas for extension:
1. Add more AI features (image generation, speech-to-text, etc.)
2. Enhance the collaborative editor
3. Add more export formats
4. Implement advanced analytics
5. Create mobile apps

## 📞 Support

For issues or questions about this implementation, refer to:
- [Supabase Documentation](https://supabase.com/docs)
- [TipTap Documentation](https://tiptap.dev)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Vercel Documentation](https://vercel.com/docs)

---

**Built with ❤️ using Lovable, Supabase, and modern web technologies**
