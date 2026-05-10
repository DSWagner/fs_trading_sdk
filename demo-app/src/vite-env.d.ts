/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FS_BASE_URL: string;
  readonly VITE_FS_USERNAME?: string;
  readonly VITE_FS_PASSWORD?: string;
  readonly VITE_FS_AUTO_AUTH?: string;
  readonly VITE_FS_MARKET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
