"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/contexts/AuthContext';
import { MealRequirement } from '@/types/domain';
import {
  PinIcon,
  PlaneIcon,
  HotelIcon,
  Spinner,
  CheckIcon,
  SettingsIcon,
  StarIcon,
  DocumentIcon,
  ArrowRightIcon,
  BulbIcon,
  CompassIcon,
  LightningIcon,
  PaperclipIcon,
  CloseIcon,
} from '@/components/icons';
import { RouteIntakeBar } from './RouteIntakeBar';
import { PaladioDateRangePicker } from './PaladioDateRangePicker';
import { BoardingPassUploadIntake, BoardingPassExtractedData } from './BoardingPassUploadIntake';
import { CurrencyWheelPicker } from '@/components/trip-workspace/costs/CurrencyWheelPicker';
import { FlagIcon } from '@/components/trip-workspace/costs/FlagIcon';
import { getCurrencyInfo, CurrencyInfo } from '@/utils/currencyResolver';

interface TripCreationBoxesProps {
  onPersonalizedSubmit: (prompt: string, extras: Record<string, unknown>) => void;
  disabled?: boolean;
  initialDestination?: string;
  initialOrigin?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialBudget?: number;
  status?: string;
}

const formatDateOffset = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

export function TripCreationBoxes({
  onPersonalizedSubmit,
  disabled = false,
  initialDestination = 'Paris',
  initialOrigin = 'Madrid',
  initialStartDate,
  initialEndDate,
  initialBudget = 1500,
  status = 'connected',
}: TripCreationBoxesProps) {
  const router = useRouter();
  const { saveTrip } = useTrips();
  const { user: currentUser } = useAuth();

  // Mode: 'personalized' (default) | 'blank'
  const [selectedMode, setSelectedMode] = useState<'personalized' | 'blank'>('personalized');
  // Intake method: 'manual' | 'boarding_pass'
  const [intakeMethod, setIntakeMethod] = useState<'manual' | 'boarding_pass'>('manual');

  // Currency & Spin Dial state (defaults to system currency)
  const systemCurrency = (currentUser?.preferences?.default_currency as string) || 'EUR';
  const [currency, setCurrency] = useState(systemCurrency);
  const [isCurrencyWheelOpen, setIsCurrencyWheelOpen] = useState(false);

  const [prevUserCurrency, setPrevUserCurrency] = useState(currentUser?.preferences?.default_currency);
  if (currentUser?.preferences?.default_currency && currentUser.preferences.default_currency !== prevUserCurrency) {
    setPrevUserCurrency(currentUser.preferences.default_currency);
    setCurrency(currentUser.preferences.default_currency as string);
  }

  // Shared form state
  const [destination, setDestination] = useState(initialDestination);
  const [origin, setOrigin] = useState(initialOrigin);
  const [tripTitle, setTripTitle] = useState('');
  const [tripDescription, setTripDescription] = useState('');
  const [departureHour, setDepartureHour] = useState('09:00');
  const [arrivalHour, setArrivalHour] = useState('20:00');
  const [travelersCount, setTravelersCount] = useState(2);
  const [customPhotoUrl, setCustomPhotoUrl] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState(() => initialStartDate || formatDateOffset(7));
  const [endDate, setEndDate] = useState(() => initialEndDate || formatDateOffset(12));
  const [budgetUsd, setBudgetUsd] = useState(initialBudget);

  // Blank trip specific fields
  const [hotelArea, setHotelArea] = useState('');
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [blankError, setBlankError] = useState<string | null>(null);
  const [blankSuccess, setBlankSuccess] = useState<string | null>(null);

  // Personalized trip specific fields
  const [personalizedPrompt, setPersonalizedPrompt] = useState(
    'Visit the main cultural landmarks and museums. Love traditional bistros and relaxed cafes.'
  );
  const [meals] = useState<MealRequirement[]>([
    { meal_type: 'BREAKFAST', start_time: '08:00', end_time: '10:00' },
    { meal_type: 'LUNCH', start_time: '12:00', end_time: '14:30' },
    { meal_type: 'DINNER', start_time: '19:30', end_time: '22:00' },
  ]);
  const [anchorMode] = useState<'simulated' | 'direct'>('simulated');
  const rawBookingText = '';

  // Calculate duration
  const tripDurationDays = useMemo(() => {
    if (!startDate || !endDate) return 5;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }, [startDate, endDate]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const getDestinationPhotoUrl = (city: string) => {
    if (customPhotoUrl) return customPhotoUrl;
    const c = (city || '').toLowerCase().trim();
    if (c.includes('paris')) return 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('madrid')) return 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('tokyo')) return 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('london')) return 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('rome')) return 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('seville') || c.includes('sevilla')) return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('barcelona')) return 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('amsterdam')) return 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('new york') || c.includes('nyc')) return 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80';
    if (c.includes('berlin')) return 'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=1200&q=80';
    return 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80';
  };

  const handleExtracted = (data: BoardingPassExtractedData) => {
    if (data.origin_city) setOrigin(data.origin_city);
    else if (data.origin_iata) setOrigin(data.origin_iata);

    if (data.destination_city) setDestination(data.destination_city);
    else if (data.destination_iata) setDestination(data.destination_iata);

    if (data.departure_date) {
      const start = data.departure_date;
      let end = data.return_date;
      if (!end) {
        const sDate = new Date(start);
        sDate.setDate(sDate.getDate() + 5);
        const y = sDate.getFullYear();
        const m = String(sDate.getMonth() + 1).padStart(2, '0');
        const d = String(sDate.getDate()).padStart(2, '0');
        end = `${y}-${m}-${d}`;
      }
      setStartDate(start);
      setEndDate(end);
    }
    setIntakeMethod('manual');
  };

  // Handle Blank Trip Submission
  const handleCreateBlankTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) {
      setBlankError('Destination city is required.');
      return;
    }
    setBlankError(null);
    setIsCreatingBlank(true);

    try {
      const start = new Date(startDate);
      const days = [];
      for (let i = 1; i <= tripDurationDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + (i - 1));
        days.push({
          day: i,
          date: d.toISOString().split('T')[0],
          activities: [],
          theme: `Day ${i} Exploration`,
        });
      }

      const blankItineraryData = {
        title: tripTitle.trim() || `Trip to ${destination.trim()}`,
        destination: destination.trim(),
        origin: origin.trim() || undefined,
        description: tripDescription.trim() || undefined,
        travel_constraints: {
          destination_city: destination.trim(),
          origin_city: origin.trim() || undefined,
          start_date: startDate,
          end_date: endDate,
          departure_hour: departureHour,
          arrival_hour: arrivalHour,
          budget: Number(budgetUsd) || 1500,
          budget_usd: Number(budgetUsd) || 1500,
          currency: currency,
          travelers: travelersCount,
          accommodation: hotelArea.trim() || undefined,
        },
        days,
        is_blank_trip: true,
      };

      const startIso = new Date(startDate).toISOString();
      const endIso = new Date(endDate).toISOString();

      const createdTrip = await saveTrip({
        destination: destination.trim(),
        start_date: startIso,
        end_date: endIso,
        itinerary_data: blankItineraryData,
      });

      if (createdTrip?.id) {
        setBlankSuccess('Trip created! Seeding POIs & GTFS in background...');
        setTimeout(() => {
          router.push(`/trips/${createdTrip.id}`);
        }, 500);
      } else {
        throw new Error('Failed to create trip in database.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating blank trip.';
      setBlankError(msg);
      setIsCreatingBlank(false);
    }
  };

  // Handle Personalized Trip Submission
  const handlePersonalizedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personalizedPrompt.trim()) return;

    const extras: Record<string, unknown> = {
      test_mode: anchorMode === 'simulated',
      title: tripTitle.trim() || `Trip to ${destination.trim()}`,
      description: tripDescription.trim() || undefined,
      booking_text: anchorMode === 'direct' ? rawBookingText : undefined,
      origin_city: origin.trim() || 'Madrid',
      destination_city: destination.trim() || 'Paris',
      start_date: startDate,
      end_date: endDate,
      departure_hour: departureHour,
      arrival_hour: arrivalHour,
      budget: Number(budgetUsd) || 1500,
      budget_usd: Number(budgetUsd) || 1500,
      currency: currency,
      travelers: travelersCount,
      meals,
      manual_constraints: {
        title: tripTitle.trim() || `Trip to ${destination.trim()}`,
        description: tripDescription.trim() || undefined,
        budget: Number(budgetUsd) || 1500,
        budget_usd: Number(budgetUsd) || 1500,
        currency: currency,
        travelers: travelersCount,
        departure_hour: departureHour,
        arrival_hour: arrivalHour,
        meals,
      },
    };
    onPersonalizedSubmit(personalizedPrompt, extras);
  };

  const promptPresets = [
    { label: 'Architecture & Art', icon: 'museum', text: 'Focus on iconic architecture, world-class art museums, and historical landmarks.' },
    { label: 'Gastronomy & Cafes', icon: 'gastronomy', text: 'Highlight traditional local bistros, artisanal bakeries, cozy coffee shops, and authentic food markets.' },
    { label: 'Hidden Gems', icon: 'compass', text: 'Avoid large tourist queues. Prioritize charming hidden alleys, quiet parks, and neighborhood secrets.' },
    { label: 'Fast-Paced Route', icon: 'lightning', text: 'High-intensity efficient route covering maximum top sights with smooth transit connections.' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: '1280px', margin: '0 auto' }}>
      {/* ================= MAIN TRIP CREATION CARD ================= */}
      <div
        style={{
          background: 'var(--color-surface-raised, #FFFFFF)',
          border: '1px solid var(--color-border)',
          borderRadius: '28px',
          padding: '2rem',
          boxShadow: 'var(--shadow-sm, 0 4px 24px rgba(0,0,0,0.04))',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          animation: 'fadeInSlide 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Top Header Row: Dual Segmented Switchers */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: '1.25rem',
          }}
        >
          {/* Mode Segmented Capsule (Google Wi-Fi / Starlink style) */}
          <div
            style={{
              display: 'inline-flex',
              padding: '4px',
              borderRadius: '9999px',
              background: 'var(--color-bg-main, #F0F2F4)',
              border: '1px solid var(--color-border)',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedMode('personalized')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9999px',
                border: 'none',
                background: selectedMode === 'personalized' ? '#2563EB' : 'transparent',
                color: selectedMode === 'personalized' ? '#FFFFFF' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <StarIcon size={14} color={selectedMode === 'personalized' ? '#FFFFFF' : 'currentColor'} />
              <span>Personalized Trip</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode('blank')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: '9999px',
                border: 'none',
                background: selectedMode === 'blank' ? 'var(--color-accent-primary, #0F4C5C)' : 'transparent',
                color: selectedMode === 'blank' ? '#FFFFFF' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <DocumentIcon size={14} color={selectedMode === 'blank' ? '#FFFFFF' : 'currentColor'} />
              <span>Blank Trip</span>
            </button>
          </div>

          {/* Intake Method Capsule (Manual Route vs Boarding Pass) */}
          <div
            style={{
              display: 'inline-flex',
              padding: '4px',
              borderRadius: '9999px',
              background: 'var(--color-bg-main, #F0F2F4)',
              border: '1px solid var(--color-border)',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setIntakeMethod('manual')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                border: 'none',
                background: intakeMethod === 'manual' ? 'var(--color-surface-raised, #FFFFFF)' : 'transparent',
                color: intakeMethod === 'manual' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: intakeMethod === 'manual' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Manual Route
            </button>
            <button
              type="button"
              onClick={() => setIntakeMethod('boarding_pass')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '9999px',
                border: 'none',
                background: intakeMethod === 'boarding_pass' ? 'var(--color-surface-raised, #FFFFFF)' : 'transparent',
                color: intakeMethod === 'boarding_pass' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                boxShadow: intakeMethod === 'boarding_pass' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <PlaneIcon size={13} />
              <span>Upload Boarding Pass</span>
            </button>
          </div>
        </div>

        {/* ================= SIDE-BY-SIDE MAIN WORKSPACE ================= */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            gap: '1.75rem',
            alignItems: 'start',
          }}
        >
          {/* Column A (Left): Visual Hero + Flights Bar + Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Dynamic Travel Hero Banner */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '170px',
                borderRadius: '20px',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-main, #F0F2F4)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getDestinationPhotoUrl(destination)}
                alt={destination || 'Travel destination'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: 'brightness(0.85)',
                  transition: 'all 0.4s ease',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
                }}
              />

              {/* Top-Right Upload Photo Trigger Button */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  zIndex: 2,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload your own trip photo"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'rgba(0, 0, 0, 0.55)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '9999px',
                    padding: '5px 12px',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PaperclipIcon size={12} color="#FFFFFF" />
                  <span>Upload Photo</span>
                </button>
                {customPhotoUrl && (
                  <button
                    type="button"
                    onClick={() => setCustomPhotoUrl('')}
                    title="Reset to dynamic photo"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'rgba(0, 0, 0, 0.55)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <CloseIcon size={12} />
                  </button>
                )}
              </div>

              {/* Editable Title Pill over Image */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '14px',
                  right: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: '9999px',
                    padding: '6px 14px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    flex: 1,
                  }}
                >
                  <PinIcon size={15} color="#0F4C5C" />
                  <input
                    type="text"
                    value={tripTitle}
                    onChange={(e) => setTripTitle(e.target.value)}
                    placeholder={destination.trim() ? `Trip to ${destination.trim()}` : 'Trip to Europe'}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#111827',
                      marginLeft: '8px',
                      width: '100%',
                    }}
                  />
                </div>

                <span
                  style={{
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(8px)',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    letterSpacing: '0.04em',
                  }}
                >
                  {destination ? destination.toUpperCase() : 'DESTINATION'}
                </span>
              </div>
            </div>

            {/* Trip Description Input directly below Title & Photo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--color-bg-main, #FAF8F5)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                padding: '8px 14px',
              }}
            >
              <DocumentIcon size={14} color="var(--color-text-muted)" />
              <input
                type="text"
                value={tripDescription}
                onChange={(e) => setTripDescription(e.target.value)}
                placeholder="Trip description (e.g. Autumn photography journey through local neighborhoods)..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>



            {/* Flight Route / Boarding Pass Section */}
            {intakeMethod === 'boarding_pass' ? (
              <div
                style={{
                  background: 'var(--color-bg-main, #FAF8F5)',
                  border: '1.5px dashed var(--color-border)',
                  borderRadius: '20px',
                  padding: '1.25rem',
                }}
              >
                <BoardingPassUploadIntake onExtracted={handleExtracted} disabled={disabled} />
              </div>
            ) : (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Flight Route & Time Windows
                </label>
                <RouteIntakeBar
                  origin={origin}
                  destination={destination}
                  departureHour={departureHour}
                  arrivalHour={arrivalHour}
                  onOriginChange={setOrigin}
                  onDestinationChange={setDestination}
                  onDepartureHourChange={setDepartureHour}
                  onArrivalHourChange={setArrivalHour}
                  disabled={disabled}
                />
              </div>
            )}

            {/* Parameters: Budget Pill + Travelers + (Hotel Anchor) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {/* Budget Pill with Currency Wheel Picker Button */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Budget Envelope
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--color-bg-main, #FAF8F5)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '6px 12px 6px 16px',
                  }}
                >
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={budgetUsd}
                    onChange={(e) => setBudgetUsd(Number(e.target.value))}
                    placeholder="1500"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  />

                  {/* Currency Spin Dial Trigger Capsule */}
                  <button
                    type="button"
                    onClick={() => setIsCurrencyWheelOpen(true)}
                    title="Change currency with dynamic spin dial"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--color-surface-raised, #FFFFFF)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '9999px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <FlagIcon countryCode={getCurrencyInfo(currency).flag} size={15} />
                    <span>{currency}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
                      ({getCurrencyInfo(currency).symbol})
                    </span>
                    <SettingsIcon size={12} color="var(--color-text-muted)" />
                  </button>
                </div>
              </div>

              {/* Travelers Count Selector */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Travelers
                </label>
                <div
                  style={{
                    display: 'flex',
                    background: 'var(--color-bg-main, #FAF8F5)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '4px',
                    gap: '2px',
                  }}
                >
                  {[1, 2, 3, 4].map((count) => {
                    const isSelected = count === 4 ? travelersCount >= 4 : travelersCount === count;
                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setTravelersCount(count)}
                        style={{
                          flex: 1,
                          padding: '6px 6px',
                          borderRadius: '9999px',
                          border: 'none',
                          background: isSelected ? 'var(--color-surface-raised, #FFFFFF)' : 'transparent',
                          color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                          fontFamily: 'var(--font-sans)',
                          fontSize: '12px',
                          fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {count === 4 ? '4+' : count} {count === 1 ? 'Guest' : 'Guests'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Blank mode: Hotel Anchor Input */}
            {selectedMode === 'blank' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Hotel / Stay Anchor
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--color-bg-main, #FAF8F5)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '8px 14px',
                  }}
                >
                  <HotelIcon size={14} color="var(--color-text-muted)" />
                  <input
                    type="text"
                    value={hotelArea}
                    onChange={(e) => setHotelArea(e.target.value)}
                    placeholder="Hotel or neighborhood anchor..."
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      width: '100%',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Column B (Right): 2-Month Calendar Side-by-Side + Execution Action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-text-muted)',
              }}
            >
              Travel Window & Calendar
            </label>
            <PaladioDateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              disabled={disabled}
              inline={true}
            />

            {/* Feedback / Error Notifications */}
            {blankError && (
              <div
                style={{
                  background: 'rgba(179, 38, 30, 0.08)',
                  border: '1px solid rgba(179, 38, 30, 0.2)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-danger, #B3261E)',
                }}
              >
                {blankError}
              </div>
            )}
            {blankSuccess && (
              <div
                style={{
                  background: 'rgba(31, 122, 77, 0.08)',
                  border: '1px solid rgba(31, 122, 77, 0.2)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-success, #1F7A4D)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CheckIcon size={14} color="var(--color-success, #1F7A4D)" /> {blankSuccess}
              </div>
            )}

            {status === 'inferencing' && (
              <div
                style={{
                  padding: '12px 16px',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '12px',
                  color: '#1E40AF',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Spinner size={16} color="#2563EB" />
                <span>Swarm inferencing & optimizing route in C++20...</span>
              </div>
            )}

            {/* Submit Action Button */}
            <div>
              {selectedMode === 'personalized' ? (
                <button
                  type="button"
                  onClick={handlePersonalizedSubmit}
                  disabled={disabled || status === 'inferencing'}
                  style={{
                    width: '100%',
                    padding: '13px 24px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: status === 'inferencing' || disabled ? 'var(--color-text-muted)' : '#2563EB',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: status === 'inferencing' || disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  {status === 'inferencing' ? (
                    <>
                      <Spinner size={16} color="#FFFFFF" />
                      Optimization In Progress...
                    </>
                  ) : (
                    <>
                      <StarIcon size={15} color="#FFFFFF" />
                      <span>Generate Sovereign Trip Plan</span>
                      <ArrowRightIcon size={14} />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateBlankTrip}
                  disabled={isCreatingBlank || disabled}
                  style={{
                    width: '100%',
                    padding: '13px 24px',
                    borderRadius: '9999px',
                    border: 'none',
                    background: isCreatingBlank ? 'var(--color-text-muted)' : 'var(--color-accent-primary, #0F4C5C)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isCreatingBlank ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 2px 8px rgba(15, 76, 92, 0.25)',
                  }}
                >
                  {isCreatingBlank ? (
                    <>
                      <Spinner size={16} color="#FFFFFF" />
                      Creating Blank Trip & Seeding POIs...
                    </>
                  ) : (
                    <>
                      <DocumentIcon size={15} color="#FFFFFF" />
                      <span>Create Blank Canvas Trip</span>
                      <ArrowRightIcon size={14} />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================= FULL-WIDTH BOTTOM INTENT & SUBMISSION ================= */}
        {selectedMode === 'personalized' && (
          <div
            style={{
              background: 'var(--color-bg-main, #FAF8F5)',
              border: '1px solid var(--color-border)',
              borderRadius: '20px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderTop: '1.5px dashed var(--color-border)',
              marginTop: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="font-mono text-xs text-muted" style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
                INTENT, CONSTRAINTS & PREFERENCES (LLM SWARM SOLVER)
              </span>
              <span className="font-mono text-xs text-muted">NATURAL LANGUAGE</span>
            </div>
            <textarea
              rows={2}
              value={personalizedPrompt}
              onChange={(e) => setPersonalizedPrompt(e.target.value)}
              placeholder="Describe your travel vision, desired rhythm, favorite cuisines, special interests, or specific stops..."
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                width: '100%',
                fontFamily: 'var(--font-sans)',
                fontSize: '13.5px',
                color: 'var(--color-text-primary)',
                resize: 'none',
                lineHeight: 1.5,
              }}
            />
            {/* Preset Chips with Clean SVG Icons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '2px' }}>
              {promptPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setPersonalizedPrompt(preset.text)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'var(--color-surface-raised, #FFFFFF)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '9999px',
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {preset.icon === 'museum' && <BulbIcon size={12} color="#0F4C5C" />}
                  {preset.icon === 'gastronomy' && <StarIcon size={12} color="#D42A2F" />}
                  {preset.icon === 'compass' && <CompassIcon size={12} color="#2563EB" />}
                  {preset.icon === 'lightning' && <LightningIcon size={12} color="#EAB308" />}
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Currency Wheel Picker Modal */}
      <CurrencyWheelPicker
        isOpen={isCurrencyWheelOpen}
        onClose={() => setIsCurrencyWheelOpen(false)}
        selectedCurrency={currency}
        onSelectCurrency={(cur: CurrencyInfo) => setCurrency(cur.code)}
        defaultCurrency={systemCurrency}
      />
    </div>
  );
}
