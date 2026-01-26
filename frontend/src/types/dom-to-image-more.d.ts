declare module 'dom-to-image-more' {
  interface Options {
    bgcolor?: string;
    quality?: number;
    style?: Record<string, string>;
    filter?: (node: Node) => boolean;
    width?: number;
    height?: number;
  }
  
  export function toPng(node: Node, options?: Options): Promise<string>;
  export function toJpeg(node: Node, options?: Options): Promise<string>;
  export function toBlob(node: Node, options?: Options): Promise<Blob>;
  export function toSvg(node: Node, options?: Options): Promise<string>;
  export function toPixelData(node: Node, options?: Options): Promise<Uint8ClampedArray>;
}
