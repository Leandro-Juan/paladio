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
    setIsFormModalOpen(true);
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (confirm('Are you sure you want to delete this ticket? Attached documents will also be removed.')) {
      await deleteTicket(ticketId);
    }
  };

  const handleViewDetail = (t: TripTicket) => {
    setDetailTicket(t);
  };

  const handleSaveForm = async (payload: TripTicketCreateInput | TripTicketUpdateInput) => {
    if (editingTicket) {
      await updateTicket(editingTicket.id, payload as TripTicketUpdateInput);
    } else {
      await createTicket(payload as TripTicketCreateInput);
    }
  };

  const handleConfirmScanDrafts = async (drafts: TripTicketCreateInput[]) => {
    for (const draft of drafts) {
      await createTicket(draft);
    }
  };

  // Filter tickets by category and search term
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (category !== 'all' && t.ticket_type !== category) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(q);
        const providerMatch = t.provider?.toLowerCase().includes(q) || false;
        const refMatch = t.booking_reference?.toLowerCase().includes(q) || false;
        const locationMatch = t.location_or_venue?.toLowerCase().includes(q) || false;
        const notesMatch = t.notes?.toLowerCase().includes(q) || false;
        if (!titleMatch && !providerMatch && !refMatch && !locationMatch && !notesMatch) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, category, searchQuery]);

  // Group filtered tickets by type
  const flights = filteredTickets.filter((t) => t.ticket_type === 'flight');
  const hotels = filteredTickets.filter((t) => t.ticket_type === 'hotel');
  const attractions = filteredTickets.filter((t) => t.ticket_type === 'attraction');
  const transits = filteredTickets.filter((t) => t.ticket_type === 'transit');
  const others = filteredTickets.filter((t) => t.ticket_type === 'other');

  // Category counts
  const counts: Record<FilterCategory, number> = useMemo(
    () => ({
      all: tickets.filter((t) => t.status !== 'cancelled').length,
      flight: tickets.filter((t) => t.ticket_type === 'flight' && t.status !== 'cancelled').length,
      hotel: tickets.filter((t) => t.ticket_type === 'hotel' && t.status !== 'cancelled').length,
      attraction: tickets.filter((t) => t.ticket_type === 'attraction' && t.status !== 'cancelled').length,
      transit: tickets.filter((t) => t.ticket_type === 'transit' && t.status !== 'cancelled').length,
      other: tickets.filter((t) => t.ticket_type === 'other' && t.status !== 'cancelled').length,
    }),
    [tickets]
  );

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1100px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      {/* View Header */}
      <div>
        <h2 className="font-display" style={{ margin: 0, fontSize: '1.4rem', color: '#FFF' }}>
          TRIP WALLET & DIGITAL PASSES
        </h2>
        <p className="font-mono text-muted text-sm mt-1">
          {'// BOARDING PASSES, HOTEL PINS, ENTRY TICKETS & TRANSIT PASSES'}
        </p>
      </div>

      {/* Summary Bar */}
      <WalletSummaryBar
        tickets={tickets}
        onSyncItinerary={syncItinerary}
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
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
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
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0 }}>
              {'// FLIGHT BOARDING PASSES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('flight')}
              style={{
                background: 'none',
                border: 'none',
                color: '#38BDF8',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + ADD FLIGHT
            </button>
          </div>

          {flights.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            >
              [ NO FLIGHT PASSES RECORDED ]
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {flights.map((t) => (
                <FlightBoardingPassCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={handleDeleteTicket}
                  onViewDetail={handleViewDetail}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: STAYS & ACCESS CODES */}
      {(category === 'all' || category === 'hotel') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0 }}>
              {'// STAYS & ACCESS CODES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('hotel')}
              style={{
                background: 'none',
                border: 'none',
                color: '#FBBF24',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + ADD STAY
            </button>
          </div>

          {hotels.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            >
              [ NO HOTEL STAYS OR DOOR CODES RECORDED ]
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {hotels.map((t) => (
                <HotelAccessCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={handleDeleteTicket}
                  onViewDetail={handleViewDetail}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: ATTRACTION & MUSEUM PASSES */}
      {(category === 'all' || category === 'attraction') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0 }}>
              {'// ATTRACTIONS & MUSEUM PASSES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('attraction')}
              style={{
                background: 'none',
                border: 'none',
                color: '#34D399',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + ADD PASS
            </button>
          </div>

          {attractions.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            >
              [ NO ATTRACTION PASSES RECORDED ]
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {attractions.map((t) => (
                <AttractionPassCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={handleDeleteTicket}
                  onViewDetail={handleViewDetail}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION: TRANSIT & PUBLIC PASSES */}
      {(category === 'all' || category === 'transit') && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0 }}>
              {'// RAIL, COACH & PUBLIC TRANSIT PASSES'}
            </h3>
            <button
              type="button"
              onClick={() => handleOpenCreate('transit')}
              style={{
                background: 'none',
                border: 'none',
                color: '#A78BFA',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + ADD TRANSIT TICKET
            </button>
          </div>

          {transits.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            >
              [ NO TRANSIT PASSES RECORDED ]
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {transits.map((t) => (
                <TransitTicketCard
                  key={t.id}
                  ticket={t}
                  onEdit={handleEditTicket}
                  onDelete={handleDeleteTicket}
                  onViewDetail={handleViewDetail}
                />
              ))}
            </div>
          )}

          {/* Solver Transit Advisory Section */}
          <TransitAdvisorySection
            itinerary={itinerary}
            onAddDayPass={(rec) => {
              createTicket({
                ticket_type: 'transit',
                status: 'confirmed',
                title: rec.pass_name || '24h Public Transit Pass',
                price: rec.pass_price_eur || 0,
                currency: 'EUR',
                notes: rec.message || 'Purchased 24h tourist public transit pass',
                metadata: { is_pass: true },
              });
            }}
          />
        </section>
      )}

      {/* SECTION: OTHER VOUCHERS */}
      {(category === 'all' || category === 'other') && others.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="font-mono text-muted text-xs" style={{ margin: 0 }}>
              {'// OTHER CONFIRMATIONS & VOUCHERS'}
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {others.map((t) => (
              <GenericTicketCard
                key={t.id}
                ticket={t}
                onEdit={handleEditTicket}
                onDelete={handleDeleteTicket}
                onViewDetail={handleViewDetail}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty State when zero tickets exist across entire wallet */}
      {tickets.length === 0 && !isLoading && (
        <div
          style={{
            padding: '3rem 1.5rem',
            textAlign: 'center',
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: '32px' }}>🎫</span>
          <div>
            <h3 className="font-display" style={{ margin: 0, fontSize: '1.25rem', color: '#FFF' }}>
              YOUR TRIP WALLET IS EMPTY
            </h3>
            <p className="font-mono text-muted text-xs mt-1">
              Drop documents above, sync from itinerary, or create credentials manually.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenCreate()}
            style={{
              background: '#2563EB',
              border: '1px solid #3B82F6',
              borderRadius: '6px',
              padding: '8px 18px',
              fontSize: '12px',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            + ADD FIRST TICKET
          </button>
        </div>
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
