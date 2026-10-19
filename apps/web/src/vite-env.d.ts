/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vitest" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_MAP_TILE_URL: string;
  readonly VITE_MAP_ATTRIBUTION: string;
  readonly VITE_USE_MOCK_API: string;
  readonly VITE_CAMPUS_LAT: string;
  readonly VITE_CAMPUS_LNG: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
