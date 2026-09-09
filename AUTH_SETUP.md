# Authentication System Setup - PrepMind

## Current Status

Google OAuth has been configured for the application. Set the following in your `.dev.vars` file for local development:
- **Client ID**: Set your Google OAuth 2.0 Client ID
- **Client Secret**: Set your Google OAuth 2.0 Client Secret

The authentication system is configured for Google OAuth only (no GitHub auth required).

## Configuration Files Updated

### 1. `wrangler.jsonc`
Updated with:
- Google OAuth credentials
- Production environment configuration with placeholders
- Local dev URL: `http://localhost:8080`

### 2. `.dev.vars` 
Created with local development secrets:
- Google OAuth credentials
- Local dev auth secret
- Local dev URL

### 3. `src/lib/auth.ts`
Configured for Google OAuth social provider only.

## Next Steps

### 1. Set Production Secrets
For production deployment:

1. Create Google OAuth credentials for production domain:
   - Update Authorized Redirect URIs in Google Cloud Console
   - Add production callback URL: `https://your-production-domain.com/api/auth/callback/google`
   - Generate new Client ID/Secret for production if needed

2. Set production environment variables:
   ```bash
   # Set better-auth secret
   wrangler secret put BETTER_AUTH_SECRET
   
   # Set Google OAuth secrets
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   ```

### 2. Update Production Domain
In `wrangler.jsonc`, update the production URL:
```json
"env": {
  "production": {
    "vars": {
      "BETTER_AUTH_URL": "https://your-production-domain.com"
    }
  }
}
```

### 3. Verify Authentication Flow
1. Restart the dev server: `npm run dev`
2. Navigate to `http://localhost:8080`
3. Test Google OAuth login

## Security Notes

1. **Secrets Management**:
   - Never commit actual secrets to version control
   - Use `.dev.vars` only for local development with test credentials
   - Use `wrangler secret put` for production secrets

2. **Redirect URIs**:
   - Ensure Authorized Redirect URIs match exactly in Google configuration
   - Include both development and production URLs

3. **Better Auth Secret**:
   - Generate a secure random string for production
   - Keep it consistent across all instances

## Testing the Setup

To test locally:
1. Start the dev server: `npm run dev`
2. Navigate to `http://localhost:8080`
3. Try logging in with Google

## Troubleshooting

If authentication fails:
1. Check browser console for errors
2. Verify all environment variables are set correctly
3. Confirm redirect URIs match exactly in Google Cloud Console
4. Check that the `BETTER_AUTH_URL` matches the current domain
5. Ensure secrets are properly loaded (check Wrangler logs)

## Files Updated

- `wrangler.jsonc` - Main configuration with Google OAuth settings
- `.dev.vars` - Local development secrets
- `src/lib/auth.ts` - Auth system configuration with Google OAuth only
- `AUTH_SETUP.md` - This documentation file