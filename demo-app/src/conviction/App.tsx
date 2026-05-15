import { useMemo } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FunctionSpaceProvider } from '@functionspace/react';
import { palette, convictionTheme } from './theme';
import { recallUsername } from './storage';
import { NavBar } from './components/NavBar';
import { LandingPage } from './pages/Landing';
import { DiscoverPage } from './pages/Discover';
import { BetFlowPage } from './pages/BetFlow';
import { ReceiptPage } from './pages/Receipt';
import { ProfilePage } from './pages/Profile';
import { EmbedPage } from './pages/Embed';
import { AboutPage } from './pages/About';
import { ExplorePage } from './pages/Explore';
import { LeaderboardPage } from './pages/Leaderboard';
import { ErrorBoundary } from './components/ErrorBoundary';

const FS_BASE_URL =
  import.meta.env.VITE_FS_BASE_URL || 'https://fs-engine-api-dev.onrender.com';

const fsConfig = {
  baseUrl: FS_BASE_URL,
  autoAuthenticate: false,
};

export function ConvictionApp() {
  const storedUsername = useMemo(() => recallUsername(), []);
  return (
    <FunctionSpaceProvider config={fsConfig} theme={convictionTheme} storedUsername={storedUsername ?? undefined}>
      <BrowserRouter>
        <ConvictionShell />
      </BrowserRouter>
    </FunctionSpaceProvider>
  );
}

function ConvictionShell() {
  const location = useLocation();
  const isEmbed = location.pathname.startsWith('/embed/');

  // resetKeys = [pathname] so that navigating to a different route
  // automatically clears any captured error from the boundary. Without
  // this, a crash on /r/A/B would persist into /discover after the
  // user clicks the "Back to the front" link.
  const resetKeys = [location.pathname];

  if (isEmbed) {
    return (
      <div style={{ background: palette.paper, minHeight: '100vh' }}>
        <ErrorBoundary label="Embed" resetKeys={resetKeys}>
          <Routes>
            <Route path="/embed/r/:marketId/:positionId" element={<EmbedPage />} />
          </Routes>
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div style={{ background: palette.paper, minHeight: '100vh' }}>
      <NavBar />
      {/* One boundary around the entire routed area. Per-route boundaries
       *  would also work, but a single boundary keyed on `pathname` is
       *  simpler and gives the same UX: every navigation wipes the
       *  crashed state. The NavBar deliberately sits OUTSIDE the
       *  boundary so even if a page errors, the user still has the
       *  global header (logo, theme toggle, auth) to navigate away with. */}
      <ErrorBoundary label="Page" resetKeys={resetKeys}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/m/:marketId" element={<BetFlowPage />} />
          <Route path="/r/:marketId/:positionId" element={<ReceiptPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
      <Footer />
    </div>
  );
}

function NotFound() {
  return (
    <div style={{ maxWidth: 760, margin: '60px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontFamily: '"Fraunces", serif', fontSize: 48, color: palette.ink }}>Lost the receipt.</h1>
      <p style={{ fontFamily: 'system-ui, sans-serif', color: palette.inkMute }}>
        That page doesn't exist. <a href="/" style={{ color: palette.ember }}>Back to the front page</a>.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${palette.rule}`,
        padding: '32px 24px',
        marginTop: 80,
        background: palette.paperDeep,
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: palette.inkMute,
          letterSpacing: 0.4,
        }}
      >
        <span>Conviction · A receipts-first prediction publication.</span>
        <span>Built on FunctionSpace SDK.</span>
      </div>
    </footer>
  );
}

export default ConvictionApp;
