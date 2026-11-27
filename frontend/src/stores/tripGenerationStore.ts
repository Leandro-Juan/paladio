import { create } from 'zustand';
import {
  acknowledgeTripGenerationJobApi,
  apiFetch,
  cancelTripGenerationJobApi,
  getApiBaseUrl,
  listTripGenerationJobsApi,
  resumeTripGenerationJobApi,
  startTripGenerationApi,
  TripGenerationInterruptPayload,
  TripGenerationJob,
} from '@/utils/api';
import { resolveAirportIata } from '@/utils/airportResolver';
import { notify } from '@/utils/notify';
import { translate } from '@/stores/localeStore';
import { useTripDraftStore } from '@/stores/tripDraftStore';
import { TravelDocumentDraft } from '@/hooks/useTripTickets';
import { SelectedParticipant } from '@/components/trip-creation/ParticipantsManager';

const NOTIFIED_STORAGE_KEY = 'paladio_notified_trip_jobs';

function loadNotifiedKeys(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(NOTIFIED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveNotifiedKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadNotifiedKeys();
    current[key] = true;
    // Keep bounded
    const keys = Object.keys(current);
    if (keys.length > 100) {
      for (const oldKey of keys.slice(0, keys.length - 100)) {
        delete current[oldKey];
      }
    }
    window.sessionStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function getTripGenerationStageMessage(
  stage: string | undefined,
  stageMessage: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const s = (stage || '').toUpperCase();
  if (s === 'SAVING_TRIP') return t('engine.thinking_saving_trip');
  if (s === 'RESUMING') return t('engine.thinking_resuming');
  if (s === 'CREATING_BLANK') return t('engine.creating_blank_workspace');
  if (s === 'EVALUATING_ROUTES') return t('engine.thinking_optimizing');
  if (s === 'EXTRACTING_CONSTRAINTS') return t('engine.thinking_constraints');
  if (s === 'SCRAPING_DYNAMIC_DATA') return t('engine.thinking_scraping');
  if (s === 'ANALYZING_PROMPT') return t('engine.thinking_analyzing');
  if (s === 'GUARDRAILS_PASSED') return t('engine.thinking_guardrails_passed');
  if (s === 'EVALUATING_GUARDRAILS') return t('engine.thinking_guardrails');
  if (s === 'VERIFYING_CONSTRAINTS' || s === 'VERIFICATION_COMPLETED') {
    return t('engine.thinking_reviewing');
  }
  if (s === 'PARSING_TICKETS') return t('engine.thinking_booking_anchors');
  if (s === 'STARTING_INFERENCE') return t('engine.thinking_initializing');
  if (stageMessage && stageMessage.trim().length > 3) {
    return stageMessage.trim();
  }
  return t('engine.thinking_default');
}

export interface BlankTripStartParams {
  destination: string;
  origin: string;
  originIata: string;
  destIata: string;
  startDate: string;
  endDate: string;
  departureHour: string;
  arrivalHour: string;
  budgetUsd: number | '';
  currency: string;
  tripTitle: string;
  tripDescription: string;
  hotelArea: string;
  hotelAddress?: string;
  hotelLat?: number;
  hotelLng?: number;
  hotelCheckInDate: string;
  hotelCheckOutDate: string;
  hotelCheckInHour: string;
  hotelCheckOutHour: string;
  participants: SelectedParticipant[];
  customPhotoUrl: string;
  isPhotoRemoved: boolean;
  scannedDocuments: TravelDocumentDraft[];
}

export interface TripGenerationServerEvent {
  event: string;
  status?: string;
  job_id?: string;
  thread_id?: string;
  user_id?: string | null;
  trip_id?: string;
  destination?: string;
  title?: string;
  stage?: string;
  message?: string;
  interrupt_type?: string;
  interrupt_payload?: TripGenerationInterruptPayload;
  guardrail_errors?: string[];
  error_message?: string;
  data?: unknown;
}

interface TripGenerationStoreState {
  jobs: Record<string, TripGenerationJob>;
  watchingJobId: string | null;
  activeDraftJobId: string | null;
  hydrated: boolean;
  notifiedKeys: Record<string, boolean>;

  setWatchingJobId: (jobId: string | null) => void;
  hydrateJobs: () => Promise<void>;
  startPersonalizedJob: (
    prompt: string,
    extras: Record<string, unknown>
  ) => Promise<TripGenerationJob>;
  startBlankJob: (
    params: BlankTripStartParams
  ) => Promise<{ jobId: string; tripId?: string; error?: string }>;
  resumeJob: (jobId: string, answers: Record<string, unknown>) => Promise<TripGenerationJob | null>;
  cancelJob: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => Promise<void>;
  handleServerEvent: (payload: TripGenerationServerEvent) => void;
  resetForUser: () => void;
}

function dispatchTripCreatedEvent(detail: {
  trip_id: string;
  destination: string;
  title?: string | null;
}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('paladio:trip_created', { detail }));
  }
}

export const useTripGenerationStore = create<TripGenerationStoreState>((set, get) => {
  const markNotified = (key: string): boolean => {
    if (get().notifiedKeys[key]) return false;
    const disk = loadNotifiedKeys();
    if (disk[key]) {
      set((s) => ({ notifiedKeys: { ...s.notifiedKeys, [key]: true } }));
      return false;
    }
    saveNotifiedKey(key);
    set((s) => ({ notifiedKeys: { ...s.notifiedKeys, [key]: true } }));
    return true;
  };

  const handleTerminalCompletion = (
    job: TripGenerationJob,
    options?: { acknowledgeOnServer?: boolean }
  ) => {
    const tripId = job.trip_id;
    if (!tripId) return;

    const dedupeKey = `completed:${job.id}`;
    const shouldNotify = markNotified(dedupeKey);

    if (get().activeDraftJobId === job.id) {
      useTripDraftStore.getState().resetDraft();
      set({ activeDraftJobId: null });
    }

    dispatchTripCreatedEvent({
      trip_id: tripId,
      destination: job.destination,
      title: job.title,
    });

    if (shouldNotify) {
      const displayTitle = job.title?.trim() || job.destination;
      notify.success(
        translate('notifications.trip_ready_title'),
        translate('notifications.trip_ready_message', { title: displayTitle }),
        {
          actionLink: `/trips/${tripId}`,
          actionLabel: translate('notifications.open_trip'),
          durationMs: 15000,
        }
      );
    }

    if (options?.acknowledgeOnServer && job.kind !== 'blank') {
      void acknowledgeTripGenerationJobApi(job.id).catch(() => {});
    }
  };

  return {
    jobs: {},
    watchingJobId: null,
    activeDraftJobId: null,
    hydrated: false,
    notifiedKeys: loadNotifiedKeys(),

    setWatchingJobId: (jobId) => set({ watchingJobId: jobId }),

    hydrateJobs: async () => {
      try {
        const list = await listTripGenerationJobsApi();
        const nextJobs: Record<string, TripGenerationJob> = {};

        // Keep any in-progress client-only blank jobs
        for (const [jid, existing] of Object.entries(get().jobs)) {
          if (existing.kind === 'blank' && existing.status === 'running') {
            nextJobs[jid] = existing;
          }
        }

        for (const job of list) {
          const normalized: TripGenerationJob = { ...job, kind: 'personalized' };
          if (normalized.status === 'running' || normalized.status === 'awaiting_input') {
            nextJobs[normalized.id] = normalized;
          } else if (normalized.status === 'aborted') {
            nextJobs[normalized.id] = normalized;
          } else if (normalized.status === 'completed' && normalized.trip_id) {
            handleTerminalCompletion(normalized, { acknowledgeOnServer: true });
            if (get().watchingJobId === normalized.id) {
              nextJobs[normalized.id] = normalized;
            }
          } else if (normalized.status === 'failed') {
            if (get().watchingJobId === normalized.id) {
              nextJobs[normalized.id] = normalized;
            } else {
              const dedupeKey = `failed:${normalized.id}`;
              if (markNotified(dedupeKey)) {
                notify.error(
                  translate('notifications.trip_generation_failed_title'),
                  translate('notifications.trip_generation_failed_message', {
                    destination: normalized.destination,
                    error: normalized.error_message || translate('engine.unexpected_error'),
                  }),
                  {
                    actionLink: '/engine',
                    actionLabel: translate('engine.back_to_trip_editor'),
                    durationMs: 12000,
                  }
                );
              }
              void acknowledgeTripGenerationJobApi(normalized.id).catch(() => {});
            }
          }
        }

        set({ jobs: nextJobs, hydrated: true });
      } catch (err) {
        console.debug('Failed to hydrate trip generation jobs:', err);
      }
    },

    startPersonalizedJob: async (prompt, extras) => {
      const payload = {
        prompt,
        ...extras,
        auto_verify: extras.auto_verify ?? true,
      };
      const job = await startTripGenerationApi(payload);
      const normalized: TripGenerationJob = { ...job, kind: 'personalized' };
      set((state) => ({
        jobs: { ...state.jobs, [normalized.id]: normalized },
        watchingJobId: normalized.id,
        activeDraftJobId: normalized.id,
      }));
      return normalized;
    },

    startBlankJob: async (params) => {
      const jobId = `blank_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();
      const destClean = params.destination.trim();
      const titleClean =
        params.tripTitle.trim() ||
        translate('engine.trip_to_destination', { destination: destClean });

      const initialJob: TripGenerationJob = {
        id: jobId,
        thread_id: jobId,
        destination: destClean,
        title: titleClean,
        status: 'running',
        stage: 'CREATING_BLANK',
        stage_message: translate('engine.creating_blank_workspace'),
        prompt: '',
        acknowledged: false,
        created_at: nowIso,
        updated_at: nowIso,
        kind: 'blank',
      };

      set((state) => ({
        jobs: { ...state.jobs, [jobId]: initialJob },
        watchingJobId: jobId,
        activeDraftJobId: jobId,
      }));

      try {
        const parseLocalIsoDate = (iso: string): Date => {
          const [y, m, d] = iso.split('T')[0].split('-').map(Number);
          return new Date(y, (m || 1) - 1, d || 1);
        };
        const formatLocalIsoDate = (d: Date): string => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const parseHhmm = (val: string | undefined, fallbackMins: number): number => {
          if (!val) return fallbackMins;
          const parts = val.trim().split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1] || '0', 10);
          if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
            return fallbackMins;
          }
          return h * 60 + m;
        };
        const fmtHhmm = (mins: number): string => {
          const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
          return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
        };

        const start = parseLocalIsoDate(params.startDate);
        const end = parseLocalIsoDate(params.endDate);
        const tripDurationDays = Math.max(
          1,
          Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        );

        const rawCheckIn = params.hotelCheckInDate || params.startDate;
        const rawCheckOut = params.hotelCheckOutDate || params.endDate;
        const effectiveCheckInDate =
          rawCheckIn < params.startDate
            ? params.startDate
            : rawCheckIn > params.endDate
              ? params.endDate
              : rawCheckIn;
        const effectiveCheckOutDate =
          rawCheckOut > params.endDate
            ? params.endDate
            : rawCheckOut < effectiveCheckInDate
              ? effectiveCheckInDate
              : rawCheckOut;

        const arrMins = parseHhmm(params.departureHour, 9 * 60);
        const depMins = parseHhmm(params.arrivalHour, 20 * 60);
        const cinMins = parseHhmm(params.hotelCheckInHour, 15 * 60);
        const coutMins = parseHhmm(params.hotelCheckOutHour, 11 * 60);

        let airportPoi: {
          id: string;
          name: string;
          city: string;
          category: string;
          duration_mins: number;
          cost_eur: number;
          location: { latitude: number; longitude: number };
        } | null = null;
        const userSpecifiedIata = params.destIata.trim().toUpperCase();
        let effectiveIata = userSpecifiedIata;
        const baseUrl = getApiBaseUrl();
        let cityFallbackLat = 0;
        let cityFallbackLng = 0;

        try {
          const apRes = await fetch(
            `${baseUrl}/locations/resolve-airport?city=${encodeURIComponent(destClean)}`
          );
          if (apRes.ok) {
            const apData = await apRes.json();
            if (typeof apData?.latitude === 'number' && typeof apData?.longitude === 'number') {
              cityFallbackLat = apData.latitude;
              cityFallbackLng = apData.longitude;
            }
            if (!effectiveIata && apData?.iata) {
              effectiveIata = apData.iata;
            }
            if (
              apData?.iata &&
              (!userSpecifiedIata || userSpecifiedIata === String(apData.iata).toUpperCase())
            ) {
              airportPoi = {
                id: `airport-${String(apData.iata).toLowerCase()}`,
                name:
                  apData.name ||
                  translate('engine.airport_suffix_name', { name: apData.iata }),
                city: apData.city || destClean,
                category: 'AIRPORT',
                duration_mins: 120,
                cost_eur: 0,
                location: {
                  latitude: typeof apData.latitude === 'number' ? apData.latitude : 0,
                  longitude: typeof apData.longitude === 'number' ? apData.longitude : 0,
                },
              };
            }
          }
        } catch {
          // fallback
        }
        if (!airportPoi && !effectiveIata) {
          effectiveIata = (await resolveAirportIata(destClean)) || '';
        }
        if (!airportPoi) {
          airportPoi = {
            id: effectiveIata ? `airport-${effectiveIata.toLowerCase()}` : 'airport-dest',
            name: effectiveIata
              ? translate('engine.airport_suffix_name', { name: effectiveIata })
              : translate('engine.airport_suffix_name', { name: destClean }),
            city: destClean,
            category: 'AIRPORT',
            duration_mins: 120,
            cost_eur: 0,
            location: { latitude: cityFallbackLat, longitude: cityFallbackLng },
          };
        }

        let resolvedHotelLat = typeof params.hotelLat === 'number' ? params.hotelLat : 0;
        let resolvedHotelLng = typeof params.hotelLng === 'number' ? params.hotelLng : 0;
        if (resolvedHotelLat === 0 && resolvedHotelLng === 0) {
          try {
            const locQuery = params.hotelArea.trim()
              ? `${params.hotelArea.trim()} ${destClean}`
              : destClean;
            const locRes = await fetch(
              `${baseUrl}/locations/search?q=${encodeURIComponent(locQuery)}&limit=1`
            );
            if (locRes.ok) {
              const locItems = await locRes.json();
              if (Array.isArray(locItems) && locItems.length > 0) {
                if (
                  typeof locItems[0].latitude === 'number' &&
                  typeof locItems[0].longitude === 'number'
                ) {
                  resolvedHotelLat = locItems[0].latitude;
                  resolvedHotelLng = locItems[0].longitude;
                }
              }
            }
          } catch {
            // fallback
          }
          if (
            resolvedHotelLat === 0 &&
            resolvedHotelLng === 0 &&
            (cityFallbackLat !== 0 || cityFallbackLng !== 0)
          ) {
            resolvedHotelLat = cityFallbackLat;
            resolvedHotelLng = cityFallbackLng;
          }
        }

        const hotelPoi = {
          id: 'hotel-base',
          name:
            params.hotelArea.trim() || translate('engine.accommodation_hotel_fallback'),
          city: destClean,
          category: 'HOTEL',
          duration_mins: 0,
          cost_eur: 0,
          location: { latitude: resolvedHotelLat, longitude: resolvedHotelLng },
        };

        const days = [];
        for (let i = 1; i <= tripDurationDays; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + (i - 1));
          const dayDateStr = formatLocalIsoDate(d);
          const isCinDay = dayDateStr === effectiveCheckInDate;
          const isCoutDay = dayDateStr === effectiveCheckOutDate;

          let dayPath: Array<{
            poi: typeof airportPoi;
            scheduled_start?: string;
            scheduled_end?: string;
            arrival_time?: string;
            departure_time?: string;
          }> = [];

          if (tripDurationDays === 1) {
            const arrStart = arrMins;
            const depEnd =
              depMins > arrStart + 60
                ? depMins
                : Math.min(23 * 60 + 59, Math.max(arrStart + 120, depMins));
            const arrEnd = Math.min(arrStart + 60, Math.max(arrStart, depEnd - 60));
            let depStart = Math.max(arrEnd + 30, depEnd - 120);
            const midHotel = Math.max(
              arrEnd + 15,
              Math.min(cinMins, Math.max(arrEnd + 15, depStart - 15))
            );
            depStart = Math.max(midHotel + 15, depStart);
            dayPath = [
              { poi: airportPoi, scheduled_start: fmtHhmm(arrStart), scheduled_end: fmtHhmm(arrEnd), arrival_time: fmtHhmm(arrStart), departure_time: fmtHhmm(arrEnd) },
              { poi: hotelPoi, scheduled_start: fmtHhmm(midHotel), scheduled_end: fmtHhmm(midHotel), arrival_time: fmtHhmm(midHotel), departure_time: fmtHhmm(midHotel) },
              { poi: airportPoi, scheduled_start: fmtHhmm(depStart), scheduled_end: fmtHhmm(depEnd), arrival_time: fmtHhmm(depStart), departure_time: fmtHhmm(depEnd) },
            ];
          } else if (i === 1) {
            const arrStart = arrMins;
            const arrEnd = Math.min(23 * 60 + 59, arrStart + 60);
            const hotelTime = isCinDay
              ? Math.max(Math.min(23 * 60 + 59, arrEnd + 30), cinMins)
              : Math.max(Math.min(23 * 60 + 59, arrEnd + 30), 21 * 60);
            dayPath = [
              { poi: airportPoi, scheduled_start: fmtHhmm(arrStart), scheduled_end: fmtHhmm(arrEnd), arrival_time: fmtHhmm(arrStart), departure_time: fmtHhmm(arrEnd) },
              { poi: hotelPoi, scheduled_start: fmtHhmm(hotelTime), scheduled_end: fmtHhmm(hotelTime), arrival_time: fmtHhmm(hotelTime), departure_time: fmtHhmm(hotelTime) },
            ];
          } else if (i === tripDurationDays) {
            const depEnd = depMins;
            const rawAirportStart = Math.max(0, depEnd - 120);
            const maxHotelDep = Math.max(0, rawAirportStart - 30);
            const hotelStart = isCoutDay
              ? Math.min(coutMins, maxHotelDep)
              : Math.min(9 * 60, maxHotelDep);
            const depStart = Math.max(
              depEnd >= hotelStart + 30 ? hotelStart + 30 : hotelStart,
              rawAirportStart
            );
            dayPath = [
              { poi: hotelPoi, scheduled_start: fmtHhmm(hotelStart), scheduled_end: fmtHhmm(hotelStart), arrival_time: fmtHhmm(hotelStart), departure_time: fmtHhmm(hotelStart) },
              { poi: airportPoi, scheduled_start: fmtHhmm(depStart), scheduled_end: fmtHhmm(depEnd), arrival_time: fmtHhmm(depStart), departure_time: fmtHhmm(depEnd) },
            ];
          } else {
            const mornTime = isCoutDay ? Math.min(9 * 60, coutMins) : 9 * 60;
            const eveTime = isCinDay ? Math.max(21 * 60, cinMins) : 21 * 60;
            dayPath = [
              { poi: hotelPoi, scheduled_start: fmtHhmm(mornTime), scheduled_end: fmtHhmm(mornTime), arrival_time: fmtHhmm(mornTime), departure_time: fmtHhmm(mornTime) },
              { poi: hotelPoi, scheduled_start: fmtHhmm(eveTime), scheduled_end: fmtHhmm(eveTime), arrival_time: fmtHhmm(eveTime), departure_time: fmtHhmm(eveTime) },
            ];
          }

          days.push({
            day: i,
            date: dayDateStr,
            theme: translate('engine.day_exploration_theme', { day: i }),
            itinerary: {
              day_index: i - 1,
              path: dayPath,
              total_cost_eur: 0,
              total_time_mins: 0,
            },
            activities: dayPath.map((node) => node.poi).filter(Boolean),
          });
        }

        const outboundFlightDoc = params.scannedDocuments.find(
          (d) => d.ticket_type === 'flight' && !d.metadata?.is_return_leg
        );
        const returnFlightDoc = params.scannedDocuments.find(
          (d) => d.ticket_type === 'flight' && Boolean(d.metadata?.is_return_leg)
        );
        const numericBudget =
          params.budgetUsd !== '' && Number.isFinite(Number(params.budgetUsd))
            ? Math.max(0, Number(params.budgetUsd))
            : 1500;
        const coverPhotoPayload =
          !params.isPhotoRemoved && params.customPhotoUrl ? params.customPhotoUrl : undefined;
        const travelersCount = Math.max(1, params.participants.length);

        const blankItineraryData = {
          title: titleClean,
          description: params.tripDescription.trim() || undefined,
          ...(coverPhotoPayload ? { cover_photo: coverPhotoPayload } : {}),
          destination: destClean,
          origin: params.origin.trim() || undefined,
          departure_hour: params.departureHour || '09:00',
          arrival_hour: params.arrivalHour || '20:00',
          participants: params.participants.map((p) => ({
            id: p.id,
            user_id: p.user_id,
            name: p.name,
            email: p.email,
            is_guest: p.is_guest,
          })),
          outbound_flight: outboundFlightDoc
            ? {
                airline: outboundFlightDoc.provider || undefined,
                flight_number:
                  (outboundFlightDoc.metadata?.flight_number as string) || undefined,
                origin_iata:
                  (outboundFlightDoc.metadata?.origin_iata as string) ||
                  params.originIata ||
                  undefined,
                destination_iata:
                  (outboundFlightDoc.metadata?.destination_iata as string) ||
                  params.destIata ||
                  undefined,
                departure_time:
                  outboundFlightDoc.start_time ||
                  `${params.startDate}T${params.departureHour || '09:00'}:00`,
                arrival_time: outboundFlightDoc.metadata?.arrival_hour
                  ? `${params.startDate}T${outboundFlightDoc.metadata.arrival_hour}:00`
                  : `${params.startDate}T${params.departureHour || '09:00'}:00`,
                seat: outboundFlightDoc.seat_or_room || undefined,
                pnr: outboundFlightDoc.reference_code || undefined,
                holder_name: outboundFlightDoc.holder_name || undefined,
              }
            : undefined,
          return_flight: returnFlightDoc
            ? {
                airline: returnFlightDoc.provider || undefined,
                flight_number:
                  (returnFlightDoc.metadata?.flight_number as string) || undefined,
                origin_iata:
                  (returnFlightDoc.metadata?.origin_iata as string) ||
                  params.destIata ||
                  undefined,
                destination_iata:
                  (returnFlightDoc.metadata?.destination_iata as string) ||
                  params.originIata ||
                  undefined,
                departure_time:
                  returnFlightDoc.start_time ||
                  `${params.endDate}T${params.arrivalHour || '20:00'}:00`,
                arrival_time: returnFlightDoc.metadata?.arrival_hour
                  ? `${params.endDate}T${returnFlightDoc.metadata.arrival_hour}:00`
                  : `${params.endDate}T${params.arrivalHour || '20:00'}:00`,
                seat: returnFlightDoc.seat_or_room || undefined,
                pnr: returnFlightDoc.reference_code || undefined,
                holder_name: returnFlightDoc.holder_name || undefined,
              }
            : undefined,
          scanned_documents: params.scannedDocuments,
          hotel: {
            name: hotelPoi.name,
            address: params.hotelAddress || undefined,
            lat: hotelPoi.location.latitude,
            lng: hotelPoi.location.longitude,
            check_in_date: effectiveCheckInDate,
            check_in_time: params.hotelCheckInHour || '15:00',
            check_out_date: effectiveCheckOutDate,
            check_out_time: params.hotelCheckOutHour || '11:00',
          },
          airport: {
            name: airportPoi.name,
            lat: airportPoi.location.latitude,
            lng: airportPoi.location.longitude,
          },
          travel_constraints: {
            destination_city: destClean,
            destination_iata:
              params.destIata.trim().toUpperCase() || effectiveIata || undefined,
            origin_city: params.origin.trim() || undefined,
            origin_iata: params.originIata.trim().toUpperCase() || undefined,
            start_date: params.startDate,
            end_date: params.endDate,
            departure_hour: params.departureHour || '09:00',
            arrival_hour: params.arrivalHour || '20:00',
            budget: numericBudget,
            budget_usd: numericBudget,
            currency: params.currency,
            travelers: travelersCount,
            participants: params.participants.map((p) => ({
              id: p.id,
              user_id: p.user_id,
              name: p.name,
              email: p.email,
              is_guest: p.is_guest,
            })),
            accommodation: hotelPoi.name,
            hotel: {
              name: hotelPoi.name,
              address: params.hotelAddress || undefined,
              lat: hotelPoi.location.latitude,
              lng: hotelPoi.location.longitude,
              check_in_date: effectiveCheckInDate,
              check_in_time: params.hotelCheckInHour || '15:00',
              check_out_date: effectiveCheckOutDate,
              check_out_time: params.hotelCheckOutHour || '11:00',
            },
          },
          days,
          is_blank_trip: true,
        };

        let createdTrip: { id?: string } | null = null;
        try {
          createdTrip = await apiFetch<{ id?: string }>('/trips/', {
            method: 'POST',
            body: JSON.stringify({
              destination: destClean,
              start_date: new Date(params.startDate).toISOString(),
              end_date: new Date(params.endDate).toISOString(),
              itinerary_data: blankItineraryData,
            }),
          });
        } catch {
          createdTrip = null;
        }

        if (!createdTrip?.id) {
          throw new Error(translate('engine.err_create_trip_db'));
        }

        const completedJob: TripGenerationJob = {
          ...initialJob,
          status: 'completed',
          stage: 'DONE',
          stage_message: 'Itinerary ready.',
          trip_id: createdTrip.id,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        set((state) => ({
          jobs: { ...state.jobs, [jobId]: completedJob },
        }));

        handleTerminalCompletion(completedJob, { acknowledgeOnServer: false });

        return { jobId, tripId: createdTrip.id };
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : translate('engine.err_creating_blank_trip');
        const wasWatching = get().watchingJobId === jobId;

        set((state) => {
          const nextJobs = { ...state.jobs };
          delete nextJobs[jobId];
          return {
            jobs: nextJobs,
            watchingJobId: wasWatching ? null : state.watchingJobId,
            activeDraftJobId:
              state.activeDraftJobId === jobId ? null : state.activeDraftJobId,
          };
        });

        if (!wasWatching) {
          notify.error(
            translate('notifications.trip_generation_failed_title'),
            translate('notifications.trip_generation_failed_message', {
              destination: destClean,
              error: msg,
            }),
            {
              actionLink: '/engine',
              actionLabel: translate('engine.back_to_trip_editor'),
              durationMs: 12000,
            }
          );
        }

        return { jobId, error: msg };
      }
    },

    resumeJob: async (jobId, answers) => {
      const existing = get().jobs[jobId];
      if (!existing || existing.kind === 'blank') return null;

      try {
        const updated = await resumeTripGenerationJobApi(jobId, answers);
        const normalized: TripGenerationJob = { ...updated, kind: 'personalized' };
        set((state) => {
          const nextJobs = { ...state.jobs };
          if (normalized.status === 'cancelled') {
            delete nextJobs[jobId];
          } else {
            nextJobs[jobId] = normalized;
          }
          return {
            jobs: nextJobs,
            watchingJobId:
              normalized.status === 'cancelled' && state.watchingJobId === jobId
                ? null
                : state.watchingJobId,
          };
        });
        return normalized;
      } catch (err) {
        console.error('Failed to resume trip generation job:', err);
        return null;
      }
    },

    cancelJob: async (jobId) => {
      const existing = get().jobs[jobId];
      set((state) => {
        const nextJobs = { ...state.jobs };
        delete nextJobs[jobId];
        return {
          jobs: nextJobs,
          watchingJobId: state.watchingJobId === jobId ? null : state.watchingJobId,
          activeDraftJobId:
            state.activeDraftJobId === jobId ? null : state.activeDraftJobId,
        };
      });
      if (existing && existing.kind !== 'blank') {
        try {
          await cancelTripGenerationJobApi(jobId);
        } catch {
          // ignore if already cancelled/finished
        }
      }
    },

    dismissJob: async (jobId) => {
      const existing = get().jobs[jobId];
      set((state) => {
        const nextJobs = { ...state.jobs };
        delete nextJobs[jobId];
        return {
          jobs: nextJobs,
          watchingJobId: state.watchingJobId === jobId ? null : state.watchingJobId,
        };
      });
      if (existing && existing.kind !== 'blank') {
        try {
          await acknowledgeTripGenerationJobApi(jobId);
        } catch {
          // ignore
        }
      }
    },

    handleServerEvent: (payload) => {
      const jobId = payload.job_id || (payload.data as TripGenerationJob | undefined)?.id;
      if (!jobId) return;

      const dataObj =
        payload.data && typeof payload.data === 'object'
          ? (payload.data as Partial<TripGenerationJob>)
          : {};
      const existing = get().jobs[jobId];
      const nowIso = new Date().toISOString();

      const buildUpdatedJob = (overrides: Partial<TripGenerationJob>): TripGenerationJob => ({
        id: jobId,
        user_id: payload.user_id ?? dataObj.user_id ?? existing?.user_id ?? null,
        thread_id: payload.thread_id || dataObj.thread_id || existing?.thread_id || jobId,
        destination:
          payload.destination ||
          dataObj.destination ||
          existing?.destination ||
          translate('engine.trip_fallback'),
        title: payload.title ?? dataObj.title ?? existing?.title ?? null,
        status: existing?.status || 'running',
        stage: payload.stage || dataObj.stage || existing?.stage || 'STARTING_INFERENCE',
        stage_message:
          payload.message ??
          dataObj.stage_message ??
          existing?.stage_message ??
          null,
        prompt: dataObj.prompt || existing?.prompt || '',
        interrupt_type: existing?.interrupt_type ?? null,
        interrupt_payload: existing?.interrupt_payload ?? null,
        guardrail_errors: existing?.guardrail_errors ?? null,
        error_message: existing?.error_message ?? null,
        trip_id: payload.trip_id ?? dataObj.trip_id ?? existing?.trip_id ?? null,
        acknowledged: dataObj.acknowledged ?? existing?.acknowledged ?? false,
        created_at: dataObj.created_at || existing?.created_at || nowIso,
        updated_at: dataObj.updated_at || nowIso,
        completed_at: dataObj.completed_at ?? existing?.completed_at ?? null,
        kind: 'personalized',
        ...overrides,
      });

      switch (payload.event) {
        case 'TRIP_JOB_STARTED':
        case 'TRIP_JOB_PROGRESS': {
          const next = buildUpdatedJob({
            status: 'running',
            interrupt_type: null,
            interrupt_payload: null,
          });
          set((state) => ({ jobs: { ...state.jobs, [jobId]: next } }));
          break;
        }
        case 'TRIP_JOB_AWAITING_INPUT': {
          const interruptType = payload.interrupt_type || dataObj.interrupt_type || 'VERIFICATION_REQUIRED';
          const interruptPayload =
            payload.interrupt_payload || dataObj.interrupt_payload || null;
          const next = buildUpdatedJob({
            status: 'awaiting_input',
            stage: interruptType,
            interrupt_type: interruptType,
            interrupt_payload: interruptPayload,
          });
          set((state) => ({ jobs: { ...state.jobs, [jobId]: next } }));

          const dedupeKey = `interrupt:${jobId}:${interruptType}`;
          if (markNotified(dedupeKey) && get().watchingJobId !== jobId) {
            notify.warning(
              translate('notifications.trip_input_required_title'),
              translate('notifications.trip_input_required_message', {
                destination: next.destination,
              }),
              {
                actionLink: `/engine?job=${encodeURIComponent(jobId)}`,
                actionLabel: translate('engine.bg_respond'),
                durationMs: 10000,
              }
            );
          }
          break;
        }
        case 'TRIP_JOB_COMPLETED': {
          const next = buildUpdatedJob({
            status: 'completed',
            stage: 'DONE',
            stage_message: 'Itinerary ready.',
            trip_id: payload.trip_id || dataObj.trip_id || null,
            completed_at: dataObj.completed_at || nowIso,
          });
          const isWatched = get().watchingJobId === jobId;
          set((state) => {
            const nextJobs = { ...state.jobs };
            if (isWatched) {
              nextJobs[jobId] = next;
            } else {
              delete nextJobs[jobId];
            }
            return { jobs: nextJobs };
          });
          handleTerminalCompletion(next, { acknowledgeOnServer: true });
          break;
        }
        case 'TRIP_JOB_ABORTED': {
          const errors = Array.isArray(payload.guardrail_errors)
            ? payload.guardrail_errors
            : Array.isArray(dataObj.guardrail_errors)
              ? dataObj.guardrail_errors
              : [];
          const next = buildUpdatedJob({
            status: 'aborted',
            stage: 'GUARDRAILS_ABORTED',
            guardrail_errors: errors,
            completed_at: dataObj.completed_at || nowIso,
          });
          set((state) => ({ jobs: { ...state.jobs, [jobId]: next } }));
          const dedupeKey = `aborted:${jobId}`;
          if (markNotified(dedupeKey)) {
            notify.error(
              translate('notifications.trip_guardrails_aborted_title'),
              errors.join(', ') || translate('engine.guardrails_abort_message'),
              {
                actionLink: '/engine',
                actionLabel: translate('engine.back_to_trip_editor'),
                durationMs: 10000,
              }
            );
          }
          break;
        }
        case 'TRIP_JOB_FAILED': {
          const errMsg =
            payload.error_message ||
            dataObj.error_message ||
            translate('engine.unexpected_error');
          const next = buildUpdatedJob({
            status: 'failed',
            stage: 'ERROR',
            error_message: errMsg,
            completed_at: dataObj.completed_at || nowIso,
          });
          const isWatched = get().watchingJobId === jobId;
          set((state) => {
            const nextJobs = { ...state.jobs };
            if (isWatched) {
              nextJobs[jobId] = next;
            } else {
              delete nextJobs[jobId];
            }
            return { jobs: nextJobs };
          });
          const dedupeKey = `failed:${jobId}`;
          if (markNotified(dedupeKey)) {
            notify.error(
              translate('notifications.trip_generation_failed_title'),
              translate('notifications.trip_generation_failed_message', {
                destination: next.destination,
                error: errMsg,
              }),
              {
                actionLink: '/engine',
                actionLabel: translate('engine.back_to_trip_editor'),
                durationMs: 12000,
              }
            );
          }
          if (!isWatched) {
            void acknowledgeTripGenerationJobApi(jobId).catch(() => {});
          }
          break;
        }
        case 'TRIP_JOB_CANCELLED': {
          set((state) => {
            const nextJobs = { ...state.jobs };
            delete nextJobs[jobId];
            return {
              jobs: nextJobs,
              watchingJobId: state.watchingJobId === jobId ? null : state.watchingJobId,
              activeDraftJobId:
                state.activeDraftJobId === jobId ? null : state.activeDraftJobId,
            };
          });
          break;
        }
        default:
          break;
      }
    },

    resetForUser: () => {
      set({
        jobs: {},
        watchingJobId: null,
        activeDraftJobId: null,
        hydrated: false,
      });
    },
  };
});
