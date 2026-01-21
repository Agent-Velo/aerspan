/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_REACT_APP_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

