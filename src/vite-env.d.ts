/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ABLY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
