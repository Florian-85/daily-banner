# Bundled fonts

Five fonts under the SIL Open Font License 1.1 (none has a Reserved Font Name). Each folder holds:

| File | What it is |
|---|---|
| `OFL.txt` | The licence and the authors' copyright, unchanged. |
| `glyphs.json` | Outline and width of each character kept (Basic Latin, Latin-1, Latin Extended-A, common punctuation), in thousandths of an em. Used by the `outlines` backend and by the layout of every backend. |
| `subset.woff.b64` | The same characters as a small WOFF font, in base64, for the `embedded` backend. |

The files are generated, not edited by hand. To rebuild them, download the five `.ttf` files and their `OFL.txt`
from the `google/fonts` repository into an empty folder (names are listed in `scripts/build-fonts.cjs`), then:

```bash
node scripts/build-fonts.cjs <that folder>
```

The script needs no dependency. For Nunito and Caveat, which are distributed as variable fonts, the default
instance (Regular) is used.
