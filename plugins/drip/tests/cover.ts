// Covers for tests: just enough of a PNG or a JPEG for the rules to read its
// kind and size (hooks/content/rules.js, imageSize), as base64.

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes))

/** A PNG's signature and IHDR, `w`×`h`. */
export const pngCover = (w = 960, h = 600) =>
  b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, 8, 6, 0, 0, 0])

/** A JPEG's start, an APP0 segment, then its frame header, `w`×`h`. */
export const jpegCover = (w = 960, h = 600) =>
  b64([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xc0, 0, 17, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])

/** A good cover, as a folder holds it. */
export const COVER = { file: 'cover.jpg', base64: jpegCover() }
