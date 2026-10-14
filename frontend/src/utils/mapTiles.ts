/**
 * Map basemap tile provider configuration.
 * Uses 100% sovereign, keyless OpenStreetMap tile infrastructure with zero watermarks.
 * Dark mode is achieved via CSS filters on the Leaflet tile-pane, preserving marker/polygon colors.
 */
export const MAP_TILE_CONFIG = {
  url: process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  subdomains: process.env.NEXT_PUBLIC_MAP_SUBDOMAINS || '',
  attribution:
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
    'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS',
  maxZoom: 19,
};

