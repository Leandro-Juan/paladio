"use client";

import React, { useState } from 'react';
import { TripTicket, TripTicketCreateInput, TripTicketUpdateInput, TicketType, TicketStatus } from '@/hooks/useTripTickets';
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';

interface TicketFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TripTicketCreateInput | TripTicketUpdateInput) => Promise<void>;
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
  const isEditing = Boolean(initialTicket);

  const [ticketType, setTicketType] = useState<TicketType>(
    initialTicket?.ticket_type || defaultType
  );
  const [status, setStatus] = useState<TicketStatus>(initialTicket?.status || 'confirmed');
  const [title, setTitle] = useState(initialTicket?.title || '');
  const [provider, setProvider] = useState(initialTicket?.provider || '');
  const [bookingRef, setBookingRef] = useState(initialTicket?.booking_reference || '');
  const [startTime, setStartTime] = useState(
    initialTicket?.start_time ? initialTicket.start_time.slice(0, 16) : ''
  );
  const [endTime, setEndTime] = useState(
    initialTicket?.end_time ? initialTicket.end_time.slice(0, 16) : ''
  );
  const [departureTz, setDepartureTz] = useState(initialTicket?.departure_tz || '');
  const [arrivalTz, setArrivalTz] = useState(initialTicket?.arrival_tz || '');
  const [seatOrRoom, setSeatOrRoom] = useState(initialTicket?.seat_or_room || '');
  const [locationOrVenue, setLocationOrVenue] = useState(initialTicket?.location_or_venue || '');
  const [accessCode, setAccessCode] = useState(initialTicket?.access_code || '');
  const [barcodeValue, setBarcodeValue] = useState(initialTicket?.barcode_value || '');
  const [barcodeFormat, setBarcodeFormat] = useState(initialTicket?.barcode_format || 'qr');
  const [notes, setNotes] = useState(initialTicket?.notes || '');
  const [price, setPrice] = useState(initialTicket?.price != null ? String(initialTicket.price) : '');
  const [currency, setCurrency] = useState(initialTicket?.currency || 'EUR');

  // Specialized metadata fields
  const initialMeta = initialTicket?.metadata || {};
  const [originStation, setOriginStation] = useState((initialMeta.origin_station as string) || (initialMeta.origin as string) || '');
  const [destStation, setDestStation] = useState((initialMeta.destination_station as string) || (initialMeta.destination as string) || '');
  const [flightNumber, setFlightNumber] = useState((initialMeta.flight_number as string) || '');
  const [terminal, setTerminal] = useState((initialMeta.terminal as string) || '');
  const [gate, setGate] = useState((initialMeta.gate as string) || '');
  const [wifiSsid, setWifiSsid] = useState((initialMeta.wifi_ssid as string) || '');
  const [wifiPass, setWifiPass] = useState((initialMeta.wifi_password as string) || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Title is required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const metadata: Record<string, unknown> = { ...initialMeta };
    if (ticketType === 'flight') {
      if (originStation) metadata.origin_iata = originStation.toUpperCase();
      if (destStation) metadata.destination_iata = destStation.toUpperCase();
      if (flightNumber) metadata.flight_number = flightNumber.toUpperCase();
      if (terminal) metadata.terminal = terminal;
      if (gate) metadata.gate = gate;
    } else if (ticketType === 'hotel') {
      if (wifiSsid) metadata.wifi_ssid = wifiSsid;
      if (wifiPass) metadata.wifi_password = wifiPass;
      if (locationOrVenue) metadata.address = locationOrVenue;
    } else if (ticketType === 'transit') {
      if (originStation) metadata.origin_station = originStation;
      if (destStation) metadata.destination_station = destStation;
    }

    const payload: TripTicketCreateInput = {
      ticket_type: ticketType,
      status,
      title: title.trim(),
      provider: provider.trim() || undefined,
      booking_reference: bookingRef.trim() || undefined,
      start_time: startTime ? new Date(startTime).toISOString() : undefined,
      end_time: endTime ? new Date(endTime).toISOString() : undefined,
      departure_tz: departureTz.trim() || undefined,
      arrival_tz: arrivalTz.trim() || undefined,
      seat_or_room: seatOrRoom.trim() || undefined,
      location_or_venue: locationOrVenue.trim() || undefined,
      access_code: accessCode.trim() || undefined,
      barcode_value: barcodeValue.trim() || undefined,
      barcode_format: barcodeValue ? barcodeFormat : undefined,
      notes: notes.trim() || undefined,
      price: price ? parseFloat(price) : undefined,
      currency: currency.trim() || 'EUR',
      metadata,
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#0F172A',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.2rem', color: '#FFF' }}>
              {isEditing ? 'EDIT TICKET CREDENTIAL' : 'ADD TICKET TO WALLET'}
            </h3>
            <p className="font-mono text-muted text-xs" style={{ margin: '3px 0 0 0' }}>
              {'// VERIFIED WALLET PASS SPECIFICATION'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="font-mono"
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
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
          }}
        >
          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '6px',
                padding: '0.6rem 0.8rem',
                color: '#FCA5A5',
                fontSize: '12px',
              }}
            >
              ⚠ {errorMsg}
            </div>
          )}

          {/* Ticket Type Selector (only on create or freely switchable) */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '6px' }}>
              TICKET TYPE
            </label>
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
                      background: isSelected ? conf.accentBg : 'rgba(30, 41, 59, 0.5)',
                      border: `1px solid ${isSelected ? conf.accentBorder : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '6px',
                      color: isSelected ? conf.accentColor : '#94A3B8',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: isSelected ? 700 : 500,
                    }}
                  >
                    <span>{conf.icon}</span>
                    <span style={{ fontSize: '10px' }}>{conf.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                TITLE *
              </label>
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
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                STATUS
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              >
                <option value="planned">PLANNED</option>
                <option value="confirmed">CONFIRMED</option>
                <option value="used">USED</option>
                <option value="cancelled">CANCELLED</option>
              </select>
            </div>
          </div>

          {/* Provider & Booking Reference */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                PROVIDER / CARRIER / AIRLINE
              </label>
              <input
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. Iberia, Renfe, Booking.com"
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                BOOKING REFERENCE / PNR
              </label>
              <input
                type="text"
                value={bookingRef}
                onChange={(e) => setBookingRef(e.target.value)}
                placeholder="e.g. ABC123XYZ"
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {/* Specialized Type Fields: Flight */}
          {ticketType === 'flight' && (
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '8px',
                padding: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#7DD3FC', marginBottom: '2px' }}>
                  ORIGIN (IATA)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={originStation}
                  onChange={(e) => setOriginStation(e.target.value.toUpperCase())}
                  placeholder="MAD"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#7DD3FC', marginBottom: '2px' }}>
                  DEST (IATA)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  value={destStation}
                  onChange={(e) => setDestStation(e.target.value.toUpperCase())}
                  placeholder="SVQ"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#7DD3FC', marginBottom: '2px' }}>
                  FLIGHT #
                </label>
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder="IB3940"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#7DD3FC', marginBottom: '2px' }}>
                  TERMINAL
                </label>
                <input
                  type="text"
                  value={terminal}
                  onChange={(e) => setTerminal(e.target.value)}
                  placeholder="T4"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#7DD3FC', marginBottom: '2px' }}>
                  GATE
                </label>
                <input
                  type="text"
                  value={gate}
                  onChange={(e) => setGate(e.target.value)}
                  placeholder="K22"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Specialized Type Fields: Hotel */}
          {ticketType === 'hotel' && (
            <div
              style={{
                background: 'rgba(251, 191, 36, 0.05)',
                border: '1px solid rgba(251, 191, 36, 0.2)',
                borderRadius: '8px',
                padding: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#FDE68A', marginBottom: '2px' }}>
                  DOOR ACCESS CODE / PIN 🔑
                </label>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="1234#"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#FDE68A', marginBottom: '2px' }}>
                  WIFI SSID
                </label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="Hotel-Guest"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: '#FDE68A', marginBottom: '2px' }}>
                  WIFI PASSWORD
                </label>
                <input
                  type="text"
                  value={wifiPass}
                  onChange={(e) => setWifiPass(e.target.value)}
                  placeholder="welcome2026"
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '4px',
                    padding: '6px',
                    color: '#FFF',
                    fontSize: '11px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Times & Timezones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                START / DEPARTURE / CHECK-IN
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
              <input
                type="text"
                value={departureTz}
                onChange={(e) => setDepartureTz(e.target.value)}
                placeholder="Timezone (e.g. Europe/Madrid)"
                style={{
                  width: '100%',
                  marginTop: '4px',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  color: '#CBD5E1',
                  fontSize: '10px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                END / ARRIVAL / CHECK-OUT
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
              <input
                type="text"
                value={arrivalTz}
                onChange={(e) => setArrivalTz(e.target.value)}
                placeholder="Timezone (e.g. Europe/Madrid)"
                style={{
                  width: '100%',
                  marginTop: '4px',
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  color: '#CBD5E1',
                  fontSize: '10px',
                }}
              />
            </div>
          </div>

          {/* Seat/Room & Venue */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                {ticketType === 'hotel' ? 'ROOM #' : 'SEAT / COACH'}
              </label>
              <input
                type="text"
                value={seatOrRoom}
                onChange={(e) => setSeatOrRoom(e.target.value)}
                placeholder="e.g. 14A, Room 302"
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                LOCATION / VENUE / ADDRESS
              </label>
              <input
                type="text"
                value={locationOrVenue}
                onChange={(e) => setLocationOrVenue(e.target.value)}
                placeholder="e.g. Calle San Fernando 2, Sevilla"
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {/* Barcode Payload & Format */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                BARCODE / QR PAYLOAD (ENCRYPTED AT REST)
              </label>
              <input
                type="text"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="Paste ticket barcode or QR string..."
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                FORMAT
              </label>
              <select
                value={barcodeFormat || 'qr'}
                onChange={(e) =>
                  setBarcodeFormat(
                    e.target.value as 'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix'
                  )
                }
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              >
                <option value="qr">QR Code</option>
                <option value="aztec">Aztec</option>
                <option value="pdf417">PDF417</option>
                <option value="code128">Code 128</option>
              </select>
            </div>
          </div>

          {/* Price & Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                PRICE (PAID)
              </label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
                CURRENCY
              </label>
              <input
                type="text"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="EUR"
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  color: '#FFF',
                  fontSize: '12px',
                }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>
              NOTES & SPECIAL INSTRUCTIONS
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Present ID upon entry, non-refundable"
              style={{
                width: '100%',
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '8px 10px',
                color: '#FFF',
                fontSize: '12px',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Form Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '0.75rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="font-mono"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '8px 16px',
                color: '#CBD5E1',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="font-mono"
              style={{
                background: '#2563EB',
                border: '1px solid #3B82F6',
                borderRadius: '6px',
                padding: '8px 18px',
                color: '#FFFFFF',
                fontSize: '12px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontWeight: 700,
              }}
            >
              {isSubmitting ? 'SAVING...' : isEditing ? 'SAVE CHANGES' : 'CREATE TICKET'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
