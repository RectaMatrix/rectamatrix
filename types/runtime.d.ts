interface Console {
  log(...data: unknown[]): void;
}

declare const console: Console;

declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options: { readonly recursive: true },
  ): Promise<string | undefined>;

  export function readFile(path: string, encoding: "utf8"): Promise<string>;

  export function readFile(path: string): Promise<Uint8Array>;

  export function writeFile(
    path: string,
    data: string,
    encoding: "utf8",
  ): Promise<void>;

  export function writeFile(path: string, data: Uint8Array): Promise<void>;
}
