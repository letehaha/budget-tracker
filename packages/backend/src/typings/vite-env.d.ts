/// <reference types="vite/client" />

interface ImportMeta {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  glob: (pattern: string, options?: { eager?: boolean }) => Record<string, any>;
}
