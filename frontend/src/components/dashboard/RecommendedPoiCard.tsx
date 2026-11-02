"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { classifyPoiCategory } from '@/utils/poiCategory';
import { CategoryIcon } from '@/components/PoiCategoryBadge';
import styles from './RecommendedPoiCard.module.css';

export interface RecommendedPoiCardProps {
  id?: string;
  name: string;
  city: string;
  category?: string;
  description?: string | null;
  photoUrl?: string | null;
  tasteMatchPct: number;
  tripId?: string;
  onDismiss?: (idOrName: string) => void;
}

function formatCategoryLabel(label?: string): string {
  if (!label) return '';
  return label
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function RecommendedPoiCard({
  id,
  name,
  city,
  category,
  description,
  photoUrl,
  tasteMatchPct,
  tripId,
  onDismiss,
}: RecommendedPoiCardProps) {
  const categoryMeta = useMemo(() => {
    return classifyPoiCategory(category, name);
  }, [category, name]);

  // Hard invariant: Only POIs with verified photography are rendered
  if (!photoUrl || photoUrl.trim().length === 0) {
    return null;
  }

  const defaultDesc = `Prominent destination waypoint in ${city}, matched to your sovereign travel profile and schedule.`;
  const displayDesc = description && description.trim().length > 0 ? description : defaultDesc;

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss?.(id || name);
  };

  const searchParams = new URLSearchParams();
  if (id) searchParams.set('poi', id);
  if (name) searchParams.set('name', name);
  const destinationHref = tripId
    ? `/trips/${tripId}?${searchParams.toString()}`
    : `/engine?${searchParams.toString()}`;

  return (
    <div className={styles.card}>
      {/* Top Photo Section with Smooth Gradient Fade */}
      <div className={styles.imageContainer}>
        <img
          src={photoUrl}
          alt={name}
          className={styles.image}
          loading="lazy"
        />
        <div className={styles.gradientOverlay} aria-hidden="true" />
      </div>

      {/* Content Area */}
      <div className={styles.content}>
        <div className={styles.infoBlock}>
          <h4 className={styles.title}>
            {name}
          </h4>
          <p className={styles.description}>
            {displayDesc}
          </p>

          {/* Badges: City, Taste Match, & POI Type / Category (to the right) */}
          <div className={styles.badgesRow}>
            {/* City Badge */}
            <span className={`${styles.badgePill} ${styles.cityPill}`}>
              <svg className={styles.badgeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 21s-8-6.5-8-12a8 8 0 1 1 16 0c0 5.5-8 12-8 12z"/>
                <circle cx="12" cy="9" r="3"/>
              </svg>
              <span>{city}</span>
            </span>

            {/* Taste Match Badge */}
            <span className={`${styles.badgePill} ${styles.tasteMatchPill}`}>
              <svg className={`${styles.badgeIcon} ${styles.tasteMatchIcon}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span>{tasteMatchPct}% Taste Match</span>
            </span>

            {/* POI Type / Category Badge with Custom Aesthetic Tooltip (Title Case) */}
            {categoryMeta && (
              <span
                className={`${styles.badgePill} ${styles.categoryIconPill} ${styles.tooltipTrigger}`}
                data-testid="poi-category-pill"
                aria-label={categoryMeta.label}
              >
                <CategoryIcon type={categoryMeta.type} size={12} className={styles.badgeIcon} />
                <span className={styles.customTooltip} role="tooltip">
                  {formatCategoryLabel(categoryMeta.label)}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Action Controls: Cross (Dismiss without delay) and Heart (Inspect in trip workspace with custom tooltip) */}
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.dismissButton}`}
            onClick={handleDismiss}
            aria-label="Dismiss waypoint and find next best match"
            data-testid="poi-dismiss-btn"
          >
            <svg
              className={styles.actionIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div className={styles.heartButtonWrapper}>
            <Link
              href={destinationHref}
              className={`${styles.actionButton} ${styles.heartButton}`}
              aria-label="View waypoint in trip details"
              data-testid="poi-heart-btn"
            >
              <svg
                className={styles.actionIcon}
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </Link>
            <span className={styles.customTooltip} role="tooltip">
              View waypoint in trip details
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
