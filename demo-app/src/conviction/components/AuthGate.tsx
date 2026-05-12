import { PasswordlessAuthWidget } from '@functionspace/ui';
import { palette, fonts } from '../theme';
import { rememberUsername } from '../storage';
import { useAuth } from '@functionspace/react';

/**
 * Editorial wrapper around the SDK's PasswordlessAuthWidget.
 *
 * The competition setup guide requires using `PasswordlessAuthWidget` from
 * `@functionspace/ui` (no custom auth flows). We comply by rendering the
 * widget directly and only providing the brand chrome around it
 * (headline + tagline). The `onLogin` callback persists the username locally
 * so the user's signed Polaroids show up on their /u/<handle> page.
 */
export function AuthGate({ onSignedIn }: { onSignedIn?: (username: string) => void }) {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && user) {
    return (
      <div
        style={{
          background: palette.card,
          border: `1px solid ${palette.rule}`,
          borderRadius: 8,
          padding: 16,
          fontFamily: fonts.body,
          color: palette.inkSoft,
          textAlign: 'center',
        }}
      >
        Signed in as <strong style={{ color: palette.ink }}>@{user.username}</strong>
      </div>
    );
  }

  return (
    <div
      className="conviction-authgate-host"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 8,
        padding: '20px 22px',
        boxShadow: `0 4px 12px ${palette.shadow}`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 22,
          fontWeight: 700,
          color: palette.ink,
          marginBottom: 4,
          letterSpacing: -0.5,
        }}
      >
        Sign your conviction.
      </div>
      <p
        style={{
          fontFamily: fonts.body,
          fontSize: 14,
          color: palette.inkMute,
          margin: '0 0 16px 0',
          lineHeight: 1.5,
        }}
      >
        Pick a handle. No password, no email, just the name future-you will be answering for.
      </p>
      <PasswordlessAuthWidget
        onLogin={(loggedInUser) => {
          rememberUsername(loggedInUser.username);
          if (onSignedIn) onSignedIn(loggedInUser.username);
        }}
      />
    </div>
  );
}
