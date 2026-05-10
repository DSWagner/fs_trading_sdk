import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { useIsMobile, useIsNarrow } from '../useMediaQuery';

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
        background: 'rgba(251,246,238,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${palette.rule}`,
      }}
    >
      <div
        style={{
          maxWidth: 1120,
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
          {isAuthenticated && user && !isNarrow && (
            <NavTab to={`/u/${encodeURIComponent(user.username)}`} label="My Convictions" />
          )}
          {isAuthenticated && user && isNarrow && (
            <NavTab to={`/u/${encodeURIComponent(user.username)}`} label="Mine" />
          )}
          <NavTab to="/about" label="About" />
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, minWidth: 0 }}>
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
                {!isNarrow && <> · ${user.walletValue != null ? user.walletValue.toFixed(0) : '—'}</>}
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
