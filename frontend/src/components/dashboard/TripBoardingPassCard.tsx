"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Trip } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import styles from './TripBoardingPassCard.module.css';

interface TripBoardingPassCardProps {
  trip: Trip | null;
  loading?: boolean;
}

export function TripBoardingPassCard({ trip, loading }: TripBoardingPassCardProps) {
  const { user } = useAuth();
  const passengerName = user?.username ? user.username.toUpperCase() : 'SOVEREIGN TRAVELER';

  // Extract flight and hotel details dynamically from the upcoming trip
  const passData = useMemo(() => {
    if (!trip) return null;

    const itin = trip.itinerary_data as {
      days?: Array<{
        day?: number;
        flight_info?: {
          origin_iata?: string;
          destination_iata?: string;
          departure_time?: string;
          arrival_time?: string;
          flight_number?: string;
          airline?: string;
          flight_duration_minutes?: number;
        };
        itinerary?: {
          path?: Array<{
            poi?: {
              name?: string;
              category?: string;
              city?: string;
              scoring?: { google_rating?: number };
            };
          }>;
        };
      }>;
    } | null | undefined;

    // 1. Extract Flight Details
    const firstDay = itin?.days?.[0];
    const flightInfo = firstDay?.flight_info;

    const originIata = flightInfo?.origin_iata || 'PEK';
    const originCity = originIata === 'PEK' ? 'Beijing' : originIata === 'MAD' ? 'Madrid' : 'Origin';

    const destIata = flightInfo?.destination_iata || (trip.destination ? trip.destination.slice(0, 3).toUpperCase() : 'NRT');
    const destCity = trip.destination || 'Tokyo';

    const depTime = flightInfo?.departure_time ? flightInfo.departure_time.slice(0, 5) : '10:45';
    const arrTime = flightInfo?.arrival_time ? flightInfo.arrival_time.slice(0, 5) : '15:30';

    const durMins = flightInfo?.flight_duration_minutes || 225;
    const durHours = Math.floor(durMins / 60);
    const durRemMins = durMins % 60;
    const durationStr = `${durHours}h ${durRemMins}m`;

    const flightNum = flightInfo?.flight_number || (flightInfo?.airline ? `${flightInfo.airline.slice(0, 2).toUpperCase()}737` : 'PH737');

    // 2. Format Dates
    const startDateObj = new Date(trip.start_date);
    const dateFormatted = isNaN(startDateObj.getTime())
      ? trip.start_date
      : startDateObj.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          weekday: 'short',
        });

    const endDateObj = new Date(trip.end_date);
    const stayNights = Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)));

    // 3. Extract Hotel / Lodging Details
    let hotelName = `${destCity} Central Grand Hotel`;
    let hotelRating = '4.8 Rating';
    let hotelAddress = `${destCity} Historic Center`;

    if (Array.isArray(itin?.days)) {
      for (const day of itin.days) {
        if (Array.isArray(day?.itinerary?.path)) {
          for (const stop of day.itinerary.path) {
            const p = stop.poi;
            if (p) {
              const catUpper = (p.category || '').toUpperCase();
              const nameLower = (p.name || '').toLowerCase();
              if (catUpper === 'HOTEL' || catUpper.includes('LODGING') || nameLower.includes('hotel')) {
                hotelName = p.name || hotelName;
                if (p.scoring?.google_rating) {
                  hotelRating = `${p.scoring.google_rating.toFixed(1)} Rating`;
                }
                if (p.city) {
                  hotelAddress = `${p.city} Central District`;
                }
                break;
              }
            }
          }
        }
      }
    }

    return {
      originCity,
      originIata,
      destCity,
      destIata,
      depTime,
      arrTime,
      durationStr,
      dateFormatted,
      flightNum,
      seatNumber: 'F16',
      flightClass: 'Economy',
      stayNights,
      hotelName,
      hotelRating,
      hotelAddress,
      tripId: trip.id,
      tripDestination: trip.destination,
    };
  }, [trip]);

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.standbyTicket}>
          <p className="font-mono text-muted text-xs">{'// ISSUING SOVEREIGN BOARDING PASS & VOUCHERS...'}</p>
        </div>
      </div>
    );
  }

  if (!passData) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.standbyTicket}>
          <span className={styles.standbyTag}>{'// TRANSIT & LODGING PASS'}</span>
          <h3 className={styles.standbyTitle}>No Active Travel Vouchers</h3>
          <p className={styles.standbyDesc}>
            Initialize your next mission to generate sovereign boarding passes and verified hotel vouchers.
          </p>
          <Link href="/engine" className={styles.standbyBtn}>
            + Issue Travel Protocol
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.ticket}>
        {/* Ticket Top Header Strip */}
        <div className={styles.ticketHeader}>
          <div className={styles.badgeGroup}>
            <span className={styles.typeBadge}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
              </svg>
              <span>AIR TRANSIT</span>
            </span>
            <span className={styles.statusPill}>CONFIRMED</span>
          </div>
          <span className={styles.terminalGate}>GATE B16 · T2</span>
        </div>

        {/* Flight Corridor (Origin -> Destination) */}
        <div className={styles.flightSection}>
          <div className={styles.corridorRow}>
            {/* Origin */}
            <div className={styles.endpoint}>
              <span className={styles.cityName}>{passData.originCity}</span>
              <span className={styles.iataCode}>{passData.originIata}</span>
              <span className={styles.timeLabel}>{passData.depTime}</span>
              <span className={styles.dateLabel}>{passData.dateFormatted}</span>
            </div>

            {/* Path with Airplane & Duration */}
            <div className={styles.flightPath}>
              <span className={styles.durationBadge}>{passData.durationStr}</span>
              <div className={styles.flightLine}>
                <span className={styles.dashedLine} aria-hidden="true" />
                <svg className={styles.planeIcon} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
                <span className={styles.dashedLine} aria-hidden="true" />
              </div>
            </div>

            {/* Destination */}
            <div className={styles.endpointRight}>
              <span className={styles.cityName}>{passData.destCity}</span>
              <span className={styles.iataCode}>{passData.destIata}</span>
              <span className={styles.timeLabel}>{passData.arrTime}</span>
              <span className={styles.dateLabel}>{passData.dateFormatted}</span>
            </div>
          </div>

          {/* Passenger & Flight Details Grid */}
          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Passenger</span>
              <span className={styles.metaValue}>{passengerName}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Seat Number</span>
              <span className={styles.metaValue}>{passData.seatNumber}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Class</span>
              <span className={styles.metaValue}>{passData.flightClass}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Flight Number</span>
              <span className={styles.metaValue}>{passData.flightNum}</span>
            </div>
          </div>
        </div>

        {/* Dashed Perforation Line with Side Notches */}
        <div className={styles.perforation} aria-hidden="true" />

        {/* Hotel & Lodging Section ("includes the hotel") */}
        <div className={styles.hotelSection}>
          <div className={styles.hotelHeader}>
            <span className={styles.hotelBadge}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span>LODGING RESERVATION</span>
            </span>
            <span className={styles.hotelRating}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span>{passData.hotelRating}</span>
            </span>
          </div>

          <div className={styles.hotelTitleRow}>
            <h4 className={styles.hotelName}>{passData.hotelName}</h4>
            <span className={styles.hotelDates}>{passData.stayNights} Nights Stay · Active Voucher</span>
          </div>

          <div className={styles.hotelDetailsGrid}>
            <div className={styles.hotelDetailItem}>
              <span className={styles.hotelDetailLabel}>Location</span>
              <span className={styles.hotelDetailValue}>{passData.hotelAddress}</span>
            </div>
            <div className={styles.hotelDetailItem}>
              <span className={styles.hotelDetailLabel}>Status</span>
              <span className={styles.hotelDetailValue} style={{ color: 'var(--color-success, #2F8F5B)' }}>
                Guaranteed Check-in
              </span>
            </div>
          </div>
        </div>

        {/* Watermark Sovereign Stamp */}
        <div className={styles.stamp} aria-hidden="true">
          PALADIO SOVEREIGN DISPATCH
        </div>
      </div>
    </div>
  );
}
