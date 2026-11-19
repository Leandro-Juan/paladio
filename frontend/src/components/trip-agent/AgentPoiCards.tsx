"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { CategoryIcon, PoiCategoryBadge } from '@/components/PoiCategoryBadge';
import { classifyPoiCategory } from '@/utils/poiCategory';
import { usePoiPhotos } from '@/hooks/usePoiPhotos';
import styles from './AgentPoiCards.module.css';

export interface AgentPoiItem {
  poi_id?: string;
  id?: string;
  name: string;
  category?: string;
  coordinates?: { lat: number; lng: number };
  lat?: number;
  lng?: number;
  price?: number;
  cost_eur?: number;
  duration_mins?: number;
  score?: number;
  rating?: number | null;
  photo_url?: string | null;
  description?: string | null;
  neighborhood?: string | null;
  opening_hours?: string | null;
}

interface AgentPoiCardsProps {
  pois: AgentPoiItem[];
  city?: string;
  tool?: string;
  onAddPoi?: (poi: AgentPoiItem) => void;
  onInspectPoi?: (poiId: string, fallbackData?: Record<string, unknown>) => void;
}

export function AgentPoiCards({
  pois,
  city,
  tool = 'search_pois',
  onAddPoi,
  onInspectPoi,
}: AgentPoiCardsProps) {
  const { t } = useTranslation();
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const [imgFailedMap, setImgFailedMap] = useState<Record<string, boolean>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const dragInfo = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    hasMoved: false,
  });

  const updateScrollButtons = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const el = carouselRef.current;
    if (!el) return;

    // Translate vertical mouse wheel scrolling into horizontal scrolling
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
          const atEnd = el.scrollLeft >= maxScroll - 1 && e.deltaY > 0;
          if (!atStart && !atEnd) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
            updateScrollButtons();
          }
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', updateScrollButtons);

    return () => {
      el.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [updateScrollButtons, pois]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = carouselRef.current;
    if (!el) return;
    dragInfo.current = {
      isDown: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
      hasMoved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragInfo.current.isDown) return;
    const el = carouselRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = x - dragInfo.current.startX;
    if (Math.abs(walk) > 4) {
      if (!dragInfo.current.hasMoved) {
        dragInfo.current.hasMoved = true;
        setIsDragging(true);
      }
      el.scrollLeft = dragInfo.current.scrollLeft - walk;
      updateScrollButtons();
    }
  };

  const handlePointerUpOrLeave = () => {
    if (dragInfo.current.isDown) {
      dragInfo.current.isDown = false;
      setTimeout(() => {
        setIsDragging(false);
        dragInfo.current.hasMoved = false;
        updateScrollButtons();
      }, 50);
    }
  };

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = carouselRef.current;
    if (!el) return;
    const step = 220;
    el.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 300);
  };

  const poisToWatch = React.useMemo(
    () =>
      pois.map((p) => ({
        id: p.poi_id || p.id,
        name: p.name,
        city: city || p.neighborhood || undefined,
        photo_url: p.photo_url || undefined,
      })),
    [pois, city]
  );
  const { getPhoto } = usePoiPhotos(poisToWatch);

  if (!pois || pois.length === 0) return null;

  const handleAdd = (poi: AgentPoiItem) => {
    const key = poi.poi_id || poi.id || poi.name;
    setAddedMap((prev) => ({ ...prev, [key]: true }));
    onAddPoi?.(poi);
  };

  const handleInspect = (poi: AgentPoiItem) => {
    const key = poi.poi_id || poi.id || poi.name;
    const lat = poi.lat ?? poi.coordinates?.lat;
    const lng = poi.lng ?? poi.coordinates?.lng;
    const photoUrl = poi.photo_url || getPhoto(key) || getPhoto(poi.name) || null;
    onInspectPoi?.(key, {
      id: key,
      name: poi.name,
      category: poi.category || 'attraction',
      city: city || poi.neighborhood || '',
      lat,
      lng,
      price: poi.price ?? poi.cost_eur,
      cost_eur: poi.cost_eur ?? poi.price,
      duration_mins: poi.duration_mins,
      rating: poi.rating,
      description: poi.description,
      photo_url: photoUrl,
    });
  };

  const titleText =
    tool === 'find_nearby'
      ? t('trip_agent.poi_title_nearby')
      : tool === 'suggest_additions'
      ? t('trip_agent.poi_title_suggested')
      : tool === 'search_places'
      ? t('trip_agent.poi_title_discovered')
      : t('trip_agent.poi_title_recommended');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>{titleText}</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.headerBadge}>
            {city
              ? pois.length === 1
                ? t('trip_agent.place_count_in_city_one', { count: pois.length, city })
                : t('trip_agent.place_count_in_city_many', { count: pois.length, city })
              : pois.length === 1
              ? t('trip_agent.place_count_one', { count: pois.length })
              : t('trip_agent.place_count_many', { count: pois.length })}
          </span>
          <div className={styles.navButtons}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => scrollByAmount('left')}
              disabled={!canScrollLeft}
              aria-label={t('trip_agent.previous_places')}
              title={t('trip_agent.previous_places')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => scrollByAmount('right')}
              disabled={!canScrollRight}
              aria-label={t('trip_agent.next_places')}
              title={t('trip_agent.next_places')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${isDragging ? styles.isDragging : ''}`}
        onScroll={updateScrollButtons}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrLeave}
        onPointerLeave={handlePointerUpOrLeave}
      >
        {pois.map((poi, idx) => {
          const key = poi.poi_id || poi.id || `${poi.name}_${idx}`;
          const isAdded = addedMap[key] || false;
          const photoUrl = poi.photo_url || getPhoto(key) || getPhoto(poi.name);
          const hasImage = Boolean(photoUrl && !imgFailedMap[key]);
          const catMeta = classifyPoiCategory(poi.category, poi.name);
          const priceVal = poi.price ?? poi.cost_eur ?? 0;
          const durVal = poi.duration_mins ?? 60;

          return (
            <div
              key={key}
              className={styles.poiCard}
              onClick={() => {
                if (dragInfo.current.hasMoved || isDragging) return;
                handleInspect(poi);
              }}
              title={t('trip_agent.click_focus_inspect', { name: poi.name })}
            >
              {/* Photo Banner with Category Fallback */}
              <div className={styles.imageBanner}>
                {hasImage ? (
                  <img
                    src={photoUrl!}
                    alt={poi.name}
                    className={styles.poiImage}
                    loading="lazy"
                    onError={() => setImgFailedMap((prev) => ({ ...prev, [key]: true }))}
                  />
                ) : (
                  <div className={styles.imageFallback}>
                    <CategoryIcon type={catMeta.type} size={28} />
                    <span style={{ fontSize: '10px', textTransform: 'capitalize' }}>
                      {poi.category || t('trip_agent.attraction')}
                    </span>
                  </div>
                )}
                <div className={styles.mapBadgeOverlay}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                  </svg>
                  <span>{t('trip_agent.map_badge')}</span>
                </div>
              </div>

              {/* Card Body */}
              <div className={styles.cardBody}>
                <div className={styles.nameRow}>
                  <h4 className={styles.poiName} title={poi.name}>
                    {poi.name}
                  </h4>
                </div>

                <div className={styles.badgeRow}>
                  <PoiCategoryBadge category={poi.category} name={poi.name} size="xs" />
                  {poi.rating && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#D97706' }}>
                      ★ {poi.rating.toFixed(1)}
                    </span>
                  )}
                </div>

                {poi.description && (
                  <p className={styles.descSnippet}>{poi.description}</p>
                )}

                <div className={styles.metaRow}>
                  <span className={styles.priceTag}>
                    {priceVal > 0 ? `€${Math.round(priceVal)}` : t('trip_agent.free_included')}
                  </span>
                  <span>{t('trip_agent.approx_duration_m', { mins: durVal })}</span>
                </div>

                {/* Actions: Inspect & Add */}
                <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.focusButton}
                    onClick={() => handleInspect(poi)}
                    title={t('trip_agent.focus_inspect_details')}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                    </svg>
                    <span>{t('trip_agent.inspect')}</span>
                  </button>

                  <button
                    type="button"
                    className={`${styles.addButton} ${isAdded ? styles.addedButton : ''}`}
                    onClick={() => handleAdd(poi)}
                    disabled={isAdded}
                    title={isAdded ? t('trip_agent.added_to_itinerary') : t('trip_agent.add_to_itinerary')}
                  >
                    {isAdded ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{t('trip_agent.added')}</span>
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>{t('trip_agent.add')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
