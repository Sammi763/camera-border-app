declare module "heic-convert" {
  type ConvertOptions = {
    readonly buffer: Uint8Array
    readonly format: "JPEG" | "PNG"
    readonly quality?: number
  }

  type Convert = ((options: ConvertOptions) => Promise<Buffer>) & {
    readonly all: (options: ConvertOptions) => Promise<readonly { readonly convert: () => Promise<Buffer> }[]>
  }

  const convert: Convert
  export = convert
}
