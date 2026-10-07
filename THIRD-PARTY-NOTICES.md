# Third-party notices

Fuji Recipe Converter's own code is released under the MIT License (see `LICENSE`).
It bundles the following third-party work, unmodified, each under its own licence.

| Component | Files | Licence |
|---|---|---|
| Lucide icons v0.460.0 | `js/icons.js` (path data) | ISC |
| Tesseract.js v5.1.1 | `vendor/tesseract/tesseract.min.js`, `vendor/tesseract/worker.min.js` | Apache-2.0 |
| — bundled inside it: regenerator-runtime, buffer, zlib.js | same files | MIT |
| — bundled inside it: ieee754 | same files | BSD-3-Clause |
| Tesseract.js core v5.1.1 (Tesseract OCR compiled to WebAssembly) | `vendor/tesseract/tesseract-core-lstm.wasm.js`, `vendor/tesseract/tesseract-core-simd-lstm.wasm.js` | Apache-2.0 |
| — compiled into it: Leptonica image library | same files | BSD-2-Clause |
| Tesseract English language data (`4.0.0_best_int`) | `vendor/tesseract/lang/eng.traineddata.gz` | Apache-2.0 (upstream tessdata); redistributed on npm as `@tesseract.js-data/eng` v1.0.0, declared MIT |

## Lucide icons

- Source: https://lucide.dev — https://github.com/lucide-icons/lucide

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Tesseract.js

- Source: https://github.com/naptha/tesseract.js
- Licence: Apache License 2.0 — full text in `vendor/tesseract/LICENSE.md`
- Notices for the libraries bundled into the minified files are in
  `vendor/tesseract/tesseract.min.js.LICENSE.txt` and `vendor/tesseract/worker.min.js.LICENSE.txt`.

## Tesseract.js core

- Source: https://github.com/naptha/tesseract.js-core — https://github.com/tesseract-ocr/tesseract
- Licence: Apache License 2.0 (same text as `vendor/tesseract/LICENSE.md`)
- Includes the Leptonica library (http://www.leptonica.org/), BSD 2-Clause:
  Copyright (C) 2001-2020 Leptonica. All rights reserved. Redistribution and use in source
  and binary forms, with or without modification, are permitted provided that the copyright
  notice, the list of conditions and the disclaimer in the Leptonica licence are retained.

## Tesseract English language data

- Source: https://github.com/tesseract-ocr/tessdata (Apache License 2.0), as packaged in
  https://github.com/naptha/tessdata

## Trademarks

FUJIFILM and the film simulation names are trademarks of FUJIFILM Corporation. Adobe,
Lightroom and Camera Raw are trademarks of Adobe Inc. DaVinci Resolve is a trademark of
Blackmagic Design Pty. Ltd. This project uses these names only to describe compatibility
and contains no logos, icons, software, profiles or other assets from those companies.
