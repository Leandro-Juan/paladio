/**
 * Map basemap tile provider configuration.
 * Uses 100% sovereign, keyless OpenStreetMap tile infrastructure with zero watermarks.
 * Dark mode is achieved via CSS filters on the Leaflet tile-pane, preserving marker/polygon colors.
 */
export const MAP_TILE_CONFIG = {
  url: process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: process.env.NEXT_PUBLIC_MAP_SUBDOMAINS || 'abc',
  attribution:
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  maxZoom: 19,
};
