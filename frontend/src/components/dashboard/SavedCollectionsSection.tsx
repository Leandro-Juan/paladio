"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSavedCollections, TripCollection } from '@/hooks/useTripCollections';
import styles from './SavedCollectionsSection.module.css';

interface SavedCollectionsSectionProps {
  initialCollections?: TripCollection[];
  loading?: boolean;
}

export function SavedCollectionsSection({
  initialCollections,
  loading: externalLoading,
}: SavedCollectionsSectionProps) {
  const { collections: fetchedCollections, loading: hookLoading } = useSavedCollections();

  const collections = initialCollections ?? fetchedCollections;
  const loading = externalLoading ?? hookLoading;

  return (
    <section
      className={styles.section}
      data-testid="saved-collections-section"
      aria-label="Saved Collections"
    >
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h2 className={styles.title}>SAVED COLLECTIONS</h2>
          <span className={styles.countBadge} data-testid="saved-collections-count">
            {loading ? 'SYNCING...' : `${collections.length} CURATED`}
          </span>
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyDesc}>Synchronizing curated POI vaults and collections...</p>
        </div>
      ) : collections.length === 0 ? (
        <div className={styles.emptyState} data-testid="saved-collections-empty">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.6 }}
            aria-hidden="true"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h3 className={styles.emptyTitle}>No Saved Collections</h3>
          <p className={styles.emptyDesc}>
            Curate custom POI vaults, bookmark backup plans, and organize places across your itineraries.
          </p>
          <Link href="/engine" className={styles.emptyAction}>
            + Plan New Expedition
          </Link>
        </div>
      ) : (
        <div className={styles.grid} data-testid="saved-collections-grid">
          {collections.map((col) => {
            const previewItems = col.items.slice(0, 3);
            const extraCount = col.items.length - previewItems.length;

            return (
              <Link
                key={col.id}
                href={`/trips/${col.trip_id}?tab=saved`}
                className={styles.card}
                data-testid={`saved-collection-card-${col.id}`}
              >
                <div
                  className={styles.colorBar}
                  style={{ backgroundColor: col.color || '#0F4C5C' }}
                />

                <div className={styles.cardBody}>
                  <div className={styles.cardHeaderRow}>
                    <h3 className={styles.colName}>{col.name}</h3>
                    {col.trip_destination && (
                      <span className={styles.destinationBadge}>
                        {col.trip_destination}
                      </span>
                    )}
                  </div>

                  {col.description && (
                    <p className={styles.colDescription}>{col.description}</p>
                  )}

                  {previewItems.length > 0 && (
                    <div className={styles.previewList}>
                      {previewItems.map((item) => {
                        const poi = item.poi;
                        const photo = poi?.photo_url || poi?.thumbnail_url;
                        const name = poi?.name || item.poi_id;
                        const category = poi?.category || 'place';

                        return (
                          <div key={item.id} className={styles.previewItem}>
                            <div className={styles.thumbnailWrapper}>
                              {photo ? (
                                <Image
                                  src={photo}
                                  alt={name}
                                  width={24}
                                  height={24}
                                  className={styles.thumbnailImg}
                                  unoptimized
                                />
                              ) : (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  style={{ opacity: 0.5 }}
                                >
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                              )}
                            </div>
                            <span className={styles.poiName}>{name}</span>
                            <span className={styles.categoryTag}>{category}</span>
                          </div>
                        );
                      })}
                      {extraCount > 0 && (
                        <div className={styles.moreItems}>
                          +{extraCount} more place{extraCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.cardFooter}>
                  <span className={styles.footerCount}>
                    {col.items_count} {col.items_count === 1 ? 'place' : 'places'}
                  </span>
                  <span className={styles.footerAction}>
                    OPEN VAULT <span>→</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
