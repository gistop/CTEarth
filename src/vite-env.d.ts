/// <reference types="vite/client" />

declare module 'shpjs' {
  const shp: (input: ArrayBuffer | Uint8Array) => Promise<unknown>;
  export default shp;
}
