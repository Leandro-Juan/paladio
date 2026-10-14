"use client";

import React, { useState, useMemo } from 'react';
import { RouteItineraryData } from '@/app/vault/[id]/page';
import {
  TripTicket,
  TicketType,
  useTripTickets,
  TripTicketCreateInput,
  TripTicketUpdateInput,
  ScanDraft,
} from '@/hooks/useTripTickets';
import { FlightBoardingPassCard } from './cards/FlightBoardingPassCard';
import { HotelAccessCard } from './cards/HotelAccessCard';
import { AttractionPassCard } from './cards/AttractionPassCard';
import { TransitTicketCard } from './cards/TransitTicketCard';
import { GenericTicketCard } from './cards/GenericTicketCard';
import { WalletSummaryBar } from './WalletSummaryBar';
import { WalletFilterBar, FilterCategory } from './WalletFilterBar';
import { WalletDropzone } from './WalletDropzone';
import { WalletUpNext } from './WalletUpNext';
import { TransitAdvisorySection } from './TransitAdvisorySection';
import { TicketFormModal } from './modals/TicketFormModal';
import { TicketDetailModal } from './modals/TicketDetailModal';
import { ScanReviewModal } from './modals/ScanReviewModal';
import { EmptyState } from '@/components/EmptyState';

interface TripWalletViewProps {
  tripId: string;
  itinerary?: RouteItineraryData | null;
}

export function TripWalletView({ tripId, itinerary }: TripWalletViewProps) {
  const {
    tickets,
    isLoading,
    createTicket,
    updateTicket,
    deleteTicket,
    syncItinerary,
    scanFiles,
  } = useTripTickets(tripId);

  // Filter and search state
  const [category, setCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [scanDrafts, setScanDrafts] = useState<ScanDraft[]>([]);
  const [scanUploadId, setScanUploadId] = useState<string | undefined>();
  const [scanExcerpt, setScanExcerpt] = useState<string | undefined>();
  const [isScanReviewOpen, setIsScanReviewOpen] = useState(false);

  // Form modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<TripTicket | null>(null);
  const [formDefaultType, setFormDefaultType] = useState<TicketType>('flight');

  // Fullscreen detail modal state
  const [detailTicket, setDetailTicket] = useState<TripTicket | null>(null);

  // Handlers for scanning
  const handleFilesSelected = async (files: File[]) => {
    setIsScanning(true);
    try {
      const res = await scanFiles(files);
      if (res && res.drafts.length > 0) {
        setScanDrafts(res.drafts);
        setScanUploadId(res.upload_id || undefined);
        setScanExcerpt(res.raw_text_excerpt || undefined);
        setIsScanReviewOpen(true);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleRawTextPasted = async (text: string) => {
    setIsScanning(true);
    try {
      const res = await scanFiles(text);
      if (res && res.drafts.length > 0) {
        setScanDrafts(res.drafts);
        setScanUploadId(res.upload_id || undefined);
        setScanExcerpt(res.raw_text_excerpt || undefined);
        setIsScanReviewOpen(true);
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Handlers for ticket actions
  const handleOpenCreate = (type?: TicketType) => {
    setEditingTicket(null);
    setFormDefaultType(type || (category !== 'all' ? (category as TicketType) : 'flight'));
    setIsFormModalOpen(true);
  };

  const handleEditTicket = (t: TripTicket) => {
    setEditingTicket(t);
    setFormDefaultType(t.ticket_type);
    setIsFormModalOpen(true);
  };

  const handleViewDetail = (t: TripTicket) => {
    setDetailTicket(t);
  };

  const handleAttachFile = (t: TripTicket) => {
    setEditingTicket(t);
    setFormDefaultType(t.ticket_type);
    setIsFormModalOpen(true);
  };

  const handleSaveForm = async (data: Record<string, unknown>) => {
    if (editingTicket) {
      await updateTicket(editingTicket.id, data as unknown as TripTicketUpdateInput);
    } else {
      await createTicket(data as unknown as TripTicketCreateInput);
    }
  };

  const handleConfirmScanDrafts = async (drafts: ScanDraft[], uploadId?: string) => {
    for (const d of drafts) {
      const createPayload: TripTicketCreateInput = {
        ticket_type: d.ticket_type,
        title: d.title,
        status: 'confirmed',
        provider: d.provider || undefined,
        booking_reference: d.booking_reference || undefined,
        holder_name: d.holder_name || undefined,
        seat_or_room: d.seat_or_room || undefined,
        location_or_venue: d.location_or_venue || undefined,
        start_time: d.start_time || undefined,
        end_time: d.end_time || undefined,
        departure_tz: d.departure_tz || undefined,
        arrival_tz: d.arrival_tz || undefined,
        barcode_value: d.barcode_value || undefined,
        barcode_format: (d.barcode_format as 'qr' | 'aztec' | 'pdf417' | 'code128' | 'datamatrix') || undefined,
        access_code: d.access_code || undefined,
        metadata: {
          ...d.metadata,
          source_upload_id: uploadId,
        },
      };
      await createTicket(createPayload);
    }
  };

  // Filter & Search Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Category match
      if (category !== 'all' && t.ticket_type !== category) {
        return false;
      }
      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesRef = (t.booking_reference || '').toLowerCase().includes(query);
        const matchesProvider = (t.provider || '').toLowerCase().includes(query);
        const matchesVenue = (t.location_or_venue || '').toLowerCase().includes(query);
        const matchesCode = (t.barcode_value || '').toLowerCase().includes(query);
        return matchesTitle || matchesRef || matchesProvider || matchesVenue || matchesCode;
      }
      return true;
    });
  }, [tickets, category, searchQuery]);

  // Section grouping
  const flightTickets = useMemo(() => filteredTickets.filter((t) => t.ticket_type === 'flight'), [filteredTickets]);
  const hotelTickets = useMemo(() => filteredTickets.filter((t) => t.ticket_type === 'hotel'), [filteredTickets]);
  const attractionTickets = useMemo(() => filteredTickets.filter((t) => t.ticket_type === 'attraction'), [filteredTickets]);
  const transitTickets = useMemo(() => filteredTickets.filter((t) => t.ticket_type === 'transit'), [filteredTickets]);
  const otherTickets = useMemo(() => filteredTickets.filter((t) => t.ticket_type === 'other'), [filteredTickets]);

  const counts: Record<string, number> = useMemo(() => {
    return {
      all: tickets.length,
      flight: tickets.filter((t) => t.ticket_type === 'flight').length,
      hotel: tickets.filter((t) => t.ticket_type === 'hotel').length,
      attraction: tickets.filter((t) => t.ticket_type === 'attraction').length,
      transit: tickets.filter((t) => t.ticket_type === 'transit').length,
      other: tickets.filter((t) => t.ticket_type === 'other').length,
    };
  }, [tickets]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '0 0.5rem 3rem 0.5rem',
        maxWidth: '1280px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header Banner */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p className="font-mono text-muted text-xs" style={{ margin: 0, color: 'var(--color-text-muted, #64748B)' }}>
          {'// BOARDING PASSES, HOTEL PINS, ENTRY TICKETS & TRANSIT PASSES'}
        </p>
      </div>

      {/* Summary Bar */}
      <WalletSummaryBar
        tickets={tickets}
        onSyncItinerary={async () => {
          await syncItinerary();
        }}
        onOpenCreateModal={() => handleOpenCreate()}
      />

      {/* Up Next Hero */}
      <WalletUpNext tickets={tickets} onViewDetail={handleViewDetail} />

      {/* Scanning Dropzone */}
      <WalletDropzone
        onFilesSelected={handleFilesSelected}
        onRawTextPasted={handleRawTextPasted}
        isScanning={isScanning}
      />

      {/* Filter and Search Bar */}
      <WalletFilterBar
        currentCategory={category}
        onSelectCategory={setCategory}
        counts={counts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Loading Skeleton */}
      {isLoading && tickets.length === 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1rem',
          }}
        >
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                height: '180px',
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: '12px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      )}

      {/* SECTION: FLIGHT BOARDING PASSES */}
      {(category === 'all' || category === 'flight') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0, color: 'var(--color-text-muted, #64748B)' }}>
              {'// FLIGHT BOARDING PASSES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('flight')}
              className="font-mono"
              style={{
                fontSize: '11px',
                color: 'var(--color-accent-primary, #1E3A8A)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + ADD FLIGHT
            </button>
          </div>

          {flightTickets.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px dashed var(--color-border, #CBD5E1)',
                borderRadius: '8px',
                color: 'var(--color-text-muted, #64748B)',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              No flight passes in wallet. Drop a PDF boarding pass or add one manually.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {flightTickets.map((t) => (
                <FlightBoardingPassCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={deleteTicket}
                  onViewDetail={handleViewDetail}
                  onAttachFile={handleAttachFile}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: STAYS & DOOR CODES */}
      {(category === 'all' || category === 'hotel') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0, color: 'var(--color-text-muted, #64748B)' }}>
              {'// LODGING & ACCESS CODES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('hotel')}
              className="font-mono"
              style={{
                fontSize: '11px',
                color: 'var(--color-accent-primary, #1E3A8A)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + ADD STAY
            </button>
          </div>

          {hotelTickets.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px dashed var(--color-border, #CBD5E1)',
                borderRadius: '8px',
                color: 'var(--color-text-muted, #64748B)',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              No accommodations recorded. Add door codes, key PINs, or Wi-Fi passwords here.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {hotelTickets.map((t) => (
                <HotelAccessCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={deleteTicket}
                  onViewDetail={handleViewDetail}
                  onAttachFile={handleAttachFile}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: MUSEUMS & ATTRACTIONS */}
      {(category === 'all' || category === 'attraction') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0, color: 'var(--color-text-muted, #64748B)' }}>
              {'// MUSEUMS & ATTRACTION PASSES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('attraction')}
              className="font-mono"
              style={{
                fontSize: '11px',
                color: 'var(--color-accent-primary, #1E3A8A)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + ADD ATTRACTION PASS
            </button>
          </div>

          {attractionTickets.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px dashed var(--color-border, #CBD5E1)',
                borderRadius: '8px',
                color: 'var(--color-text-muted, #64748B)',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              No museum passes or entry tickets. Tickets synced from itinerary will appear here.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {attractionTickets.map((t) => (
                <AttractionPassCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={deleteTicket}
                  onViewDetail={handleViewDetail}
                  onAttachFile={handleAttachFile}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: TRANSIT & RAIL TICKETS */}
      {(category === 'all' || category === 'transit') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0, color: 'var(--color-text-muted, #64748B)' }}>
              {'// PUBLIC TRANSIT & RAIL TICKETS'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('transit')}
              className="font-mono"
              style={{
                fontSize: '11px',
                color: 'var(--color-accent-primary, #1E3A8A)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + ADD TRANSIT PASS
            </button>
          </div>

          {transitTickets.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'var(--color-surface-card, #F8FAFC)',
                border: '1px dashed var(--color-border, #CBD5E1)',
                borderRadius: '8px',
                color: 'var(--color-text-muted, #64748B)',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              No rail or transit passes. Renfe, metro passes and regional rail tickets appear here.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {transitTickets.map((t) => (
                <TransitTicketCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={deleteTicket}
                  onViewDetail={handleViewDetail}
                  onAttachFile={handleAttachFile}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: OTHER VOUCHERS */}
      {(category === 'all' || category === 'other') && otherTickets.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0, color: 'var(--color-text-muted, #64748B)' }}>
              {'// GENERAL VOUCHERS & CREDENTIALS'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('other')}
              className="font-mono"
              style={{
                fontSize: '11px',
                color: 'var(--color-accent-primary, #1E3A8A)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              + ADD VOUCHER
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {otherTickets.map((t) => (
              <GenericTicketCard
                key={t.id}
                ticket={t}
                onEdit={handleEditTicket}
                onDelete={deleteTicket}
                onViewDetail={handleViewDetail}
                onAttachFile={handleAttachFile}
              />
            ))}
          </div>
        </section>
      )}

      {/* Transit Pass Cost Solver Advisory Component */}
      <TransitAdvisorySection
        itinerary={itinerary}
        onAddDayPass={(rec) => {
          createTicket({
            ticket_type: 'transit',
            title: '24h Transit Travel Day Pass',
            status: 'planned',
            provider: 'Public Transport Authority',
            price: rec.pass_price_eur != null ? rec.pass_price_eur : undefined,
            currency: 'EUR',
            notes: rec.message || undefined,
          });
        }}
      />

      {/* Global Empty State */}
      {tickets.length === 0 && !isLoading && (
        <EmptyState
          type="no-tickets"
          title="YOUR TRIP WALLET IS EMPTY"
          description="Drop documents above, sync from itinerary, or create credentials manually."
          action={
            <button
              type="button"
              onClick={() => handleOpenCreate()}
              style={{
                background: 'var(--color-accent-primary)',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 18px',
                fontSize: '12px',
                color: 'var(--color-text-on-accent)',
                cursor: 'pointer',
                fontWeight: 700,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              + ADD FIRST TICKET
            </button>
          }
        />
      )}

      {/* Modals */}
      <TicketFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleSaveForm}
        initialTicket={editingTicket}
        defaultType={formDefaultType}
      />

      <TicketDetailModal
        isOpen={Boolean(detailTicket)}
        onClose={() => setDetailTicket(null)}
        ticket={detailTicket}
        tickets={filteredTickets}
        onSelectTicket={setDetailTicket}
      />

      <ScanReviewModal
        isOpen={isScanReviewOpen}
        onClose={() => setIsScanReviewOpen(false)}
        drafts={scanDrafts}
        uploadId={scanUploadId}
        rawTextExcerpt={scanExcerpt}
        onConfirmDrafts={handleConfirmScanDrafts}
      />
    </div>
  );
}
