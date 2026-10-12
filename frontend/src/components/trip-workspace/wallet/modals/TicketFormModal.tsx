"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useIsMounted } from '@/hooks/useIsMounted';
import { TripTicket, TicketType, TicketStatus } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG, STATUS_BADGE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { CustomSelect } from '../parts/CustomSelect';
import { AlertTriangleIcon, CloseIcon } from '@/components/icons';

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

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <TicketFormDialog
      key={initialTicket ? initialTicket.id : `new-${defaultType}`}
      onClose={onClose}
      onSubmit={onSubmit}
      initialTicket={initialTicket}
      defaultType={defaultType}
    />,
    document.body
  );
}

function TicketFormDialog({
  onClose,
  onSubmit,
  initialTicket,
  defaultType = 'flight',
}: {
  onClose: () => void;
  onSubmit: (formData: Record<string, unknown>) => Promise<void>;
  initialTicket?: TripTicket | null;
  defaultType?: TicketType;
}) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Ticket title is required.');
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
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = (Object.keys(STATUS_BADGE_CONFIG) as TicketStatus[]).map((st) => ({
    value: st,
    label: STATUS_BADGE_CONFIG[st].label,
  }));

  const barcodeFormatOptions = [
    { value: 'qr' as const, label: 'QR Code' },
    { value: 'aztec' as const, label: 'Aztec' },
    { value: 'pdf417' as const, label: 'PDF417' },
    { value: 'code128' as const, label: 'Code 128' },
    { value: 'datamatrix' as const, label: 'Data Matrix' },
  ];

  const visibilityOptions = [
    { value: 'trip' as const, label: 'Shared with Trip Members' },
    { value: 'private' as const, label: 'Private (Visible only to you)' },
  ];

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#FFFFFF',
    border: '1px solid var(--color-border, #CBD5E1)',
    borderRadius: '6px',
    padding: '8px 10px',
    color: 'var(--color-text-primary, #0F172A)',
    fontSize: '12px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    color: 'var(--color-text-muted, #64748B)',
    marginBottom: '4px',
    fontWeight: 600,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
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
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border, #CBD5E1)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border, #E2E8F0)',
            background: 'var(--color-surface-card, #F8FAFC)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-text-primary, #0F172A)' }}>
              {isEditing ? 'EDIT TICKET CREDENTIAL' : 'ADD TICKET TO WALLET'}
            </h3>
            <p className="font-mono text-muted text-xs" style={{ margin: '3px 0 0 0', color: 'var(--color-text-muted, #64748B)' }}>
              {'// VERIFIED WALLET PASS SPECIFICATION'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-border, #CBD5E1)',
              borderRadius: '6px',
              color: 'var(--color-text-muted, #64748B)',
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CloseIcon size={12} color="var(--color-text-muted, #64748B)" />
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
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                color: '#DC2626',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <AlertTriangleIcon size={14} color="#DC2626" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Ticket Type Selector */}
          <div>
            <label style={labelStyle}>TICKET TYPE</label>
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
                      background: isSelected ? conf.accentBg : 'var(--color-surface-card, #F8FAFC)',
                      border: `1px solid ${isSelected ? conf.accentBorder : 'var(--color-border, #CBD5E1)'}`,
                      borderRadius: '6px',
                      color: isSelected ? conf.accentColor : 'var(--color-text-muted, #64748B)',
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
                    <span>{conf.renderIcon({ size: 16, color: isSelected ? conf.accentColor : 'var(--color-text-muted, #64748B)' })}</span>
                    <span style={{ fontSize: '10px' }}>{conf.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>TITLE *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  ticketType === 'flight'
                    ? 'e.g. Madrid → Seville Flight'
                    : ticketType === 'hotel'
                    ? 'e.g. Hotel Alfonso XIII'
                    : ticketType === 'attraction'
                    ? 'e.g. Prado Museum General Pass'
                    : 'Ticket Title'
                }
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>STATUS</label>
              <CustomSelect<TicketStatus>
                value={status}
                onChange={(newSt) => setStatus(newSt)}
                options={statusOptions}
                label="Ticket Status"
              />
            </div>
          </div>

          {/* Provider, Booking Reference & Holder Name */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div>
              <label style={labelStyle}>PROVIDER / CARRIER</label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. Iberia, Renfe"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>BOOKING REF / PNR</label>
              <input
                type="text"
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123XYZ"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>HOLDER NAME</label>
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder="e.g. John Doe"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Flight specific fields */}
          {ticketType === 'flight' && (
            <div
              style={{
                background: '#F0F9FF',
                border: '1px solid #BAE6FD',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#0369A1', marginBottom: '2px', fontWeight: 600 }}>
                  ORIGIN (IATA)
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
                <label style={{ display: 'block', fontSize: '10px', color: '#0369A1', marginBottom: '2px', fontWeight: 600 }}>
                  DEST (IATA)
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
                <label style={{ display: 'block', fontSize: '10px', color: '#0369A1', marginBottom: '2px', fontWeight: 600 }}>
                  FLIGHT #
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
                <label style={{ display: 'block', fontSize: '10px', color: '#0369A1', marginBottom: '2px', fontWeight: 600 }}>
                  TERMINAL
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
                <label style={{ display: 'block', fontSize: '10px', color: '#0369A1', marginBottom: '2px', fontWeight: 600 }}>
                  GATE
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
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                padding: '0.85rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#B45309', marginBottom: '2px', fontWeight: 700 }}>
                  DOOR ACCESS CODE / PIN
                </label>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="#1234*"
                  style={{ ...inputStyle, padding: '6px', fontSize: '11px', color: '#B45309', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#B45309', marginBottom: '2px', fontWeight: 600 }}>
                  WIFI SSID
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
                <label style={{ display: 'block', fontSize: '10px', color: '#B45309', marginBottom: '2px', fontWeight: 600 }}>
                  WIFI PASSWORD
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
            <div>
              <label style={labelStyle}>START / DEPARTURE / CHECK-IN</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={inputStyle}
              />
              <input
                type="text"
                value={departureTz}
                onChange={(e) => setDepartureTz(e.target.value)}
                placeholder="Timezone (e.g. Europe/Madrid)"
                style={{ ...inputStyle, marginTop: '4px', padding: '4px 8px', fontSize: '10px' }}
              />
            </div>

            <div>
              <label style={labelStyle}>END / ARRIVAL / CHECK-OUT</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={inputStyle}
              />
              <input
                type="text"
                value={arrivalTz}
                onChange={(e) => setArrivalTz(e.target.value)}
                placeholder="Timezone (e.g. Europe/Madrid)"
                style={{ ...inputStyle, marginTop: '4px', padding: '4px 8px', fontSize: '10px' }}
              />
            </div>
          </div>

          {/* Seat/Room & Venue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>{ticketType === 'hotel' ? 'ROOM #' : 'SEAT / COACH'}</label>
              <input
                type="text"
                value={seatOrRoom}
                onChange={(e) => setSeatOrRoom(e.target.value)}
                placeholder="e.g. 14A, Room 302"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>LOCATION / VENUE / ADDRESS</label>
              <input
                type="text"
                value={locationOrVenue}
                onChange={(e) => setLocationOrVenue(e.target.value)}
                placeholder="e.g. Calle San Fernando 2, Sevilla"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Barcode Payload & Custom Format Select */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>BARCODE / QR PAYLOAD (ENCRYPTED AT REST)</label>
              <input
                type="text"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="Paste ticket barcode or QR string..."
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>FORMAT</label>
              <CustomSelect<'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix'>
                value={barcodeFormat}
                onChange={(newFmt) => setBarcodeFormat(newFmt)}
                options={barcodeFormatOptions}
                label="Barcode format"
              />
            </div>
          </div>

          {/* Price & Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>PRICE (PAID)</label>
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
              <label style={labelStyle}>CURRENCY</label>
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
            <label style={labelStyle}>NOTES & SPECIAL INSTRUCTIONS</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Present ID upon entry, non-refundable"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Visibility Custom Select */}
          <div>
            <label style={labelStyle}>VISIBILITY</label>
            <CustomSelect<'trip' | 'private'>
              value={visibility}
              onChange={(newVis) => setVisibility(newVis)}
              options={visibilityOptions}
              label="Visibility"
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
              borderTop: '1px solid var(--color-border, #E2E8F0)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: '6px',
                color: 'var(--color-text-muted, #64748B)',
                padding: '8px 16px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: 'var(--color-accent-primary, #1E3A8A)',
                border: 'none',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '8px 20px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isSubmitting ? 'wait' : 'pointer',
                boxShadow: '0 2px 6px rgba(30, 58, 138, 0.25)',
              }}
            >
              {isSubmitting ? 'SAVING PASS…' : isEditing ? 'UPDATE PASS' : 'ADD PASS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
