export interface SystemThemeDetectorPort {
  isDarkMode(): boolean;
  subscribe(callback: (isDark: boolean) => void): () => void;
}
