"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { useAnimatedMount } from '@/hooks/useAnimatedMount';
import { TripTicket, TicketType, TicketStatus } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG, STATUS_BADGE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { CustomSelect } from '../parts/CustomSelect';
import { AlertTriangleIcon, CalendarIcon, ClockIcon, CloseIcon } from '@/components/icons';
import { PaladioSingleDatePicker } from '@/components/trip-creation/PaladioSingleDatePicker';
import { CustomHourPickerModal } from '@/components/trip-creation/CustomHourPickerModal';
import { useTranslation } from '@/hooks/useTranslation';

interface TicketFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: Record<string, unknown>) => Promise<void>;
  initialTicket?: TripTicket | null;
  defaultType?: TicketType;
}

export function TicketFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialTicket,
  defaultType = 'flight',
}: TicketFormModalProps) {
  const isMounted = useIsMounted();
  const { shouldRender, dataState } = useAnimatedMount(isOpen, 150);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!shouldRender || !isMounted) return null;

  return createPortal(
    <TicketFormDialog
      key={initialTicket ? initialTicket.id : `new-${defaultType}`}
      onClose={onClose}
      onSubmit={onSubmit}
      initialTicket={initialTicket}
      defaultType={defaultType}
      dataState={dataState}
    />,
    document.body
  );
}

function TicketFormDialog({
  onClose,
  onSubmit,
  initialTicket,
  defaultType = 'flight',
  dataState,
}: {
  onClose: () => void;
  onSubmit: (formData: Record<string, unknown>) => Promise<void>;
  initialTicket?: TripTicket | null;
  defaultType?: TicketType;
  dataState: 'open' | 'closing';
}) {
  const { t, locale } = useTranslation();
  const intlLocale = locale === 'en' ? 'en-US' : locale;
  const isEditing = Boolean(initialTicket);
  const meta = initialTicket?.metadata || {};

  // Form Fields initialized directly from props
  const [ticketType, setTicketType] = useState<TicketType>(initialTicket?.ticket_type || defaultType);
  const [title, setTitle] = useState(initialTicket?.title || '');
  const [status, setStatus] = useState<TicketStatus>(initialTicket?.status || 'confirmed');
  const [provider, setProvider] = useState(initialTicket?.provider || '');
  const [bookingRef, setBookingRef] = useState(initialTicket?.booking_reference || '');
  const [holderName, setHolderName] = useState(initialTicket?.holder_name || '');
  const [seatOrRoom, setSeatOrRoom] = useState(initialTicket?.seat_or_room || '');
  const [locationOrVenue, setLocationOrVenue] = useState(initialTicket?.location_or_venue || '');
  const [startTime, setStartTime] = useState(initialTicket?.start_time ? initialTicket.start_time.slice(0, 16) : '');
  const [endTime, setEndTime] = useState(initialTicket?.end_time ? initialTicket.end_time.slice(0, 16) : '');
  const [departureTz, setDepartureTz] = useState(initialTicket?.departure_tz || '');
  const [arrivalTz, setArrivalTz] = useState(initialTicket?.arrival_tz || '');
  const [barcodeValue, setBarcodeValue] = useState(initialTicket?.barcode_value || '');
  const [barcodeFormat, setBarcodeFormat] = useState<'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix'>(
    initialTicket?.barcode_format || 'qr'
  );
  const [accessCode, setAccessCode] = useState(initialTicket?.access_code || '');
  const [price, setPrice] = useState(initialTicket?.price != null ? String(initialTicket.price) : '');
  const [currency, setCurrency] = useState(initialTicket?.currency || 'EUR');
  const [notes, setNotes] = useState(initialTicket?.notes || '');
  const [visibility, setVisibility] = useState<'trip' | 'private'>(initialTicket?.visibility || 'trip');

  // Specific metadata fields
  const [originIata, setOriginIata] = useState(String(meta.origin_iata || ''));
  const [destIata, setDestIata] = useState(String(meta.destination_iata || ''));
  const [flightNumber, setFlightNumber] = useState(String(meta.flight_number || ''));
  const [terminal, setTerminal] = useState(String(meta.terminal || ''));
  const [gate, setGate] = useState(String(meta.gate || ''));
  const [wifiSsid, setWifiSsid] = useState(String(meta.wifi_ssid || ''));
  const [wifiPass, setWifiPass] = useState(String(meta.wifi_password || ''));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeDateField, setActiveDateField] = useState<'start' | 'end' | null>(null);
  const [activeTimeField, setActiveTimeField] = useState<'start' | 'end' | null>(null);

  const getDatePart = (dt: string) => (dt && dt.includes('T') ? dt.split('T')[0] : dt ? dt.slice(0, 10) : '');
  const getTimePart = (dt: string) => (dt && dt.includes('T') ? dt.split('T')[1].slice(0, 5) : '');
  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return t('wallet.select_date');
    const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
    if (!y || !m || !d) return dateStr;
    return new Date(y, m - 1, d).toLocaleDateString(intlLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  const getTodayLocalDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg(t('wallet.err_title_required'));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const updatedMetadata: Record<string, unknown> = {
      ...(initialTicket?.metadata || {}),
    };

    if (ticketType === 'flight') {
      if (originIata) updatedMetadata.origin_iata = originIata.toUpperCase();
      if (destIata) updatedMetadata.destination_iata = destIata.toUpperCase();
      if (flightNumber) updatedMetadata.flight_number = flightNumber.toUpperCase();
      if (terminal) updatedMetadata.terminal = terminal;
      if (gate) updatedMetadata.gate = gate;
    } else if (ticketType === 'hotel') {
      if (wifiSsid) updatedMetadata.wifi_ssid = wifiSsid;
      if (wifiPass) updatedMetadata.wifi_password = wifiPass;
    }

    const payload: Record<string, unknown> = {
      ticket_type: ticketType,
      title: title.trim(),
      status,
      provider: provider.trim() || undefined,
      booking_reference: bookingRef.trim() || undefined,
      holder_name: holderName.trim() || undefined,
      seat_or_room: seatOrRoom.trim() || undefined,
      location_or_venue: locationOrVenue.trim() || undefined,
      start_time: startTime ? new Date(startTime).toISOString() : undefined,
      end_time: endTime ? new Date(endTime).toISOString() : undefined,
      departure_tz: departureTz.trim() || undefined,
      arrival_tz: arrivalTz.trim() || undefined,
      barcode_value: barcodeValue.trim() || undefined,
      barcode_format: barcodeValue.trim() ? barcodeFormat : undefined,
      access_code: accessCode.trim() || undefined,
      price: price ? parseFloat(price) : undefined,
      currency: currency.toUpperCase() || 'EUR',
      notes: notes.trim() || undefined,
      visibility,
      metadata: updatedMetadata,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('wallet.err_save_ticket'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = (Object.keys(STATUS_BADGE_CONFIG) as TicketStatus[]).map((st) => ({
    value: st,
    label: t(STATUS_BADGE_CONFIG[st].labelKey),
  }));

  const barcodeFormatOptions = [
    { value: 'qr' as const, label: t('wallet.barcode_qr') },
    { value: 'aztec' as const, label: t('wallet.barcode_aztec') },
    { value: 'pdf417' as const, label: t('wallet.barcode_pdf417') },
    { value: 'code128' as const, label: t('wallet.barcode_code128') },
    { value: 'datamatrix' as const, label: t('wallet.barcode_datamatrix') },
  ];

  const visibilityOptions = [
    { value: 'trip' as const, label: t('wallet.visibility_trip') },
    { value: 'private' as const, label: t('wallet.visibility_private') },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--color-surface-card)',
    border: '1px solid var(--color-border-input)',
    borderRadius: '6px',
    padding: '8px 10px',
    color: 'var(--color-text-primary)',
    fontSize: '12px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: 'var(--color-text-muted)',
    marginBottom: '4px',
    fontWeight: 600,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="paladio-modal-backdrop"
      data-state={dataState}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--color-scrim)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="paladio-modal-panel"
        data-state={dataState}
        style={{
          background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border-subtle)',
            background: 'var(--color-surface-page)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>
              {isEditing ? t('wallet.edit_ticket_title') : t('wallet.add_ticket_title')}
            </h3>
            <p className="font-mono text-muted text-xs" style={{ margin: '3px 0 0 0', color: 'var(--color-text-muted)' }}>
              {t('wallet.ticket_form_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('wallet.close_modal_aria')}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: '6px',
              color: 'var(--color-text-muted)',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CloseIcon size={12} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            fontFamily: 'var(--font-mono, monospace)',
            flex: 1,
            minHeight: 0,
          }}
        >
          {errorMsg && (
            <div
              style={{
                background: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                color: 'var(--color-danger)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangleIcon size={14} color="var(--color-danger)" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Ticket Type Selector */}
          <div>
            <label style={labelStyle}>{t('wallet.field_ticket_type')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {(Object.keys(TICKET_TYPE_CONFIG) as TicketType[]).map((type) => {
                const conf = TICKET_TYPE_CONFIG[type];
                const isSelected = ticketType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTicketType(type)}
                    style={{
                      padding: '8px 4px',
                      background: isSelected ? conf.accentBg : 'var(--color-surface-card)',
                      border: `1px solid ${isSelected ? conf.accentBorder : 'var(--color-border-subtle)'}`,
                      borderRadius: '6px',
                      color: isSelected ? conf.accentColor : 'var(--color-text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: isSelected ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{conf.renderIcon({ size: 16, color: isSelected ? conf.accentColor : 'var(--color-text-muted)' })}</span>
                    <span style={{ fontSize: '10px' }}>{t(conf.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{t('wallet.field_title_required')}</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  ticketType === 'flight'
                    ? t('wallet.placeholder_title_flight')
                    : ticketType === 'hotel'
                    ? t('wallet.placeholder_title_hotel')
                    : ticketType === 'attraction'
                    ? t('wallet.placeholder_title_attraction')
                    : t('wallet.placeholder_title_default')
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('wallet.field_status')}</label>
              <CustomSelect<TicketStatus>
                value={status}
                onChange={(newSt) => setStatus(newSt)}
                options={statusOptions}
                label={t('wallet.ticket_status_aria')}
              />
            </div>
          </div>

          {/* Provider, Booking Reference & Holder Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{t('wallet.field_provider_carrier')}</label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder={t('wallet.placeholder_provider')}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('wallet.field_booking_ref_pnr')}</label>
              <input
                type="text"
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value.toUpperCase())}
                placeholder={t('wallet.placeholder_pnr')}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('wallet.field_holder_name')}</label>
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder={t('wallet.placeholder_holder_name')}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Flight specific fields */}
          {ticketType === 'flight' && (
            <div
              style={{
                background: 'var(--color-accent-teal-soft)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-teal)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.field_origin_iata')}
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={originIata}
                  onChange={(e) => setOriginIata(e.target.value.toUpperCase())}
                  placeholder="MAD"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-teal)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.field_dest_iata')}
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={destIata}
                  onChange={(e) => setDestIata(e.target.value.toUpperCase())}
                  placeholder="SVQ"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-teal)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.field_flight_num')}
                </label>
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                  placeholder="IB3840"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-teal)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.terminal_label')}
                </label>
                <input
                  type="text"
                  value={terminal}
                  onChange={(e) => setTerminal(e.target.value)}
                  placeholder="T4"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-teal)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.gate')}
                </label>
                <input
                  type="text"
                  value={gate}
                  onChange={(e) => setGate(e.target.value.toUpperCase())}
                  placeholder="K22"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>
            </div>
          )}

          {/* Hotel specific fields */}
          {ticketType === 'hotel' && (
            <div
              style={{
                background: 'var(--color-accent-gold-soft)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-gold)', marginBottom: '2px', fontWeight: 700 }}>
                  {t('wallet.field_door_access_code')}
                </label>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="#1234*"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px', color: 'var(--color-accent-gold)', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-gold)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.field_wifi_ssid')}
                </label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="Hotel_Guest"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--color-accent-gold)', marginBottom: '2px', fontWeight: 600 }}>
                  {t('wallet.field_wifi_password')}
                </label>
                <input
                  type="text"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                  placeholder="welcome2026"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px' }}
                />
              </div>
            </div>
          )}

          {/* Times & Timezones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {(
              [
                {
                  key: 'start' as const,
                  label: t('wallet.field_start_departure_checkin'),
                  value: startTime,
                  setter: setStartTime,
                  tz: departureTz,
                  setTz: setDepartureTz,
                },
                {
                  key: 'end' as const,
                  label: t('wallet.field_end_arrival_checkout'),
                  value: endTime,
                  setter: setEndTime,
                  tz: arrivalTz,
                  setTz: setArrivalTz,
                },
              ]
            ).map((field) => {
              const datePart = getDatePart(field.value);
              const timePart = getTimePart(field.value);
              return (
                <div key={field.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>{field.label}</label>
                    {field.value && (
                      <button
                        type="button"
                        onClick={() => field.setter('')}
                        aria-label={field.key === 'start' ? t('wallet.clear_start_datetime_aria') : t('wallet.clear_end_datetime_aria')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          fontSize: '10px',
                          cursor: 'pointer',
                          padding: '0 2px',
                        }}
                      >
                        {t('common.clear')}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setActiveDateField(field.key)}
                      aria-label={field.key === 'start' ? t('wallet.select_start_date_aria') : t('wallet.select_end_date_aria')}
                      style={{
                        ...inputStyle,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: datePart ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      }}
                    >
                      <CalendarIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formatShortDate(datePart)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTimeField(field.key)}
                      aria-label={field.key === 'start' ? t('wallet.select_start_time_aria') : t('wallet.select_end_time_aria')}
                      style={{
                        ...inputStyle,
                        width: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                        color: timePart ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                      }}
                    >
                      <ClockIcon size={13} color="var(--color-accent-primary, #0F4C5C)" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        {timePart || '--:--'}
                      </span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={field.tz}
                    onChange={(e) => field.setTz(e.target.value)}
                    placeholder={t('wallet.placeholder_timezone')}
                    style={{ ...inputStyle, marginTop: '4px', padding: '4px 8px', fontSize: '10px' }}
                  />
                </div>
              );
            })}
          </div>

          {/* Seat/Room & Venue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{ticketType === 'hotel' ? t('wallet.field_room_num') : t('wallet.field_seat_coach')}</label>
              <input
                type="text"
                value={seatOrRoom}
                onChange={(e) => setSeatOrRoom(e.target.value)}
                placeholder={t('wallet.placeholder_seat_room')}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('wallet.field_location_venue_address')}</label>
              <input
                type="text"
                value={locationOrVenue}
                onChange={(e) => setLocationOrVenue(e.target.value)}
                placeholder={t('wallet.placeholder_address')}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Barcode Payload & Custom Format Select */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{t('wallet.field_barcode_payload')}</label>
              <input
                type="text"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder={t('wallet.placeholder_barcode')}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('wallet.field_format')}</label>
              <CustomSelect<'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix'>
                value={barcodeFormat}
                onChange={(newFmt) => setBarcodeFormat(newFmt)}
                options={barcodeFormatOptions}
                label={t('wallet.barcode_format_aria')}
              />
            </div>
          </div>

          {/* Price & Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{t('wallet.field_price_paid')}</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>{t('wallet.field_currency')}</label>
              <input
                type="text"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="EUR"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>{t('wallet.field_notes')}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('wallet.placeholder_notes')}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Visibility Custom Select */}
          <div>
            <label style={labelStyle}>{t('wallet.field_visibility')}</label>
            <CustomSelect<'trip' | 'private'>
              value={visibility}
              onChange={(newVis) => setVisibility(newVis)}
              options={visibilityOptions}
              label={t('wallet.visibility_aria')}
            />
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: '6px',
                color: 'var(--color-text-muted)',
                padding: '8px 16px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {t('wallet.cancel_upper')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: 'var(--color-accent-primary)',
                border: 'none',
                borderRadius: '6px',
                color: 'var(--color-btn-primary-text)',
                padding: '8px 20px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isSubmitting ? 'wait' : 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {isSubmitting ? t('wallet.saving_pass') : isEditing ? t('wallet.update_pass') : t('wallet.add_pass')}
            </button>
          </div>
        </form>
      </div>

      {activeDateField && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveDateField(null);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <PaladioSingleDatePicker
            title={activeDateField === 'start' ? t('wallet.start_departure_date') : t('wallet.end_arrival_date')}
            selectedDate={getDatePart(activeDateField === 'start' ? startTime : endTime)}
            onChange={(d) => {
              const current = activeDateField === 'start' ? startTime : endTime;
              const setter = activeDateField === 'start' ? setStartTime : setEndTime;
              if (!d) {
                setter('');
              } else {
                const existingTime = getTimePart(current) || '09:00';
                setter(`${d}T${existingTime}`);
              }
              setActiveDateField(null);
            }}
            onClose={() => setActiveDateField(null)}
          />
        </div>
      )}

      <CustomHourPickerModal
        isOpen={activeTimeField !== null}
        onClose={() => setActiveTimeField(null)}
        value={
          activeTimeField
            ? getTimePart(activeTimeField === 'start' ? startTime : endTime) || '09:00'
            : '09:00'
        }
        onChange={(newHHmm) => {
          if (!activeTimeField) return;
          const current = activeTimeField === 'start' ? startTime : endTime;
          const setter = activeTimeField === 'start' ? setStartTime : setEndTime;
          const existingDate = getDatePart(current) || getTodayLocalDate();
          setter(`${existingDate}T${newHHmm}`);
        }}
        anchorLabel={activeTimeField === 'start' ? t('wallet.start_time_label') : t('wallet.end_time_label')}
        zIndex={10050}
      />
    </div>
  );
}
