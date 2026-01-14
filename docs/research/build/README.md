# Research Documentation

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

This directory contains LaTeX source files for the project research document.

## Prerequisites

### Installing LaTeX

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install texlive-latex-base texlive-fonts-recommended texlive-latex-extra
```

#### Linux (Arch/Manjaro)

On Arch-based distros, the Debian-style package `texlive-fontsrecommended` does not exist.

**Smaller install (recommended for this project):** installs the common LaTeX tools and
packages needed to compile typical documents, without pulling in everything TeX Live offers.

```bash
sudo pacman -Syu
sudo pacman -S texlive-basic texlive-fontsextra texlive-latexextra
```

**Full install (for maximum compatibility):** installs the full TeX Live bundle. Use this if
you compile many different LaTeX projects (theses, templates from the internet, unusual
packages/fonts), want to avoid “missing package” errors, and don’t care about disk usage.

```bash
sudo pacman -Syu
sudo pacman -S texlive
```

#### Linux (Fedora)

```bash
sudo dnf install texlive-scheme-basic texlive-collection-fontsrecommended texlive-collection-latexextra
```

#### macOS

```bash
brew install --cask mactex
```

Or minimal:

```bash
brew install --cask basictex
eval "$(/usr/libexec/path_helper -s)"
```

#### Windows

Download MiKTeX (https://miktex.org/download) or TeX Live (https://tug.org/texlive/)

## Building the PDF

```bash
pdflatex Research.tex
pdflatex Research.tex  # Run twice for TOC
```

Output: `Research.pdf`

## Dev mode (watch / auto-rebuild)

### Install `latexmk`

- Debian/Ubuntu: `sudo apt install latexmk`
- Arch/Manjaro: `sudo pacman -Syu texlive-binextra`
- Fedora: `sudo dnf install latexmk`
- macOS: `brew install latexmk`

### Install a PDF viewer with auto-reload (recommended)

**Okular** (KDE, excellent auto-reload, available on most distros):

```bash
sudo pacman -S okular  # Arch/Manjaro
# or
sudo apt install okular    # Debian/Ubuntu
# or
sudo dnf install okular    # Fedora
```

Okular automatically reloads the PDF when `latexmk` rebuilds it, so you see changes instantly.

### Watch mode

```bash
latexmk -pdf -pvc -interaction=nonstopmode -file-line-error -outdir=docs/research/build docs/research/Research.tex
```

Stop with `Ctrl+C`.

### Auto-open PDF

- macOS: `open Research.pdf`
- Linux: `xdg-open Research.pdf`
- Windows (PowerShell): `start Research.pdf`

## Cleaning up auxiliary files

```bash
rm -f *.aux *.log *.out *.toc
```

Or with `latexmk`:

```bash
latexmk -c      # keep PDF
latexmk -C      # delete everything
```

## Online Alternative

- **Overleaf**: https://www.overleaf.com
- **Papeeria**: https://papeeria.com
  Dmw4~Xr
