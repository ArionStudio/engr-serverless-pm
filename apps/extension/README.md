# LFSPM browser extension

A Chromium and Firefox extension built with Vite, React, TypeScript, Base UI,
Hugeicons and Tailwind CSS.

## Features

- Separate Chromium and Firefox Manifest V3 builds
- React with TypeScript
- React Router v7 for navigation
- Base UI components
- Tailwind CSS for styling
- Watch builds for the extension pages, background worker and content script
- **Critical testing** - Vitest for essential functionality

## Tech Stack

- **Frontend**: React 19, TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **UI Components**: Base UI
- **Styling**: Tailwind CSS
- **Testing**: Vitest, Testing Library
- **Extension**: Chromium and Firefox Manifest V3

## Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Start the development watchers: `pnpm dev`
4. Build Chromium: `pnpm build`
5. Build Firefox: `pnpm build:firefox`

## Development

### Watch development

1. Start both extension bundle watchers:

   ```bash
   pnpm dev
   ```

2. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

3. Reload the unpacked extension after a rebuild. The watchers update the main
   extension bundle and `login-content.js` in the same `dist` directory.

### Manual Build

1. Build the extension: `pnpm build`
2. Reload the extension in Chrome extensions page

For Firefox, run `pnpm build:firefox`, open
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and
select `dist-firefox/manifest.json`.

### Testing

Run tests with the following commands:

```bash
pnpm test        # Run tests in watch mode
pnpm test:run    # Run tests once
pnpm test:ui     # Run tests with UI (if @vitest/ui is installed)
```

Tests focus on critical functionality:

- Chrome extension lifecycle (installation, messaging)
- Background script communication
- Essential API interactions

### Project Structure

```
app/
├── public/
│   ├── manifest.json          # Chrome extension manifest
│   └── vite.svg
├── src/
│   ├── components/
│   │   ├── ui/               # Base UI components
│   │   ├── Popup.tsx         # Extension popup component
│   │   └── Options.tsx       # Extension options component
│   ├── test/
│   │   └── setup.ts          # Test configuration
│   ├── background.ts         # Service worker
│   ├── background.test.ts    # Background script tests
│   ├── popup.tsx            # Popup entry point
│   ├── options.tsx          # Options entry point
│   └── index.css            # Tailwind styles
├── popup.html               # Popup HTML
├── options.html             # Options HTML
└── vite.config.ts           # Vite configuration
```

## Build

- `pnpm dev` - Watch the main and content-script bundles in `dist/`
- `pnpm build` - Build Chromium extension into `dist/`
- `pnpm build:firefox` - Build Firefox extension into `dist-firefox/`
- `pnpm build:all` - Build both browser targets
- `pnpm test` - Run tests
- `pnpm lint` - Run ESLint

## Contributing

1. Follow the existing code style
2. Add tests for critical functionality only
3. Update documentation as needed
4. Ensure all tests pass before submitting
