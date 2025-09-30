# SPM Chrome Extension

A Chrome extension built with Vite, React, TypeScript, React Router v7, Shadcn, and Tailwind CSS.

## Features

- Modern Chrome extension development
- React with TypeScript
- React Router v7 for navigation
- Shadcn UI components
- Tailwind CSS for styling
- **Hot reload development** - Live updates during development
- **Critical testing** - Vitest for essential functionality

## Tech Stack

- **Frontend**: React 19, TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v7
- **UI Components**: Shadcn
- **Styling**: Tailwind CSS
- **Testing**: Vitest, Testing Library
- **Extension**: Chrome Extension Manifest v3

## Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Start development server: `pnpm dev`
4. Build extension: `pnpm build`

## Development

### Hot Reload Development (Recommended)

1. Start the development server with hot reload:

   ```bash
   pnpm dev
   ```

2. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

3. **Automatic Updates**: The extension will automatically reload when you make changes to your code!

### Manual Build

1. Build the extension: `pnpm build`
2. Reload the extension in Chrome extensions page

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
│   │   ├── ui/               # Shadcn UI components
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

- `pnpm dev` - Development with hot reload
- `pnpm build` - Build Chrome extension
- `pnpm test` - Run tests
- `pnpm lint` - Run ESLint

## Contributing

1. Follow the existing code style
2. Add tests for critical functionality only
3. Update documentation as needed
4. Ensure all tests pass before submitting
