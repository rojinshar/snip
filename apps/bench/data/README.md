# Benchmark datasets

Everything in this folder except `sample/` is git-ignored. Your real test set is built from
course material and stays on your machine.

## Layout

```
data/
  sample/              committed smoke-test set (synthetic KaTeX renders)
  <your-set>/
    manifest.jsonl
    images/
      ps3-q2.png
      ...
```

## Manifest format

One JSON object per line. Blank lines and lines starting with `//` are ignored.

```json
{
  "id": "ps3-q2",
  "image": "images/ps3-q2.png",
  "latex": "\\int_0^1 x^2\\,dx",
  "category": "printed",
  "source": "Griffiths QM 2.3"
}
```

| Field      | Required | Notes                                                         |
| ---------- | -------- | ------------------------------------------------------------- |
| `id`       | yes      | Unique within the manifest.                                   |
| `image`    | yes      | Relative to the manifest. `.png`, `.jpg`, `.jpeg` or `.webp`. |
| `latex`    | yes      | Ground truth, without `$` or `\[ \]` delimiters.              |
| `category` | yes      | `printed`, `handwritten` or `multiline`.                      |
| `source`   | no       | Where the equation came from.                                 |

## Building the 200-equation set

The validation plan calls for 200 equations from your own courses, mixed across printed,
handwritten and multi-line. Some tips:

- Crop tightly, the way a user would drag a box. Take screenshots at normal zoom, not
  high-resolution exports.
- Write the ground truth the way you would type it in Overleaf. The scorer forgives
  whitespace, `\left`/`\right`, spacing commands and `x^{2}` vs `x^2`, and it also counts two
  sources that render to identical MathML as a match.
- Aim for roughly 120 printed, 40 handwritten and 40 multi-line so each category has enough
  samples to compare.

## UniMER-Test (public benchmark)

[UniMER-Test](https://huggingface.co/datasets/wanderkid/UniMER_Dataset) (Apache-2.0) has
23,757 labelled formula images in four subsets, imported under these categories:

| Subset | Category          | What it is                              |
| ------ | ----------------- | --------------------------------------- |
| `spe`  | `simple-printed`  | Short, clean printed formulas           |
| `cpe`  | `complex-printed` | Long, multi-line printed formulas       |
| `sce`  | `screen-capture`  | Screenshots with noise and varied fonts |
| `hwe`  | `handwritten`     | Handwritten formulas (photos and scans) |

```sh
# From apps/bench/data (about 150 MB, extracted under unimer-test/raw/)
mkdir -p unimer-test/raw && cd unimer-test
curl -L -o UniMER-Test.zip https://huggingface.co/datasets/wanderkid/UniMER_Dataset/resolve/main/UniMER-Test.zip
unzip -q UniMER-Test.zip -d raw

# From the repo root: sample 25 per subset (reproducible by seed), then benchmark
npm run bench:import-unimer -- --per-subset 25 --seed 42
npm run bench -- --dataset data/unimer-test/manifest.jsonl --rpm 14
```

Things to know when reading results:

- Labels are written in one fixed LaTeX style (`\begin{array}`, `\mathrm{...}`,
  `\operatorname*{det}`). Models often produce equivalent but different source
  (`\begin{aligned}`, `\text{...}`, `\det`), so exact match understates real accuracy.
  Read the misses table before trusting the headline number.
- Some labels are wrong. For example, handwritten `hwe/0000001.png` shows `NaOH` but is
  labelled `NaCH`.
- Labels KaTeX cannot render are skipped during import and reported in its output.
