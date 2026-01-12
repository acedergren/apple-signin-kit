# Apple Developer Setup

Configure Sign in with Apple in your Apple Developer account.

## Prerequisites

- [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year)
- Access to [Apple Developer Console](https://developer.apple.com/account)

## Step 1: Create App ID

1. Go to **Certificates, Identifiers & Profiles**
2. Click **Identifiers** → **+** button
3. Select **App IDs** → Continue
4. Select **App** → Continue
5. Fill in:
   - **Description:** Your App Name
   - **Bundle ID:** `com.yourcompany.yourapp` (Explicit)
6. Scroll down to **Capabilities**
7. Check **Sign in with Apple**
8. Click **Continue** → **Register**

## Step 2: Create Services ID (Web/Backend)

!!! info "Required for web applications"
    Services IDs are used for web-based Sign in with Apple. iOS apps use the App ID directly.

1. Click **Identifiers** → **+** button
2. Select **Services IDs** → Continue
3. Fill in:
   - **Description:** Your App Web Service
   - **Identifier:** `com.yourcompany.yourapp.service`
4. Click **Continue** → **Register**
5. Click on your new Services ID
6. Check **Sign in with Apple**
7. Click **Configure**

### Configure Web Authentication

In the configuration dialog:

| Field | Value | Example |
|-------|-------|---------|
| **Primary App ID** | Select your App ID | `com.yourcompany.yourapp` |
| **Domains** | Your domain(s) | `yourapp.com`, `api.yourapp.com` |
| **Return URLs** | OAuth callback URL | `https://api.yourapp.com/api/auth/apple/callback` |

!!! warning "Return URL must match exactly"
    Apple validates the return URL exactly. Include:

    - Production: `https://api.yourapp.com/api/auth/apple/callback`
    - Development: `https://localhost:3000/api/auth/apple/callback`

Click **Save** → **Continue** → **Save**

## Step 3: Create Private Key

1. Go to **Keys** → **+** button
2. Fill in:
   - **Key Name:** Your App Sign In Key
3. Check **Sign in with Apple**
4. Click **Configure** → Select your Primary App ID → **Save**
5. Click **Continue** → **Register**
6. **Download the key file** (`.p8`) - You can only download once!
7. Note the **Key ID** shown

!!! danger "Store the private key securely"
    The `.p8` file cannot be re-downloaded. Store it in a secure secrets manager.

## Step 4: Gather Credentials

You'll need these values for your application:

| Credential | Where to find | Example |
|------------|---------------|---------|
| **Client ID** | Services ID identifier | `com.yourcompany.yourapp.service` |
| **Team ID** | Membership → Team ID | `ABC123DEF4` |
| **Key ID** | Keys → Your key | `XYZ987KEY1` |
| **Private Key** | Downloaded `.p8` file | `-----BEGIN PRIVATE KEY-----...` |

## Step 5: Configure Your App

### Environment Variables

```bash
# .env
APPLE_CLIENT_ID=com.yourcompany.yourapp.service
APPLE_TEAM_ID=ABC123DEF4
APPLE_KEY_ID=XYZ987KEY1

# Private key (include newlines)
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"
```

### Fastify Configuration

```typescript
await app.register(appleAuthPlugin, {
  apple: {
    clientId: process.env.APPLE_CLIENT_ID!,
    teamId: process.env.APPLE_TEAM_ID!,
    keyId: process.env.APPLE_KEY_ID!,
    privateKey: process.env.APPLE_PRIVATE_KEY!,
    // Optional: Override redirect URI
    redirectUri: 'https://api.yourapp.com/api/auth/apple/callback',
  },
  // ... other config
});
```

## iOS-Specific Setup

### App ID Configuration

For iOS apps, use the App ID (bundle identifier) as the client ID:

```swift
let authService = AppleSignInService(
    clientId: "com.yourcompany.yourapp" // Bundle ID, not Services ID
)
```

### Entitlements

Ensure your `.entitlements` file includes:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.developer.applesignin</key>
    <array>
        <string>Default</string>
    </array>
</dict>
</plist>
```

## Testing

### Sandbox Testing

1. Create a test Apple ID at [appleid.apple.com](https://appleid.apple.com)
2. Use this account during development
3. Apple provides test accounts in App Store Connect → Users and Access → Sandbox

### Local Development

For localhost testing:

1. Add `localhost` to your Services ID domains
2. Add `https://localhost:3000/api/auth/apple/callback` to return URLs
3. Use HTTPS (required by Apple) - tools like `mkcert` can help

```bash
# Generate local certificates
mkcert localhost
mkcert -install
```

## Troubleshooting

### "Invalid redirect_uri"

- Verify the return URL in Apple Developer matches exactly
- Check for trailing slashes
- Ensure HTTPS is used

### "Invalid client_id"

- Use Services ID for web, App ID (bundle ID) for iOS
- Verify the identifier is correct

### "Invalid grant"

- Authorization code expired (5 minutes TTL)
- Code was already used (single-use)
- PKCE verifier doesn't match challenge

### Key Not Found

- Verify Key ID matches
- Check private key format includes `-----BEGIN PRIVATE KEY-----`
- Ensure newlines are preserved in environment variables

## Security Checklist

- [ ] Private key stored in secrets manager (not in code)
- [ ] Return URLs use HTTPS
- [ ] Different credentials for staging/production
- [ ] Key rotation plan documented
- [ ] Team members have appropriate access levels
