/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTGRES_URL?: string;
  readonly POSTGRES_URL?: string;
  readonly ABLY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
