"use client";

import React, { useState, useMemo } from 'react';
import { RouteItineraryData } from '@/types/domain';
import {
  TripTicket,
  TicketType,
  useTripTickets,
  TripTicketCreateInput,
  TripTicketUpdateInput,
  TravelDocumentDraft,
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
import { TICKET_TYPE_CONFIG } from '@/lib/wallet/ticketTypeConfig';
import { useTranslation } from '@/hooks/useTranslation';

interface TripWalletViewProps {
  tripId: string;
  itinerary?: RouteItineraryData | null;
}

export function TripWalletView({ tripId, itinerary }: TripWalletViewProps) {
  const { t } = useTranslation();
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
  const [scanDrafts, setScanDrafts] = useState<TravelDocumentDraft[]>([]);
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

  const handleEditTicket = (ticket: TripTicket) => {
    setEditingTicket(ticket);
    setFormDefaultType(ticket.ticket_type);
    setIsFormModalOpen(true);
  };

  const handleViewDetail = (ticket: TripTicket) => {
    setDetailTicket(ticket);
  };

  const handleAttachFile = (ticket: TripTicket) => {
    setEditingTicket(ticket);
    setFormDefaultType(ticket.ticket_type);
    setIsFormModalOpen(true);
  };

  const handleSaveForm = async (data: Record<string, unknown>) => {
    if (editingTicket) {
      await updateTicket(editingTicket.id, data as unknown as TripTicketUpdateInput);
    } else {
      await createTicket(data as unknown as TripTicketCreateInput);
    }
  };

  const handleConfirmScanDrafts = async (drafts: TravelDocumentDraft[], uploadId?: string) => {
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
    return tickets.filter((tk) => {
      // Category match
      if (category !== 'all' && tk.ticket_type !== category) {
        return false;
      }
      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = tk.title.toLowerCase().includes(query);
        const matchesRef = (tk.booking_reference || '').toLowerCase().includes(query);
        const matchesProvider = (tk.provider || '').toLowerCase().includes(query);
        const matchesVenue = (tk.location_or_venue || '').toLowerCase().includes(query);
        const matchesCode = (tk.barcode_value || '').toLowerCase().includes(query);
        return matchesTitle || matchesRef || matchesProvider || matchesVenue || matchesCode;
      }
      return true;
    });
  }, [tickets, category, searchQuery]);

  // Section grouping
  const flightTickets = useMemo(() => filteredTickets.filter((tk) => tk.ticket_type === 'flight'), [filteredTickets]);
  const hotelTickets = useMemo(() => filteredTickets.filter((tk) => tk.ticket_type === 'hotel'), [filteredTickets]);
  const attractionTickets = useMemo(() => filteredTickets.filter((tk) => tk.ticket_type === 'attraction'), [filteredTickets]);
  const transitTickets = useMemo(() => filteredTickets.filter((tk) => tk.ticket_type === 'transit'), [filteredTickets]);
  const otherTickets = useMemo(() => filteredTickets.filter((tk) => tk.ticket_type === 'other'), [filteredTickets]);

  const counts: Record<string, number> = useMemo(() => {
    return {
      all: tickets.length,
      flight: tickets.filter((tk) => tk.ticket_type === 'flight').length,
      hotel: tickets.filter((tk) => tk.ticket_type === 'hotel').length,
      attraction: tickets.filter((tk) => tk.ticket_type === 'attraction').length,
      transit: tickets.filter((tk) => tk.ticket_type === 'transit').length,
      other: tickets.filter((tk) => tk.ticket_type === 'other').length,
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
        <p className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
          {t('wallet.header_subtitle')}
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
            <h3 className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
              {t(TICKET_TYPE_CONFIG.flight.sectionTitleKey)}
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
              {t('wallet.add_flight_btn')}
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
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t('wallet.empty_flights')}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {flightTickets.map((tk) => (
                <FlightBoardingPassCard
                  key={tk.id}
                  ticket={tk}
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
            <h3 className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
              {t(TICKET_TYPE_CONFIG.hotel.sectionTitleKey)}
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
              {t('wallet.add_stay_btn')}
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
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t('wallet.empty_hotels')}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {hotelTickets.map((tk) => (
                <HotelAccessCard
                  key={tk.id}
                  ticket={tk}
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
            <h3 className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
              {t(TICKET_TYPE_CONFIG.attraction.sectionTitleKey)}
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
              {t('wallet.add_attraction_btn')}
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
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t('wallet.empty_attractions')}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {attractionTickets.map((tk) => (
                <AttractionPassCard
                  key={tk.id}
                  ticket={tk}
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
            <h3 className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
              {t(TICKET_TYPE_CONFIG.transit.sectionTitleKey)}
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
              {t('wallet.add_transit_btn')}
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
                fontFamily: 'var(--font-mono)',
              }}
            >
              {t('wallet.empty_transit')}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {transitTickets.map((tk) => (
                <TransitTicketCard
                  key={tk.id}
                  ticket={tk}
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
            <h3 className="font-mono text-xs" style={{ margin: 0, color: 'var(--color-text-primary, #1A2B32)', fontWeight: 700 }}>
              {t(TICKET_TYPE_CONFIG.other.sectionTitleKey)}
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
              {t('wallet.add_voucher_btn')}
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {otherTickets.map((tk) => (
              <GenericTicketCard
                key={tk.id}
                ticket={tk}
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
            title: t('wallet.day_pass_24h_title'),
            status: 'planned',
            provider: t('wallet.public_transport_authority'),
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
          title={t('wallet.empty_wallet_title')}
          description={t('wallet.empty_wallet_desc')}
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
                color: 'var(--color-text-on-accent, #FFFFFF)',
                cursor: 'pointer',
                fontWeight: 700,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {t('wallet.add_first_ticket_btn')}
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
