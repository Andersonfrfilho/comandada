declare module 'sharp' {
  interface JpegOptions {
    quality?: number
  }

  interface SharpInstance {
    resize(
      width: number | { width?: number; height?: number; withoutEnlargement?: boolean },
      height?: number
    ): SharpInstance
    jpeg(options?: JpegOptions): SharpInstance
    toFormat(format: unknown, options?: { quality?: number }): SharpInstance
    toBuffer(): Promise<Buffer>
  }

  function sharp(input?: Buffer | string): SharpInstance

  export default sharp
}
