import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { useIsMobile, useIsNarrow } from '../useMediaQuery';
import { useDarkMode } from '../useDarkMode';

export function NavBar() {
  const { user, isAuthenticated, logout } = useAuth();
  const isMobile = useIsMobile();
  const isNarrow = useIsNarrow();
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--c-paper)',
        // Soft translucent overlay so content underneath glimpses through
        // on scroll. Uses CSS var so it adapts to dark mode automatically.
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${palette.rule}`,
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: isMobile ? '12px 16px' : '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 12 : 32,
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <Wordmark hideSubtitle={isMobile} />
        </Link>
        <nav style={{ display: 'flex', gap: isMobile ? 12 : 22, flexShrink: 0 }}>
          <NavTab to="/discover" label="Discover" />
          <NavTab to="/explore" label={isNarrow ? 'Galleries' : 'Galleries'} />
          {isAuthenticated && user && !isNarrow && (
            <NavTab to={`/u/${encodeURIComponent(user.username)}`} label="My Convictions" />
          )}
          {isAuthenticated && user && isNarrow && (
            <NavTab to={`/u/${encodeURIComponent(user.username)}`} label="Mine" />
          )}
          {!isMobile && <NavTab to="/about" label="About" />}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, minWidth: 0 }}>
          <DarkModeToggle isMobile={isMobile} />
          {isAuthenticated && user ? (
            <>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: palette.inkMute,
                  letterSpacing: 0.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                @{user.username}
                {!isNarrow && <> · ${user.walletValue != null ? user.walletValue.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '\u2014'}</>}
              </span>
              {!isNarrow && (
                <button
                  onClick={logout}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${palette.rule}`,
                    color: palette.inkSoft,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontFamily: fonts.body,
                    borderRadius: 4,
                    cursor: 'pointer',
                    letterSpacing: 0.4,
                  }}
                >
                  Sign out
                </button>
              )}
            </>
          ) : !isMobile ? (
            <span style={{ fontFamily: fonts.mono, fontSize: 12, color: palette.inkFade }}>
              Guest mode · sign in to bet
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Theme toggle. Renders a small icon-only button. On hover it animates the
 * sun/moon glyph. The actual visual flip happens via CSS variables on
 * `document.documentElement`, so the toggle is just a setState call.
 */
function DarkModeToggle({ isMobile }: { isMobile: boolean }) {
  const { mode, toggle } = useDarkMode();
  const isDark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      data-testid="dark-mode-toggle"
      data-mode={mode}
      style={{
        background: 'transparent',
        border: `1px solid ${palette.rule}`,
        color: palette.inkSoft,
        width: isMobile ? 32 : 34,
        height: isMobile ? 32 : 34,
        borderRadius: 999,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        transition: 'background 160ms, color 160ms, transform 160ms',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--c-rule-soft)';
        e.currentTarget.style.transform = 'rotate(12deg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {isDark ? <SunGlyph /> : <MoonGlyph />}
    </button>
  );
}

function SunGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m4.93 19.07 1.41-1.41" />
      <path d="m17.66 6.34 1.41-1.41" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function NavTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        textDecoration: 'none',
        fontFamily: fonts.body,
        fontSize: 14,
        color: isActive ? palette.ink : palette.inkMute,
        fontWeight: isActive ? 600 : 500,
        letterSpacing: 0.2,
        borderBottom: isActive ? `2px solid ${palette.ember}` : '2px solid transparent',
        paddingBottom: 2,
        transition: 'color 120ms',
        whiteSpace: 'nowrap',
      })}
    >
      {label}
    </NavLink>
  );
}

function Wordmark({ hideSubtitle }: { hideSubtitle?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span
        style={{
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: -0.5,
          color: palette.ink,
        }}
      >
        Conviction
      </span>
      {!hideSubtitle && (
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: 1.2,
            color: palette.ember,
            textTransform: 'uppercase',
            marginTop: -2,
          }}
        >
          · Receipts for beliefs
        </span>
      )}
    </div>
  );
}
