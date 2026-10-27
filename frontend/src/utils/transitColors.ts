/**
 * Deterministic color palettes and theme utilities for public transit lines.
 * Assigns accessible, consistent colors to line identifiers (metro, bus, train, tram).
 */

export interface TransitLineTheme {
  name: string;
  solid: string;
  bg: string;
  text: string;
  border: string;
  glow: string;
}

export const TRANSIT_LINE_THEMES: TransitLineTheme[] = [
  {
    name: "emerald",
    solid: "#10B981",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/30 dark:border-emerald-500/40",
    glow: "rgba(16, 185, 129, 0.4)",
  },
  {
    name: "blue",
    solid: "#3B82F6",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-500/30 dark:border-blue-500/40",
    glow: "rgba(59, 130, 246, 0.4)",
  },
  {
    name: "amber",
    solid: "#F59E0B",
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-500/30 dark:border-amber-500/40",
    glow: "rgba(245, 158, 11, 0.4)",
  },
  {
    name: "violet",
    solid: "#8B5CF6",
    bg: "bg-violet-500/10 dark:bg-violet-500/20",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-500/30 dark:border-violet-500/40",
    glow: "rgba(139, 92, 246, 0.4)",
  },
  {
    name: "rose",
    solid: "#F43F5E",
    bg: "bg-rose-500/10 dark:bg-rose-500/20",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-500/30 dark:border-rose-500/40",
    glow: "rgba(244, 63, 94, 0.4)",
  },
  {
    name: "cyan",
    solid: "#06B6D4",
    bg: "bg-cyan-500/10 dark:bg-cyan-500/20",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-500/30 dark:border-cyan-500/40",
    glow: "rgba(6, 182, 212, 0.4)",
  },
  {
    name: "orange",
    solid: "#F97316",
    bg: "bg-orange-500/10 dark:bg-orange-500/20",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-500/30 dark:border-orange-500/40",
    glow: "rgba(249, 115, 22, 0.4)",
  },
  {
    name: "indigo",
    solid: "#6366F1",
    bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-500/30 dark:border-indigo-500/40",
    glow: "rgba(99, 102, 241, 0.4)",
  },
  {
    name: "teal",
    solid: "#14B8A6",
    bg: "bg-teal-500/10 dark:bg-teal-500/20",
    text: "text-teal-700 dark:text-teal-300",
    border: "border-teal-500/30 dark:border-teal-500/40",
    glow: "rgba(20, 184, 166, 0.4)",
  },
  {
    name: "fuchsia",
    solid: "#D946EF",
    bg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    border: "border-fuchsia-500/30 dark:border-fuchsia-500/40",
    glow: "rgba(217, 70, 239, 0.4)",
  },
  {
    name: "lime",
    solid: "#84CC16",
    bg: "bg-lime-500/10 dark:bg-lime-500/20",
    text: "text-lime-700 dark:text-lime-300",
    border: "border-lime-500/30 dark:border-lime-500/40",
    glow: "rgba(132, 204, 22, 0.4)",
  },
  {
    name: "sky",
    solid: "#0284C7",
    bg: "bg-sky-500/10 dark:bg-sky-500/20",
    text: "text-sky-700 dark:text-sky-300",
    border: "border-sky-500/30 dark:border-sky-500/40",
    glow: "rgba(2, 132, 199, 0.4)",
  },
  {
    name: "yellow",
    solid: "#EAB308",
    bg: "bg-yellow-500/10 dark:bg-yellow-500/20",
    text: "text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-500/30 dark:border-yellow-500/40",
    glow: "rgba(234, 179, 8, 0.4)",
  },
  {
    name: "purple",
    solid: "#A855F7",
    bg: "bg-purple-500/10 dark:bg-purple-500/20",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-500/30 dark:border-purple-500/40",
    glow: "rgba(168, 85, 247, 0.4)",
  },
  {
    name: "red",
    solid: "#EF4444",
    bg: "bg-red-500/10 dark:bg-red-500/20",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-500/30 dark:border-red-500/40",
    glow: "rgba(239, 68, 68, 0.4)",
  },
];

export function getTransitLineTheme(line: string): TransitLineTheme {
  const cleaned = (line || "").trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    hash = (hash * 31 + cleaned.charCodeAt(i)) & 0xfffffff;
  }
  const index = Math.abs(hash) % TRANSIT_LINE_THEMES.length;
  return TRANSIT_LINE_THEMES[index];
}

export interface TransitStationItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  station_type?: string | null;
  lines: string[];
}

export interface ActiveTransitLineData {
  line: string;
  city: string;
  color: string;
  stations: TransitStationItem[];
  polyline: [number, number][];
}
