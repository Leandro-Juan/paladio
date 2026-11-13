"use client";

import React from 'react';
import { DealPackage } from '@/hooks/useRouteMonitoring';
import {
  HotelIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
  WifiIcon,
  PawIcon,
  BarIcon,
  UtensilsIcon,
  ParkingIcon,
  PoolIcon,
  GymIcon,
  AcIcon,
  CheckmarkIcon,
} from '@/components/icons';
import { formatCurrencyAmount } from '@/utils/currencyResolver';
import styles from './HotelTicketCard.module.css';

interface HotelTicketCardProps {
  deal: DealPackage;
  dealCurrency?: string;
}

export function HotelTicketCard({ deal, dealCurrency = 'EUR' }: HotelTicketCardProps) {
  const lodging = deal.lodging;
  const activeCurrency = deal.currency || dealCurrency || 'EUR';

  if (!lodging) {
    return (
      <div className={styles.dealComponentCard} style={{ opacity: 0.85 }}>
        <div className={styles.componentHeader}>
          <span className={styles.componentTypeTitle}>
            <HotelIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
            Accommodation
          </span>
          <span className={styles.componentCarrierBadge}>Flexible Stay</span>
        </div>
        <div className={styles.componentDetails}>
          <span className={styles.componentMainName}>Flight Deal Corridor</span>
          <span className={styles.componentSubText}>
            {deal.nights} Nights in {deal.destination_name} · Lodging can be selected dynamically.
          </span>
        </div>
        <div className={styles.componentPriceRow}>
          <span className={styles.componentPrice}>Direct Airfare Package</span>
        </div>
      </div>
    );
  }

  const travelerCount = deal.travelers || 1;
  const avatars = (deal.participants && deal.participants.length > 0)
    ? deal.participants.map((p, i) => ({
        key: p.id || String(i),
        initials: (p.name || `P${i + 1}`)
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        name: p.name || `Traveler ${i + 1}`,
      }))
    : Array.from({ length: travelerCount }, (_, i) => ({
        key: `traveler-${i}`,
        initials: `P${i + 1}`,
        name: `Traveler ${i + 1}`,
      }));

  // Parse amenities dynamically
  const amenitiesList = (lodging.amenities || []).map((a) => a.toLowerCase());
  const hasWifi = amenitiesList.some((a) => a.includes('wifi'));
  const hasPets = amenitiesList.some((a) => a.includes('pet'));
  const hasBar = amenitiesList.some((a) => a.includes('bar') || a.includes('lounge'));
  const hasBreakfast = amenitiesList.some((a) => a.includes('breakfast'));
  const hasParking = amenitiesList.some((a) => a.includes('park'));
  const hasPool = amenitiesList.some((a) => a.includes('pool') || a.includes('swim'));
  const hasGym = amenitiesList.some((a) => a.includes('gym') || a.includes('fitness'));
  const hasAc = amenitiesList.some((a) => a.includes('ac') || a.includes('air'));

  // Clean property name (strip duplicate "(2 Guests)" if present)
  const cleanPropertyName = (lodging.property_name || 'Verified Lodging')
    .replace(/\s*\(\d+\s*Guests?\)/gi, '')
    .trim();

  const starCount = lodging.stars ? Math.round(lodging.stars) : 0;

  return (
    <div className={styles.dealComponentCard}>
      {/* Top Header */}
      <div className={styles.componentHeader}>
        <span className={styles.componentTypeTitle}>
          <HotelIcon size={14} color="var(--color-accent-primary, #0F4C5C)" />
          Accommodation
        </span>
        <span className={styles.componentCarrierBadge}>
          {lodging.badge && lodging.badge !== 'standard'
            ? `${lodging.badge === 'best_value' ? 'Best Value' : lodging.badge === 'cheapest' ? 'Cheapest' : lodging.badge === 'top_rated' ? 'Top Rated' : lodging.badge} · `
            : ''}
          {lodging.quality_score
            ? `${lodging.quality_score.toFixed(0)}/100 Quality`
            : lodging.stars
            ? `${lodging.stars} Stars`
            : 'Verified Stay'}
        </span>
      </div>

      {/* Horizontal Body: Photo Left + Info Right */}
      <div className={styles.hotelHorizontalBody}>
        <div className={styles.hotelThumbnailWrapper}>
          {lodging.photo_url ? (
            <img
              src={lodging.photo_url}
              alt={cleanPropertyName}
              className={styles.hotelThumbnail}
              loading="lazy"
            />
          ) : (
            <div className={styles.hotelThumbnailFallback}>
              <HotelIcon size={28} />
            </div>
          )}
        </div>

        <div className={styles.hotelInfoCol}>
          <div className={styles.hotelNameRow}>
            <span className={styles.componentMainName} title={cleanPropertyName}>
              {cleanPropertyName}
            </span>
            {starCount > 0 && (
              <span className={styles.hotelStarsRow} title={`${starCount} Stars`}>
                {Array.from({ length: Math.min(starCount, 5) }).map((_, i) => (
                  <StarIcon key={i} size={11} color="#F59E0B" fill="#F59E0B" />
                ))}
              </span>
            )}
          </div>

          <span className={styles.hotelLocationText}>
            {lodging.address || deal.destination_name}
          </span>

          {/* Guest Count & Overlapping Avatar Stack */}
          <div className={styles.hotelGuestRow}>
            <span className={styles.guestCountBadge}>
              {travelerCount === 1 ? <UserIcon size={11} /> : <UsersIcon size={11} />}
              {travelerCount} {travelerCount === 1 ? 'Guest' : 'Guests'}
            </span>
            <div
              className={styles.avatarStack}
              title={avatars.map((a) => a.name).join(', ')}
            >
              {avatars.map((a) => (
                <span key={a.key} className={styles.avatarCircle} title={a.name}>
                  {a.initials}
                </span>
              ))}
            </div>
          </div>

          {/* Room Type & Meal Perks */}
          <div className={styles.hotelPerkRow}>
            <span className={styles.hotelPerkItem}>
              <HotelIcon size={12} color="var(--color-text-secondary, #475569)" />
              {lodging.room_type || (travelerCount > 1 ? 'Double Room' : 'Standard Room')}
            </span>
            {lodging.board ? (
              <span className={styles.hotelPerkItem}>
                <UtensilsIcon size={12} color="var(--color-text-secondary, #475569)" />
                {lodging.board}
              </span>
            ) : hasBreakfast ? (
              <span className={styles.hotelPerkItem}>
                <UtensilsIcon size={12} color="var(--color-text-secondary, #475569)" />
                Breakfast included
              </span>
            ) : null}
          </div>

          {/* Free Cancellation */}
          {(lodging.free_cancellation || amenitiesList.some((a) => a.includes('cancel'))) && (
            <div className={styles.hotelCancellationTag}>
              <CheckmarkIcon size={12} />
              <span>Free cancellation</span>
            </div>
          )}
        </div>
      </div>

      {/* Amenity Icons Row */}
      <div className={styles.hotelAmenitiesRow}>
        {hasWifi && (
          <span className={styles.amenityIconPill} title="Free High-Speed Wi-Fi">
            <WifiIcon size={12} />
          </span>
        )}
        {hasPets && (
          <span className={styles.amenityIconPill} title="Pet-Friendly Stay">
            <PawIcon size={12} />
          </span>
        )}
        {hasBar && (
          <span className={styles.amenityIconPill} title="Bar / Lounge">
            <BarIcon size={12} />
          </span>
        )}
        {hasBreakfast && (
          <span className={styles.amenityIconPill} title="Breakfast Included">
            <UtensilsIcon size={12} />
          </span>
        )}
        {hasParking && (
          <span className={styles.amenityIconPill} title="Parking Available">
            <ParkingIcon size={12} />
          </span>
        )}
        {hasPool && (
          <span className={styles.amenityIconPill} title="Swimming Pool">
            <PoolIcon size={12} />
          </span>
        )}
        {hasGym && (
          <span className={styles.amenityIconPill} title="Fitness Center">
            <GymIcon size={12} />
          </span>
        )}
        {hasAc && (
          <span className={styles.amenityIconPill} title="Air Conditioning">
            <AcIcon size={12} />
          </span>
        )}
      </div>

      {/* Price & Booking Row */}
      <div className={styles.componentPriceRow}>
        <span className={styles.componentPrice}>
          {travelerCount > 1
            ? `${formatCurrencyAmount((lodging.landed_total_eur ?? 0) / travelerCount, activeCurrency)} / pers · ${formatCurrencyAmount(lodging.landed_total_eur ?? 0, activeCurrency)} total (${deal.nights} Nights)`
            : `${lodging.landed_total_eur ? `${formatCurrencyAmount(lodging.landed_total_eur, activeCurrency)} Landed ` : 'Landed Lodging '}(${deal.nights} Nights)`}
        </span>
        {lodging.booking_url && (
          <a
            href={lodging.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.directLinkBtn}
          >
            Book Hotel ↗
          </a>
        )}
      </div>
    </div>
  );
}
