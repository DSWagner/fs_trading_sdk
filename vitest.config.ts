import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Mirror demo-app/vite.config.ts so tests that import demo-app
    // components (which themselves import the SDK packages via the
    // `@functionspace/*` namespace) can resolve the workspace paths.
    // Without this, e.g. `LiveConsensusCard.tsx` -> `useMarket` from
    // `@functionspace/react` fails to resolve at test time.
    resolve: {
      alias: {
        '@functionspace/core': path.resolve(here, 'packages/core/src'),
        '@functionspace/react': path.resolve(here, 'packages/react/src'),
        '@functionspace/ui': path.resolve(here, 'packages/ui/src'),
        // demo-app components import 'react-router-dom' which resolves
        // to demo-app/node_modules/react-router-dom at runtime. Tests
        // running from the repo root would otherwise pick up the root
        // copy of react-router-dom, get a different React Context, and
        // fail the Link / MemoryRouter context lookup with
        // `Cannot destructure property 'basename' of 'useContext(...)'`.
        // Aliasing here forces both sides to share one copy.
        'react-router-dom': path.resolve(here, 'demo-app/node_modules/react-router-dom'),
        'react-router': path.resolve(here, 'demo-app/node_modules/react-router-dom/node_modules/react-router'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
      // Separate environments: jsdom for React tests, node for others
      environmentMatchGlobs: [
        ['tests/hooks.test.tsx', 'jsdom'],
        ['tests/components.test.tsx', 'jsdom'],
        ['tests/cache.test.ts', 'jsdom'],
        ['tests/*.test.ts', 'node'],
      ],
      env: {
        FS_TEST_URL: env.FS_TEST_URL ?? '',
        FS_TEST_USERNAME: env.FS_TEST_USERNAME ?? '',
        FS_TEST_PASSWORD: env.FS_TEST_PASSWORD ?? '',
        FS_TEST_MARKET_ID: env.FS_TEST_MARKET_ID ?? '',
      },
    },
  };
});
