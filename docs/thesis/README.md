# Thesis

## Contents

- [Prerequisites](#prerequisites)
  - [Installing LaTeX](#installing-latex)
    - [Linux (Debian/Ubuntu)](#linux-debianubuntu)
    - [Linux (Arch/Manjaro)](#linux-archmanjaro)
    - [Linux (Fedora)](#linux-fedora)
    - [macOS](#macos)
    - [Windows](#windows)
- [Building the PDF](#building-the-pdf)
- [Dev mode (watch / auto-rebuild)](#dev-mode-watch--auto-rebuild)
- [Cleaning up auxiliary files](#cleaning-up-auxiliary-files)
- [Online Alternative](#online-alternative)

This directory contains LaTeX source files for the engineering thesis. The template is based on [EE-dyplom](https://github.com/SP5LMA/EE-dyplom) (CC-BY 4.0) and compiles with XeLaTeX via `latexmk`.

## Prerequisites

### Installing LaTeX

This project requires **texlive-full** (XeLaTeX + Biber + makeglossaries + Polish fonts).

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install texlive-full
```

#### Linux (Arch/Manjaro)

```bash
sudo pacman -Syu
sudo pacman -S texlive
```

#### Linux (Fedora)

```bash
sudo dnf install texlive-scheme-full
```

#### macOS

```bash
brew install --cask mactex
```

#### Windows

Download TeX Live (https://tug.org/texlive/) or MiKTeX (https://miktex.org/download) with full scheme.

## Building the PDF

All commands run from the repo root:

```bash
pnpm the:build
```

Or directly from `docs/thesis/`:

```bash
latexmk thesis.tex
```

Output: `thesis.pdf`

The `.latexmkrc` in this directory configures XeLaTeX, Biber, and makeglossaries automatically.

## Dev mode (watch / auto-rebuild)

```bash
pnpm the:dev
```

Or directly:

```bash
latexmk -pvc thesis.tex
```

Stop with `Ctrl+C`.

### Install a PDF viewer with auto-reload (recommended)

**Okular** (KDE, excellent auto-reload, available on most distros):

```bash
sudo apt install okular       # Debian/Ubuntu
sudo pacman -S okular          # Arch/Manjaro
sudo dnf install okular        # Fedora
```

Okular automatically reloads the PDF when `latexmk` rebuilds it, so you see changes instantly.

### Auto-open PDF

- macOS: `open thesis.pdf`
- Linux: `xdg-open thesis.pdf`
- Windows (PowerShell): `start thesis.pdf`

## Cleaning up auxiliary files

```bash
pnpm the:clean          # keep PDF
```

Or with `latexmk` directly:

```bash
latexmk -c      # keep PDF
latexmk -C      # delete everything
```

## Online Alternative

- **Overleaf**: https://www.overleaf.com
