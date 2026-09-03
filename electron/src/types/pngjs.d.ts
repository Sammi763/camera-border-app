declare module "pngjs" {
  export class PNG {
    readonly width: number
    readonly height: number
    readonly data: Buffer
    constructor(options: { readonly width: number; readonly height: number })
    static readonly sync: {
      readonly read: (data: Buffer) => PNG
      readonly write: (image: PNG) => Buffer
    }
  }
}
