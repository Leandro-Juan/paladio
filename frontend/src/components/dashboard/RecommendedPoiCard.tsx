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
  onReserve?: (id?: string) => void;
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
  onReserve,
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

  const handleAction = (e: React.MouseEvent) => {
    if (onReserve) {
      e.preventDefault();
      onReserve(id);
    }
  };

  const destinationHref = tripId ? `/trips/${tripId}` : '/engine';

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
          <h4 className={styles.title} title={name}>
            {name}
          </h4>
          <p className={styles.description} title={displayDesc}>
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

            {/* POI Type / Category Badge: Icon only so all 3 badges fit in a row */}
            {categoryMeta && (
              <span
                className={`${styles.badgePill} ${styles.categoryIconPill}`}
                data-testid="poi-category-pill"
                title={categoryMeta.label}
                aria-label={categoryMeta.label}
              >
                <CategoryIcon type={categoryMeta.type} size={12} className={styles.badgeIcon} />
              </span>
            )}
          </div>
        </div>

        {/* Action Button: Reserve now */}
        <Link
          href={destinationHref}
          className={styles.reserveButton}
          onClick={handleAction}
        >
          Reserve now
        </Link>
      </div>
    </div>
  );
}
