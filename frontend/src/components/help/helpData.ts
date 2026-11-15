export interface HelpArticle {
  id: string;
  categoryId: string;
  title: string;
  excerpt: string;
  readTime: string;
  badge?: string;
  difficulty?: 'Quick Guide' | 'Helpful' | 'Detailed';
  tldr: string;
  mockupType?:
    | 'timeline'
    | 'route-comparison'
    | 'realism-radar'
    | 'cost-knapsack'
    | 'swarm-assistant'
    | 'transit-routing'
    | 'wallet-passbook'
    | 'route-monitoring';
  screenshotUrl?: string;
  screenshotCaption?: string;
  sections: Array<{
    heading: string;
    content: string[];
    steps?: string[];
    callout?: {
      type: 'tip' | 'important' | 'warning';
      text: string;
    };
    parameterTable?: Array<{
      term: string;
      meaning: string;
      rangeOrType: string;
      defaultOrExample: string;
    }>;
  }>;
  relatedArticleIds?: string[];
}

export interface HelpCategory {
  id: string;
  title: string;
  subtitle: string;
  iconName: string;
  articles: HelpArticle[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    subtitle:
      'Navigate the Control Center, launch your first itinerary in New Trip, import existing bookings or .trip packages, and understand your Taste Star profile.',
    iconName: 'compass',
    articles: [
      {
        id: 'welcome-to-paladio',
        categoryId: 'getting-started',
        title: 'Navigating the Control Center & App Shell',
        excerpt:
          'How the Control Center brings together your active trip ticket, Taste Star profile, monitored flight deals, recommendations, and expedition calendar.',
        readTime: '3 min',
        badge: 'OVERVIEW',
        difficulty: 'Quick Guide',
        tldr: 'Use the main navigation to move between Control Center, New Trip, Route Monitoring, and Trip Archive, and open Settings or Help from your user menu.',
        screenshotUrl: '/help-screenshots/dashboard.png',
        screenshotCaption:
          'Paladio Control Center showing your active trip ticket, Taste Star radar, monitored deal offer, calendar, and recommendations.',
        sections: [
          {
            heading: 'Main Navigation Structure',
            content: [
              'Paladio is organized around four primary views in the navigation rail: Control Center (/dashboard), New Trip (/engine), Route Monitoring (/monitoring), and Trip Archive (/vault).',
              'At the bottom-left user menu, you can open Settings (/config), return to this Help Center (/help), or Sign Out.',
            ],
            steps: [
              'Open Control Center to check your active expedition, upcoming departures, and saved place collections.',
              'Switch to New Trip whenever you want to create a Personalized Trip, start a Blank Trip, or import documents.',
              'Open Route Monitoring to track round-trip flight and hotel telemetry and convert verified deals into trips.',
              'Visit Trip Archive to browse completed expeditions on the interactive world map and review travel statistics.',
            ],
          },
          {
            heading: 'Control Center Widgets at a Glance',
            content: [
              'Every panel on the Control Center stays live against your PostgreSQL database, monitored routes, and saved collections.',
            ],
            parameterTable: [
              {
                term: 'Active Trip Ticket',
                meaning: 'Shows your next or currently active expedition with countdown and a direct OPEN COCKPIT button.',
                rangeOrType: 'Widget Card',
                defaultOrExample: 'Opens /trips/[id]',
              },
              {
                term: 'Taste Star',
                meaning: 'Read-only 8-axis radar of your learned travel affinities alongside summary cards for TRAVEL PACE and BUDGET STRATEGY.',
                rangeOrType: '8-Axis Profile',
                defaultOrExample: 'Updated automatically + tuned in Settings',
              },
              {
                term: 'Best Offer Card',
                meaning: 'Highlights verified P10 deal packages discovered by Route Monitoring.',
                rangeOrType: 'Live Deal Card',
                defaultOrExample: 'Links directly into /monitoring or /engine',
              },
              {
                term: 'Expedition Calendar',
                meaning: 'Displays upcoming trips and highlighted deal windows. Click any date to open New Trip pre-filled with that start date.',
                rangeOrType: 'Interactive Calendar',
                defaultOrExample: 'Opens /engine?start_date=...',
              },
              {
                term: 'Recommended POIs & Collections',
                meaning: 'Surfaces city sights scored with % Taste Match alongside your saved POI collections.',
                rangeOrType: 'Personalization Feed',
                defaultOrExample: 'Synced with ML Taste Learning & RAG',
              },
            ],
          },
        ],
        relatedArticleIds: ['planning-first-trip', 'taste-star-profile', 'monitoring-telemetry'],
      },
      {
        id: 'planning-first-trip',
        categoryId: 'getting-started',
        title: 'Creating Your First Trip in New Trip',
        excerpt:
          'Launch a Personalized Trip or Blank Trip in /engine using flight windows, hotel anchors, budget envelopes, documents, and optional LLM prompt constraints.',
        readTime: '4 min',
        badge: 'ESSENTIAL',
        difficulty: 'Quick Guide',
        tldr: 'Open New Trip (/engine), pick Personalized Trip or Blank Trip, set your origin/destination, dates, hotel anchor, budget, and travelers, then click Generate Sovereign Trip Plan.',
        screenshotUrl: '/help-screenshots/engine.png',
        screenshotCaption:
          'New Trip (/engine) showing Personalized vs Blank mode, Upload Documents, Flight Route & Time Windows, Hotel Anchor, Budget Envelope, Travel Window & Calendar, and Intent box.',
        sections: [
          {
            heading: 'Two Ways to Start in /engine',
            content: [
              'At the top of New Trip (/engine), choose between Personalized Trip (runs Paladio’s deterministic itinerary builder and optimizer using your tastes, opening hours, and constraints) or Blank Trip (creates an empty canvas workspace where you curate every stop yourself).',
              'Next to the mode switch, the Upload Documents (+ icon) button lets you upload flight confirmations, hotel PDFs, text confirmations, Apple Wallet .pkpass files, or import a previously exported .trip archive package.',
            ],
            steps: [
              'Customize the Cover Banner photo (or Reset it), enter an editable trip title, and optionally add a Trip description.',
              'Under Flight Route & Time Windows, enter ORIG and DEST airports/cities plus Outbound Arrival (Arr) and Return Departure (Dep) hour windows so first and last days never clip airport transfers.',
              'Set your Hotel / Stay Anchor by searching an address/property or clicking Locate on Map.',
              'Set your Budget Envelope amount and tap the currency pill to select currency from the 3D Currency Spin Dial, then add companions under Travelers.',
              'Select your departure and return dates in Travel Window & Calendar on the right.',
              'In Personalized Trip mode, optionally write requests or tap preset chips inside INTENT, CONSTRAINTS & PREFERENCES (LLM SWARM SOLVER), then click Generate Sovereign Trip Plan (or Create Blank Canvas Trip in Blank mode).',
            ],
            callout: {
              type: 'important',
              text: 'Daily exploration pace (Relaxed, Balanced, or Packed / High Tempo) is customized inside each trip’s Configuration tab, while global solver baselines live under Settings → Solver Constraints & Pacing.',
            },
          },
          {
            heading: 'Deterministic Planning vs. Optional AI Prompts',
            content: [
              'Paladio generates, clusters, and optimizes day-by-day schedules deterministically using its C++20 TSPTW core and local POI database—without requiring a generative LLM API key.',
              'When you configure a provider under Settings → AI & LLM Engine, the optional INTENT, CONSTRAINTS & PREFERENCES box in Personalized Trip mode enriches candidate weighting and constraints from natural language.',
            ],
          },
        ],
        relatedArticleIds: ['navigating-trip-workspace', 'wallet-overview-dropzone', 'trip-configuration-sharing'],
      },
      {
        id: 'taste-star-profile',
        categoryId: 'getting-started',
        title: 'Understanding Your Taste Star & Solver Guardrails',
        excerpt:
          'How the 8-axis Taste Star shapes POI rankings and how deterministic solver guardrails keep every generated day walkable and realistic.',
        readTime: '3 min',
        badge: 'PERSONALIZATION',
        difficulty: 'Helpful',
        tldr: 'Paladio combines your 8-axis Taste Star preferences with strict deterministic guardrails—meal windows, neighborhood clustering, opening hours, exploration pace caps, and real street/GTFS routing.',
        mockupType: 'realism-radar',
        sections: [
          {
            heading: 'How Your Taste Star Works',
            content: [
              'On Control Center (/dashboard), the Taste Star widget visualizes eight travel dimensions derived from your past trips, bookmarked places, and saved preferences alongside your active TRAVEL PACE and BUDGET STRATEGY profile.',
              'When viewing Recommended POIs or searching inside a trip, Paladio scores venues against your Taste Star embedding profile to surface strong % Taste Matches first.',
            ],
            callout: {
              type: 'tip',
              text: 'Manage embedding models, taste weighting, and semantic indexing behavior inside Settings → ML Taste Learning & RAG.',
            },
          },
          {
            heading: 'Deterministic Solver Guardrails',
            content: [
              'Rather than guessing times with an AI text model, Paladio enforces hard mathematical constraints in its C++20 solver engine before committing any schedule.',
            ],
            parameterTable: [
              {
                term: 'Daily Meal Windows',
                meaning: 'Reserves realistic lunch and dinner blocks anchored to open food venues.',
                rangeOrType: 'Hard Time Constraint',
                defaultOrExample: 'Balanced midday & evening dining',
              },
              {
                term: 'Neighborhood Clustering',
                meaning: 'Groups sights by geographic cluster to prevent zig-zagging across the city.',
                rangeOrType: 'Spatial TSPTW Cost',
                defaultOrExample: 'District-first stop ordering',
              },
              {
                term: 'Opening-Hour Time Windows',
                meaning: 'Never schedules a stop before opening or after last entry, honoring buffer margins.',
                rangeOrType: 'Strict Window Bounds',
                defaultOrExample: 'Verified per-venue open hours',
              },
              {
                term: 'Exploration Pace Caps',
                meaning: 'Controls stop count, visit durations, and breathing room according to Relaxed, Balanced, or Packed / High Tempo.',
                rangeOrType: 'Trip & Global Config',
                defaultOrExample: 'Configurable in Configuration / Settings',
              },
            ],
          },
        ],
        relatedArticleIds: ['neighborhood-optimization', 'editing-timeline-locks'],
      },
    ],
  },
  {
    id: 'trips',
    title: 'Trip Workspace',
    subtitle:
      'Master the interactive trip workspace: Plan, Wallet, Costs, Photos, Configuration, Share Expedition exports, and the bottom-left Speed Dial.',
    iconName: 'calendar',
    articles: [
      {
        id: 'navigating-trip-workspace',
        categoryId: 'trips',
        title: 'Navigating the Trip Workspace (/trips/[id])',
        excerpt:
          'Understand the five workspace tabs, the six Plan sidebar modes, interactive map controls, and how completed trips archive into the Vault.',
        readTime: '3 min',
        badge: 'WORKSPACE',
        difficulty: 'Quick Guide',
        tldr: 'Each trip workspace has five top tabs (Plan, Wallet, Costs, Photos, Configuration) plus Share Expedition, while the Plan view pairs an interactive Leaflet map with a six-tab sidebar.',
        screenshotUrl: '/help-screenshots/trip-workspace.png',
        screenshotCaption:
          'Active Tokyo trip workspace showing top navigation tabs (Plan, Wallet, Costs, Photos, Configuration), the unified sidebar, and the interactive day route map.',
        sections: [
          {
            heading: 'Workspace Header & Top-Level Tabs',
            content: [
              'At the top of every active expedition workspace, the header shows < Control Center to return home, your destination title, five core tabs, and Share Expedition.',
            ],
            parameterTable: [
              {
                term: 'Plan',
                meaning: 'Interactive Leaflet map paired with Route, Search, Transit, Weather, Collections, and Agent tabs.',
                rangeOrType: 'Primary View',
                defaultOrExample: 'Day-by-day timeline & routing',
              },
              {
                term: 'Wallet',
                meaning: 'Centralized ticket vault with drag-and-drop parsing, itinerary sync, QR/barcode display, and transit advisories.',
                rangeOrType: 'Passbook Tab',
                defaultOrExample: 'Supports PDF, images, TXT, .pkpass',
              },
              {
                term: 'Costs',
                meaning: 'Budget tracking, Live Currency Exchange conversion, unassigned route estimate assignment, and multi-traveler Settle up.',
                rangeOrType: 'Ledger Tab',
                defaultOrExample: 'Includes CSV export',
              },
              {
                term: 'Photos',
                meaning: 'Trip photo gallery supporting local uploads plus Immich and Synology NAS media sync.',
                rangeOrType: 'Gallery Tab',
                defaultOrExample: 'Synced per expedition',
              },
              {
                term: 'Configuration',
                meaning: 'Edit title, flight windows, hotel anchor, Exploration Pace, crew roster, status, or delete expedition.',
                rangeOrType: 'Trip Settings Tab',
                defaultOrExample: 'Relaxed / Balanced / Packed',
              },
            ],
            callout: {
              type: 'important',
              text: 'Once an expedition is marked Completed (Archived in Vault), opening /trips/[id] automatically redirects to its recap view at /vault/[id] unless opened with ?workspace=1.',
            },
          },
          {
            heading: 'The Six Sidebar Tabs Inside Plan',
            content: [
              'On the left side of the Plan view, switch seamlessly between Route (daily itinerary and transit connectors), Search (POI discovery and custom places), Transit (GTFS directions, lines, and nearby stops), Weather (daily forecast and climate), Collections (saved POI lists), and Agent (Paladio AI chat assistant).',
            ],
          },
        ],
        relatedArticleIds: ['editing-timeline-locks', 'searching-pois-collections', 'trip-configuration-sharing'],
      },
      {
        id: 'editing-timeline-locks',
        categoryId: 'trips',
        title: 'Speed Dial Controls, Locking Stops & Re-Solving',
        excerpt:
          'Use the bottom-left Speed Dial to enter Edit Route mode, drag stops, lock fixed reservation times, drop map search areas, and run Solve.',
        readTime: '4 min',
        badge: 'WORKFLOW',
        difficulty: 'Helpful',
        tldr: 'Open the bottom-left Speed Dial (+) to toggle EDIT ROUTE, drop an exploration radius with DROP WAYPOINT, or switch VIEW: SIMPLE / DETAILED; lock timed reservations and hit Solve.',
        mockupType: 'timeline',
        sections: [
          {
            heading: 'Using the Bottom-Left Speed Dial (+)',
            content: [
              'When inside the Plan view, the circular + Speed Dial button in the bottom-left corner of the map gives one-tap access to editing, area scoping, and timeline density.',
            ],
            parameterTable: [
              {
                term: 'EDIT ROUTE / EDITING ACTIVE',
                meaning: 'Reveals drag-and-drop handles, lock toggles, remove buttons on stop cards, and activates the Solve button in the Route header.',
                rangeOrType: 'Edit Mode Toggle',
                defaultOrExample: 'Click Solve after editing',
              },
              {
                term: 'DROP WAYPOINT / CLEAR AREA (...)',
                meaning: 'Places a center pin and adjustable radius circle on the map to filter Search and Transit results to that neighborhood.',
                rangeOrType: 'Spatial Filter',
                defaultOrExample: 'Syncs with Area Filter in Transit',
              },
              {
                term: 'VIEW: SIMPLE / VIEW: DETAILED',
                meaning: 'Switches timeline cards between clean compact rows and expanded schedule details with transit legs.',
                rangeOrType: 'Display Density',
                defaultOrExample: 'Persisted per session',
              },
            ],
          },
          {
            heading: 'Day Tabs, Locking & Solving',
            content: [
              'Across the top of the Route sidebar, filter by ALL DAYS or pick a specific DAY 1..N pill, or tap + Day to extend your itinerary.',
              'Click any stop card to inspect full opening hours, descriptions, coordinates, and admission estimates, or click the transit connector between stops to review leg timing.',
            ],
            steps: [
              'Open the bottom-left Speed Dial (+) and activate EDIT ROUTE.',
              'Lock any stop whose reservation or timed ticket must stay fixed, or drag stops to reorder / delete unwanted venues.',
              'Click the Solve button in the Route sidebar header to run the deterministic optimizer around your locked stops.',
            ],
          },
        ],
        relatedArticleIds: ['neighborhood-optimization', 'public-transit-gtfs', 'searching-pois-collections'],
      },
      {
        id: 'searching-pois-collections',
        categoryId: 'trips',
        title: 'Place Discovery, Custom POIs, Weather & Collections',
        excerpt:
          'Find curated sights or add custom map pins in Search, save favorites to Collections, and check daily forecasts in Weather.',
        readTime: '3 min',
        badge: 'DISCOVERY',
        difficulty: 'Quick Guide',
        tldr: 'Use the Search tab to filter sights or click Add POI for custom coordinates, bookmark places into Collections, and check the Weather tab before locking outdoor days.',
        sections: [
          {
            heading: 'Searching & Creating Custom POIs',
            content: [
              'Inside Plan → Search, filter places by category chips, rating, visit duration, price tier, and sort order. When you drop an exploration circle via Speed Dial → DROP WAYPOINT, search automatically prioritizes results inside that radius.',
            ],
            steps: [
              'Type a venue name, neighborhood, or keyword and press Search.',
              'Toggle Custom to filter community/user-created stops, or click Add POI to place a custom landmark directly on the map with your own name, category, and duration.',
              'Click any result to add it directly to a trip day or bookmark it into a Collection.',
            ],
          },
          {
            heading: 'Collections & Weather Tabs',
            content: [
              'The Collections tab lets you organize reusable lists of sights, cafes, and restaurants and add them directly onto any itinerary day (Collections also appear on Control Center /dashboard).',
              'The Weather tab displays forecasted temperatures and precipitation probabilities across your trip dates—or seasonal climate averages when planning months ahead.',
            ],
          },
        ],
        relatedArticleIds: ['editing-timeline-locks', 'navigating-trip-workspace'],
      },
      {
        id: 'trip-configuration-sharing',
        categoryId: 'trips',
        title: 'Trip Configuration & Share Expedition Exports',
        excerpt:
          'Adjust flight windows, target budget, Exploration Pace, Crew Roster, and export .trip archives, PDFs, iCalendar (.ics), or JSON.',
        readTime: '3 min',
        badge: 'EXPORT',
        difficulty: 'Quick Guide',
        tldr: 'Edit flight anchors, Exploration Pace (Relaxed, Balanced, Packed / High Tempo), budget, and status under Configuration, or open Share Expedition to export .trip, .pdf, .ics, or .json.',
        sections: [
          {
            heading: 'Editing Expedition Basics in Configuration',
            content: [
              'Switch to the Configuration tab in the workspace header whenever plans shift mid-planning.',
            ],
            parameterTable: [
              {
                term: 'TRIP DESCRIPTION & FIELD NOTES',
                meaning: 'Public expedition summary and private INTERNAL FIELD NOTES & REMINDERS.',
                rangeOrType: 'Text Fields',
                defaultOrExample: 'Visible to workspace collaborators',
              },
              {
                term: 'EXPLORATION PACE',
                meaning: 'Sets daily stop density and pacing for the solver inside this trip.',
                rangeOrType: 'Relaxed | Balanced | Packed / High Tempo',
                defaultOrExample: 'Balanced',
              },
              {
                term: 'TARGET BUDGET & BASE CURRENCY',
                meaning: 'Updates the cost envelope used by Costs summary progress bars.',
                rangeOrType: 'Numeric + ISO Currency',
                defaultOrExample: 'e.g., EUR, USD, JPY',
              },
              {
                term: 'Trip Status & Crew Roster',
                meaning: 'Add or update travelers and switch status between Active Expedition, Completed (Archived in Vault), or Draft / On Hold (or DELETE EXPEDITION).',
                rangeOrType: 'Lifecycle & Roster',
                defaultOrExample: 'Completed moves recap to /vault',
              },
            ],
          },
          {
            heading: 'Share Expedition Export Formats',
            content: [
              'Click Share Expedition in the top-right header to copy a share link or download portable offline files.',
            ],
            parameterTable: [
              {
                term: 'Paladio Package (.trip)',
                meaning: 'Self-contained expedition bundle supporting Full Vault (includes private Wallet passes and receipts) or Shareable mode (omits private files). Re-importable via Upload Documents in /engine.',
                rangeOrType: '.trip Archive',
                defaultOrExample: 'Full Vault or Shareable',
              },
              {
                term: 'Printable Document (.pdf)',
                meaning: 'Clean printable day-by-day dossier ready for offline reading or paper backup.',
                rangeOrType: 'PDF Dossier',
                defaultOrExample: 'Daily stop schedule & notes',
              },
              {
                term: 'Calendar Sync (.ics)',
                meaning: 'Standard iCalendar file containing timed stops for Apple Calendar, Google Calendar, or Nextcloud.',
                rangeOrType: 'RFC 5545 .ics',
                defaultOrExample: 'Imports per-stop timestamps',
              },
              {
                term: 'Raw Itinerary (.json)',
                meaning: 'Complete structured JSON representation of days, stops, coordinates, and metadata.',
                rangeOrType: 'JSON Export',
                defaultOrExample: 'Programmatic backup',
              },
            ],
          },
        ],
        relatedArticleIds: ['planning-first-trip', 'wallet-overview-dropzone', 'trip-archive-vault'],
      },
    ],
  },
  {
    id: 'routes',
    title: 'Routes & Public Transit',
    subtitle:
      'Discover how the C++20 TSPTW optimizer eliminates zig-zagging, how Valhalla handles street/foot routing, and how GTFS powers the Transit tab.',
    iconName: 'route',
    articles: [
      {
        id: 'neighborhood-optimization',
        categoryId: 'routes',
        title: 'How Paladio Optimizes Your Daily Flow',
        excerpt:
          'Understand district clustering, deterministic TSPTW sequencing, opening hours, and why Paladio beats naive list ordering.',
        readTime: '4 min',
        badge: 'ROUTING ENGINE',
        difficulty: 'Helpful',
        tldr: 'Paladio solves a deterministic Traveling Salesman Problem with Time Windows (TSPTW) in C++20 so stops flow cleanly through neighborhoods instead of zig-zagging.',
        mockupType: 'route-comparison',
        sections: [
          {
            heading: 'Ending Zig-Zag Days with TSPTW',
            content: [
              'A human list of must-see landmarks rarely accounts for opening times, museum closure days, or cross-town bottleneck crossings. Clicking them in alphabetical or popularity order sends you ping-ponging across rivers and transit zones.',
              'Paladio computes an exact or near-optimal sequence in milliseconds inside its C++20 paladio_core solver, clustering neighboring venues together while respecting lunch/dinner hours and any locked reservations.',
            ],
            callout: {
              type: 'tip',
              text: 'Every locked stop you pin in EDIT ROUTE mode acts as a fixed anchor—the solver rearranges all surrounding unlocked stops and meal times cleanly around it.',
            },
          },
        ],
        relatedArticleIds: ['editing-timeline-locks', 'public-transit-gtfs', 'valhalla-routing-coverage'],
      },
      {
        id: 'public-transit-gtfs',
        categoryId: 'routes',
        title: 'Public Transit Integration (Directions, Lines & Nearby)',
        excerpt:
          'Plan point-to-point routes, browse Metro/Rail/Tram/Bus lines, and inspect nearby stations using local GTFS schedules inside Plan → Transit.',
        readTime: '4 min',
        badge: 'TRANSIT & GTFS',
        difficulty: 'Helpful',
        tldr: 'Open Plan → Transit to query Directions between stops, inspect city Lines, or discover Nearby stations using locally compiled GTFS feeds and optional Area Filtering.',
        mockupType: 'transit-routing',
        screenshotUrl: '/help-screenshots/transit.png',
        screenshotCaption:
          'Trip workspace Transit tab showing Directions / Lines / Nearby modes, Area Filter, Metro/Rail/Tram/Bus chips, Depart at / Arrive by, and Get Directions.',
        sections: [
          {
            heading: 'Three Modes in the Transit Tab',
            content: [
              'Unlike static travel apps that only draw straight lines between pins, Paladio integrates real city GTFS transit feeds directly into the Plan sidebar.',
            ],
            parameterTable: [
              {
                term: 'Directions',
                meaning: 'Point-to-point transit router between itinerary origins and destinations. Pick Depart at or Arrive by, select your trip day, filter modes, and click Get Directions.',
                rangeOrType: 'Route Planner',
                defaultOrExample: 'Walk + transit step-by-step legs',
              },
              {
                term: 'Lines',
                meaning: 'Browse available transit routes grouped by agency and inspect full station sequences.',
                rangeOrType: 'Network Browser',
                defaultOrExample: 'Metro, Rail, Tram, Bus badges',
              },
              {
                term: 'Nearby',
                meaning: 'Lists nearby stops and stations with upcoming departures and walking distances.',
                rangeOrType: 'Stop Radar',
                defaultOrExample: 'Scoped to viewport or Waypoint Area',
              },
            ],
          },
          {
            heading: 'Mode Chips & Area Filtering',
            content: [
              'Toggle Metro, Rail, Tram, and Bus chips independently to match how you want to move across a city.',
              'If you dropped a circular radius pin on the map using Speed Dial → DROP WAYPOINT, toggle Area Filter ON in the Transit tab header to restrict nearby stops and lines exclusively to that neighborhood.',
            ],
            steps: [
              'Ensure the city’s GTFS feed is imported and compiled (Paladio shows feed compilation status directly inside the Transit tab and under Settings → Public Transit & GTFS).',
              'Choose Directions, pick origin/destination stops, set Depart at or Arrive by, and press Get Directions.',
              'Inspect line transfers, stop counts, and walking transfers directly beside your map.',
            ],
          },
        ],
        relatedArticleIds: ['valhalla-routing-coverage', 'editing-timeline-locks'],
      },
      {
        id: 'valhalla-routing-coverage',
        categoryId: 'routes',
        title: 'Valhalla Street Graph & GTFS Feed Management',
        excerpt:
          'How Paladio combines self-hosted Valhalla foot/road routing with city GTFS datasets under Settings → Public Transit & GTFS.',
        readTime: '3 min',
        badge: 'INFRASTRUCTURE',
        difficulty: 'Detailed',
        tldr: 'Paladio runs its own self-hosted Valhalla routing container for realistic street-level walking/driving distances and compiles GTFS feeds inside Settings → Public Transit & GTFS.',
        sections: [
          {
            heading: 'Self-Hosted Routing Without Rate Limits',
            content: [
              'Distance and travel-time matrices between itinerary stops are calculated against a local Valhalla routing service backed by OpenStreetMap extracts.',
              'Because the street matrix and GTFS transit schedule graphs live inside your self-hosted deployment, iterative route solving and map editing stay fast and private.',
            ],
            callout: {
              type: 'important',
              text: 'Adding a new region or checking loaded GTFS transit archives is handled under Settings (/config) → Public Transit & GTFS.',
            },
          },
        ],
        relatedArticleIds: ['public-transit-gtfs', 'settings-overview'],
      },
    ],
  },
  {
    id: 'wallet',
    title: 'Bookings Wallet & Passes',
    subtitle:
      'Keep boarding passes, hotel keys, timed-entry tickets, Apple Wallet .pkpass bundles, and QR/barcodes organized inside your expedition.',
    iconName: 'wallet',
    articles: [
      {
        id: 'wallet-overview-dropzone',
        categoryId: 'wallet',
        title: 'Bookings Wallet, Dropzone & Passbook Sync',
        excerpt:
          'Upload PDFs, images, text confirmations, or .pkpass files in the Wallet tab and link tickets directly to your itinerary stops.',
        readTime: '3 min',
        badge: 'WALLET',
        difficulty: 'Quick Guide',
        tldr: 'Open the Wallet tab in any trip, drag files or paste booking text into the WalletDropzone (or click + ADD PASS), and run SYNC ITINERARY to attach passes to matching stops.',
        mockupType: 'wallet-passbook',
        screenshotUrl: '/help-screenshots/wallet.png',
        screenshotCaption:
          'Trip Wallet tab showing TOTAL TICKETS counters, SYNC ITINERARY / + ADD PASS actions, Up Next highlight card, WalletDropzone, and category filters.',
        sections: [
          {
            heading: 'Importing Tickets via Dropzone or + ADD PASS',
            content: [
              'Paladio’s deterministic booking parser extracts flight numbers, PNR confirmation codes, dates, terminal/gate metadata, and QR/barcode payloads locally—without needing external AI credits.',
            ],
            steps: [
              'Open your trip workspace and select the Wallet tab in the header.',
              'Drag & drop a PDF, PNG, JPG, WEBP, TXT, or Apple Wallet .pkpass file onto the WalletDropzone—or click + ADD PASS to paste raw confirmation email text.',
              'Review the parsed ticket details and save it into your expedition Wallet.',
              'Click SYNC ITINERARY (or RE-SYNC ITINERARY after schedule changes) to match tickets against your flights, stays, and attraction stops.',
            ],
          },
          {
            heading: 'Supported Formats & Up Next Banner',
            content: [
              'Your upcoming departure or next timed reservation surfaces automatically inside the Up Next hero banner (WalletUpNext) alongside contextual transit advisories.',
            ],
            parameterTable: [
              {
                term: 'Accepted File Types',
                meaning: 'Direct upload and local extraction support across document and wallet formats.',
                rangeOrType: 'PDF, PNG, JPG, WEBP, TXT, .pkpass',
                defaultOrExample: 'Also supports pasted confirmation text',
              },
              {
                term: 'Wallet Categories',
                meaning: 'Filter passes by type using the top bar counters and filter pills.',
                rangeOrType: 'All Tickets | Flights | Stays & Keys | Attractions | Transit | Other',
                defaultOrExample: 'Includes instant search box',
              },
            ],
          },
        ],
        relatedArticleIds: ['managing-ticket-filters', 'trip-configuration-sharing'],
      },
      {
        id: 'managing-ticket-filters',
        categoryId: 'wallet',
        title: 'Filtering Passes, Barcodes & Private Exports',
        excerpt:
          'Display high-contrast QR/barcodes at boarding gates and control whether private passes are included in .trip exports.',
        readTime: '2 min',
        badge: 'SECURITY',
        difficulty: 'Quick Guide',
        tldr: 'Filter Wallet passes by category or keyword, open fullscreen scannable codes on mobile, and choose Full Vault vs Shareable when exporting a .trip archive.',
        sections: [
          {
            heading: 'Fast Gate Access & Fullscreen Codes',
            content: [
              'Tap any ticket card in the Wallet grid to inspect booking references, seat/gate details, and scannable QR or barcode payloads.',
              'Use the filter pills (Flights, Stays & Keys, Attractions, Transit, Other) or the search input when carrying dozens of museum entries and rail reservations.',
            ],
            callout: {
              type: 'important',
              text: 'When exporting via Share Expedition → Paladio Package (.trip), select Full Vault to back up private Wallet files, or choose Shareable to share the itinerary without exposing personal tickets or receipts.',
            },
          },
        ],
        relatedArticleIds: ['wallet-overview-dropzone', 'trip-configuration-sharing'],
      },
    ],
  },
  {
    id: 'monitoring',
    title: 'Route Price Monitoring',
    subtitle:
      'Automate round-trip flight and stay fare telemetry, catch verified P10 deal drops, inspect price calendars, and turn deals into trips.',
    iconName: 'monitoring',
    articles: [
      {
        id: 'monitoring-telemetry',
        categoryId: 'monitoring',
        title: 'Route Price & Tariff Telemetry Explained',
        excerpt:
          'Watch origin-destination routes continuously, spot VERIFIED DEAL PACKAGE FOUND alerts below P10 targets, and launch /engine with one click.',
        readTime: '4 min',
        badge: 'NEW FEATURE',
        difficulty: 'Quick Guide',
        tldr: 'Open Route Monitoring (/monitoring), click + Monitor Route to watch an origin/destination pair, and click Make it a Trip → whenever a Verified Deal Package beats the P10 target.',
        mockupType: 'route-monitoring',
        screenshotUrl: '/help-screenshots/monitoring.png',
        screenshotCaption:
          'Route Price & Tariff Telemetry page showing KPI cards (Monitored Routes, Open Deal Alerts, Ticks Scanned Today, Average Savings), Verified Deal packages, and route table.',
        sections: [
          {
            heading: 'Tracking Routes & Reading KPI Cards',
            content: [
              'Paladio’s Celery Beat background worker periodically scans fares and hotel pairing rates for every route you register in Route Monitoring (/monitoring).',
            ],
            parameterTable: [
              {
                term: 'Monitored Routes',
                meaning: 'Total active and paused origin-destination corridors currently tracked.',
                rangeOrType: 'KPI Counter',
                defaultOrExample: 'Add via + Monitor Route',
              },
              {
                term: 'Open Deal Alerts',
                meaning: 'Current offers dropping below the 10th-percentile (Below P10 Target) historical threshold.',
                rangeOrType: 'Deal Counter',
                defaultOrExample: 'Verified against 30D baseline',
              },
              {
                term: 'Ticks Scanned Today',
                meaning: 'Number of fare/hotel telemetry snapshots collected during the current cycle.',
                rangeOrType: 'Telemetry Volume',
                defaultOrExample: 'Logged automatically by Beat worker',
              },
              {
                term: 'Average Savings',
                meaning: 'Mean discount percentage comparing current package deals against the 30-day median (vs 30D Median).',
                rangeOrType: '% Discount Metric',
                defaultOrExample: 'Displayed alongside VERIFIED DEAL packages',
              },
            ],
          },
          {
            heading: 'Acting on VERIFIED DEAL PACKAGE FOUND',
            content: [
              'When an origin-destination pair hits an exceptional combined Flight + Hotel rate below target, Paladio surfaces a VERIFIED DEAL PACKAGE FOUND banner displaying the Landed Package price, 30D Median comparison, and % OFF savings.',
            ],
            steps: [
              'Click + Monitor Route on /monitoring to define origin, destination, date flexibility, and target budget.',
              'Review incoming VERIFIED DEAL PACKAGE FOUND banners or click Discard Offer to dismiss deals that do not fit your schedule.',
              'Click Make it a Trip → on a verified package to jump straight into New Trip (/engine) pre-populated with the route and deal dates.',
            ],
            callout: {
              type: 'tip',
              text: 'Active deals also appear directly on Control Center (/dashboard) inside the Best Offer Card and highlighted Calendar dates.',
            },
          },
        ],
        relatedArticleIds: ['inspecting-price-history', 'planning-first-trip', 'welcome-to-paladio'],
      },
      {
        id: 'inspecting-price-history',
        categoryId: 'monitoring',
        title: 'Inspecting Trend Charts & Monthly Price Calendars',
        excerpt:
          'Filter routes by Deals/Active/Paused, read VerdictBadges, and open Inspect for 24h/7d/30d/90d charts and multi-month calendars.',
        readTime: '3 min',
        badge: 'ANALYTICS',
        difficulty: 'Helpful',
        tldr: 'Use the All / Deals / Active / Paused tabs and click Inspect on any monitored route to examine historical 24h–90d price trends and the multi-month price calendar.',
        sections: [
          {
            heading: 'Route Filters, VerdictBadges & Full-Screen Inspect',
            content: [
              'Use the filter pills (All, Deals, Active, Paused) above the route table to triage active watchers or review paused destinations.',
              'Each row displays a VerdictBadge summarizing whether current tariffs sit high, average, or at a rare dip. Clicking Inspect opens an interactive drill-down with 24h, 7d, 30d, and 90d historical price curves plus a multi-month departure calendar highlighting the cheapest date windows.',
            ],
            callout: {
              type: 'important',
              text: 'Scraping cadences, provider settings, and P10 sensitivity parameters can be configured in Settings (/config) → Deal Engine & Scraping.',
            },
          },
        ],
        relatedArticleIds: ['monitoring-telemetry', 'settings-overview'],
      },
    ],
  },
  {
    id: 'costs',
    title: 'Costs & Group Splitting',
    subtitle:
      'Compare actual expenses against your target budget, convert currencies with the wheel picker, claim route admissions, and settle crew balances.',
    iconName: 'wallet',
    articles: [
      {
        id: 'budget-tracking-currency',
        categoryId: 'costs',
        title: 'Tracking Total Spend, Multi-Currency & Admissions',
        excerpt:
          'Read the summary cards, switch currencies in real time with Live Currency Exchange, assign estimated stop fees, and export CSV ledgers.',
        readTime: '3 min',
        badge: 'BUDGETING',
        difficulty: 'Quick Guide',
        tldr: 'The Costs tab tracks Total trip spend against your target budget, converts live via the Live Currency Exchange card (LIVE ECB), lets you Assign planned route estimates into expenses, and exports CSV reports.',
        mockupType: 'cost-knapsack',
        screenshotUrl: '/help-screenshots/costs.png',
        screenshotCaption:
          'Trip Costs tab showing Live Currency Exchange (LIVE ECB), summary KPI cards, category breakdown, and itemized expenses.',
        sections: [
          {
            heading: 'Cost Summary Cards & Category Breakdown',
            content: [
              'At the top of /trips/[id] → Costs, Live Currency Exchange and the financial summary cards give an immediate snapshot across solo and group expeditions:',
            ],
            parameterTable: [
              {
                term: 'Pending costs / All costs paid',
                meaning: 'Counts estimated itinerary admission fees that have not yet been assigned as paid expenses.',
                rangeOrType: 'Admission Tracker',
                defaultOrExample: 'Clear via Assign buttons',
              },
              {
                term: 'You owe / You’re owed / All settled up',
                meaning: 'Live net balance across companions listed in your Crew Roster.',
                rangeOrType: 'Group Balance',
                defaultOrExample: 'Updated per split rule',
              },
              {
                term: 'Total trip spend',
                meaning: 'Cumulative expenses plotted against the trip’s TARGET BUDGET and base currency.',
                rangeOrType: 'Budget KPI',
                defaultOrExample: 'Pair with Category Breakdown chart',
              },
            ],
          },
          {
            heading: 'Live Currency Exchange, Assigning Route Estimates & CSV Export',
            content: [
              'Use the Live Currency Exchange card (powered by live ECB rates, featuring the CurrencyWheelPicker selector) in the Costs view to preview totals and expenses converted into any supported currency without altering underlying receipts.',
              'Under Expenses, planned itinerary stops that carry estimated ticket prices appear tagged UNFINISHED / ROUTE ESTIMATE (UNASSIGNED): click Assign to convert an estimated venue fee directly into a recorded expense with payer and split assignments instead of typing it twice.',
              'Need an external spreadsheet for reimbursement or tax records? Click Export CSV in the Costs ledger header.',
            ],
          },
        ],
        relatedArticleIds: ['settling-crew-debts', 'trip-configuration-sharing'],
      },
      {
        id: 'settling-crew-debts',
        categoryId: 'costs',
        title: 'Splitting Bills & Settling Group Balances',
        excerpt:
          'Log who paid with Add expense, split costs across travelers in your Crew Roster, and compute simplified payouts with Settle up.',
        readTime: '2 min',
        badge: 'GROUP SPLIT',
        difficulty: 'Quick Guide',
        tldr: 'Record shared meals, stays, and transit with Add expense, then open Settle up to see the fewest transfers needed to bring everyone’s balance to zero.',
        sections: [
          {
            heading: 'Recording Shared Expenses & Settling Up',
            content: [
              'Every companion added to the trip’s Travelers list (under /engine or Configuration → Crew Roster) can act as payer or split participant inside Costs.',
            ],
            steps: [
              'Click Add expense in the Costs view, enter the amount, currency, category, and date.',
              'Select who covered the bill and toggle which Crew Roster travelers share the expense.',
              'Click Settle up whenever you want Paladio to simplify cross-debts into direct payout instructions.',
            ],
          },
        ],
        relatedArticleIds: ['budget-tracking-currency', 'trip-configuration-sharing'],
      },
    ],
  },
  {
    id: 'map',
    title: 'Trip Archive, Vault & Photos',
    subtitle:
      'Review completed journeys on the world VaultMap, read lifetime travel telemetry, open /vault/[id] recaps, and manage Photos.',
    iconName: 'map',
    articles: [
      {
        id: 'trip-archive-vault',
        categoryId: 'map',
        title: 'Using Trip Archive (/vault) & Lifetime Telemetry',
        excerpt:
          'Explore your global footprint on VaultMap and inspect All missions, DAYS LOGGED, Countries visited, and Earth-circumference distance progress.',
        readTime: '3 min',
        badge: 'VAULT',
        difficulty: 'Quick Guide',
        tldr: 'Open Trip Archive (/vault) from main navigation to see completed expeditions mapped worldwide alongside the collapsible General statistics drawer.',
        screenshotUrl: '/help-screenshots/vault.png',
        screenshotCaption:
          'Trip Archive (/vault) displaying VaultMap country coverage and the General statistics drawer with days logged, sites visited, and Earth circumference gauge.',
        sections: [
          {
            heading: 'VaultMap & General Statistics Drawer',
            content: [
              'Marking any expedition Completed (Archived in Vault) inside its Configuration tab automatically moves it into your permanent Trip Archive (/vault).',
              'Inside /vault, click anywhere on a mapped country or expedition marker to jump to its recap, or expand the left General statistics panel to explore lifetime travel metrics calculated dynamically from your journeys.',
            ],
            parameterTable: [
              {
                term: 'All missions & DAYS LOGGED',
                meaning: 'Total completed trips, aggregate days traveled, and sites visited.',
                rangeOrType: 'Lifetime Telemetry',
                defaultOrExample: 'Computed from completed trips',
              },
              {
                term: 'Countries visited',
                meaning: 'Unique sovereign destinations logged across your VaultMap footprint.',
                rangeOrType: 'Country Counter',
                defaultOrExample: 'Includes Most engaged top list',
              },
              {
                term: 'Earth Distance Gauge',
                meaning: 'Compares cumulative distance traveled against Earth’s 40,075 km equator circumference.',
                rangeOrType: 'Progress Arc',
                defaultOrExample: 'Distance vs 40,075 km benchmark',
              },
              {
                term: 'Monthly Breakdown',
                meaning: 'Chronological monthly travel log of missions completed across the year.',
                rangeOrType: 'Monthly Table',
                defaultOrExample: 'Visible in General statistics drawer',
              },
            ],
          },
        ],
        relatedArticleIds: ['completed-recaps-photos', 'trip-configuration-sharing'],
      },
      {
        id: 'completed-recaps-photos',
        categoryId: 'map',
        title: 'Completed Trip Recaps (/vault/[id]) & Photos Tab',
        excerpt:
          'Inspect read-only About, Itinerary, Costs, and Photos recaps for past expeditions or upload galleries via local storage, Immich, or Synology NAS.',
        readTime: '3 min',
        badge: 'RECAPS & MEDIA',
        difficulty: 'Helpful',
        tldr: 'Completed trips open a clean recap at /vault/[id] with About, Itinerary, Costs, and Photos tabs; active and archived trips alike support gallery uploads and NAS/Immich sync.',
        sections: [
          {
            heading: 'Recap Structure & Re-Opening the Live Workspace',
            content: [
              'Selecting an archived expedition opens /vault/[id] with four dedicated recap tabs: About, Itinerary, Costs, and Photos.',
              'If you need to inspect raw map telemetry or adjust something in an archived trip, you can always append ?workspace=1 to open the workspace view without un-archiving it.',
            ],
          },
          {
            heading: 'Managing Trip Photos',
            content: [
              'Inside any trip’s Photos tab, upload full-resolution images locally or connect external self-hosted galleries (such as Immich or Synology Photo integration settings) to pull albums into your trip chronicle.',
            ],
          },
        ],
        relatedArticleIds: ['trip-archive-vault', 'navigating-trip-workspace'],
      },
    ],
  },
  {
    id: 'assistant',
    title: 'AI Travel Assistant',
    subtitle:
      'Use the conversational Paladio Agent inside Plan → Agent with structured diff previews, 5-minute approval safeguards, and instant Undo.',
    iconName: 'bot',
    articles: [
      {
        id: 'using-paladio-agent',
        categoryId: 'assistant',
        title: 'Conversing with the Paladio Agent',
        excerpt:
          'Where the optional chat agent fits next to deterministic C++20 optimization, supported local/cloud LLM providers, and Clear Chat History.',
        readTime: '3 min',
        badge: 'PALADIO AGENT',
        difficulty: 'Quick Guide',
        tldr: 'Open Plan → Agent inside a trip to chat with the Paladio Agent, switch models via the header pill, or reset context with Clear Chat History. Trip math stays deterministic in C++20.',
        mockupType: 'swarm-assistant',
        sections: [
          {
            heading: 'Where the Agent Runs & Supported LLM Providers',
            content: [
              'Paladio strictly separates deterministic scheduling from optional conversational AI: C++20 optimization, free-text booking extraction, and on-device CPU embeddings work without any external LLM.',
              'When you open the Agent tab inside a trip’s Plan sidebar, you can pick an active model from the header pill and ask for neighborhood swaps, rainy-day backups, dining adjustments, or multi-stop additions.',
              'Paladio supports local Ollama and Custom OpenAI / vLLM endpoints as well as OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, Mistral, OpenRouter, xAI, Together, and Cerebras (configured under Settings → AI & LLM Engine).',
            ],
            steps: [
              'Open your trip workspace → Plan → Agent tab.',
              'Verify or change the active LLM model using the model selector pill in the Agent header.',
              'Describe what you want changed (for example, swapping an outdoor afternoon stop for an indoor museum or cafe near your hotel).',
              'Use Clear Chat History in the header whenever you want to start a fresh reasoning thread.',
            ],
          },
        ],
        relatedArticleIds: ['approving-agent-proposals', 'settings-overview'],
      },
      {
        id: 'approving-agent-proposals',
        categoryId: 'assistant',
        title: 'Confirmation Required, 5-Minute Expiry & Instant Undo',
        excerpt:
          'Why Paladio Agent never edits your trip silently—inspecting ProposalCards, countdown timers, Approve Change / Reject buttons, and Undo toasts.',
        readTime: '3 min',
        badge: 'SAFETY',
        difficulty: 'Helpful',
        tldr: 'Every itinerary mutation proposed by the Agent requires explicit confirmation via a ProposalCard with an Expires in 5:00 timer and Reject / Approve Change controls—plus an Undo toast afterward.',
        sections: [
          {
            heading: 'Human-in-the-Loop Proposal Safeguards',
            content: [
              'To guarantee AI suggestions can never corrupt locked reservations or silently overwrite your schedule, every itinerary mutation pauses at a structured confirmation card before touching PostgreSQL.',
            ],
            parameterTable: [
              {
                term: 'CONFIRMATION REQUIRED Badge',
                meaning: 'Highlights proposals waiting for your decision with an itemized diff preview of additions, removals, or moves.',
                rangeOrType: 'Proposal Card',
                defaultOrExample: 'No background auto-apply',
              },
              {
                term: 'Expires in M:SS Timer',
                meaning: 'Live 5-minute countdown ensuring stale proposals against older itinerary states cannot apply later by accident.',
                rangeOrType: '5-Minute TTL',
                defaultOrExample: 'Regenerate prompt if expired',
              },
              {
                term: 'Approve Change / Reject',
                meaning: 'Commit the exact diff to your itinerary or discard it without side effects.',
                rangeOrType: 'Decision Controls',
                defaultOrExample: 'Explicit user click required',
              },
              {
                term: 'Instant Undo Toast',
                meaning: 'ChangeToast notification appearing right after approval so you can revert the entire change in one click.',
                rangeOrType: 'Post-Apply Revert',
                defaultOrExample: 'Reverses approved snapshot',
              },
            ],
          },
        ],
        relatedArticleIds: ['using-paladio-agent', 'editing-timeline-locks'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & Infrastructure',
    subtitle:
      'Configure personal account options, solver defaults, GTFS feeds, deal scraping, 12 LLM providers, ML Taste Learning, and self-hosted admin tools in /config.',
    iconName: 'settings',
    articles: [
      {
        id: 'settings-overview',
        categoryId: 'settings',
        title: 'Navigating Settings (/config) Across All Four Groups',
        excerpt:
          'Complete reference for Workspace & Experience, Travel Engine & Optimization, AI & Swarm Intelligence, and Sovereign Infrastructure & Admin.',
        readTime: '4 min',
        badge: 'CONFIGURATION',
        difficulty: 'Detailed',
        tldr: 'Open Settings (/config) from the bottom-left UserMenu to manage Workspace, Solver & GTFS feeds, AI/LLM providers, Taste/RAG embeddings, backups, containers, and secrets.',
        screenshotUrl: '/help-screenshots/config.png',
        screenshotCaption:
          'Settings (/config) view organized into Workspace & Experience, Travel Engine & Optimization, AI & Swarm Intelligence, and Sovereign Infrastructure & Admin.',
        sections: [
          {
            heading: 'The Four Settings Categories',
            content: [
              'All global preferences and self-hosted infrastructure controls are grouped into four sections inside /config:',
            ],
            parameterTable: [
              {
                term: 'Workspace & Experience',
                meaning: 'Personal Account and Appearance & Interface (theme, UI density, display preferences).',
                rangeOrType: '2 Sub-sections',
                defaultOrExample: 'User profile & visual theme',
              },
              {
                term: 'Travel Engine & Optimization',
                meaning: 'Solver Constraints & Pacing, Public Transit & GTFS (import/compile feeds), and Deal Engine & Scraping.',
                rangeOrType: '3 Sub-sections',
                defaultOrExample: 'Core engine & route monitoring',
              },
              {
                term: 'AI & Swarm Intelligence',
                meaning: 'AI & LLM Engine (12 providers including Ollama/vLLM), Agent Swarms & Critic, and ML Taste Learning & RAG.',
                rangeOrType: '3 Sub-sections',
                defaultOrExample: 'Optional chat models & ONNX RAG',
              },
              {
                term: 'Sovereign Infrastructure & Admin',
                meaning: 'Authorized Users, System Updates, Container Telemetry, Data Vault & Backups, Notification, and API Keys & Secrets.',
                rangeOrType: '6 Sub-sections',
                defaultOrExample: 'Self-hosted operations & secrets',
              },
            ],
            callout: {
              type: 'tip',
              text: 'If you run Paladio solely for deterministic route planning, booking parsing, and local embeddings, you do not need to enter any external generative LLM API keys.',
            },
          },
        ],
        relatedArticleIds: ['valhalla-routing-coverage', 'using-paladio-agent', 'monitoring-telemetry'],
      },
    ],
  },
  {
    id: 'glossary',
    title: 'Glossary & Concepts',
    subtitle:
      'Clear, verified definitions of Paladio’s technical engines, file formats, and travel metrics without jargon.',
    iconName: 'book',
    articles: [
      {
        id: 'paladio-concepts-glossary',
        categoryId: 'glossary',
        title: 'Paladio Core Concepts & Terminology',
        excerpt:
          'Definitions for TSPTW Solver, Valhalla, GTFS, Taste Star, P10 Target, .trip packages, and local ONNX embeddings.',
        readTime: '3 min',
        badge: 'REFERENCE',
        difficulty: 'Quick Guide',
        tldr: 'Quick reference for every core system and metric referenced throughout the Paladio interface.',
        sections: [
          {
            heading: 'Engines, Telemetry & Formats',
            content: [
              'Use this table whenever you encounter a specialized term across Control Center, New Trip, Trip Workspace, Route Monitoring, or Settings.',
            ],
            parameterTable: [
              {
                term: 'TSPTW (C++20 Solver)',
                meaning: 'Traveling Salesman Problem with Time Windows implemented in paladio_core for deterministic stop ordering.',
                rangeOrType: 'Core Algorithm',
                defaultOrExample: 'Runs under 50ms for typical daily graphs',
              },
              {
                term: 'Valhalla',
                meaning: 'Self-hosted OpenStreetMap routing container providing walking and driving legs without external API limits.',
                rangeOrType: 'Routing Engine',
                defaultOrExample: 'Powers Route timelines & distance matrices',
              },
              {
                term: 'GTFS',
                meaning: 'General Transit Feed Specification schedules imported locally to power Directions, Lines, and Nearby departures.',
                rangeOrType: 'Transit Standard',
                defaultOrExample: 'Managed in Settings → Public Transit & GTFS',
              },
              {
                term: 'Taste Star',
                meaning: '8-axis personal travel preference radar learned from saved collections and historical trips.',
                rangeOrType: 'Preference Profile',
                defaultOrExample: 'Shown on Control Center (/dashboard)',
              },
              {
                term: 'P10 Target (30D Median)',
                meaning: 'The 10th-percentile low price threshold compared against the 30-day median in Route Monitoring.',
                rangeOrType: 'Telemetry Metric',
                defaultOrExample: 'Triggers Open Deal Alerts',
              },
              {
                term: 'Paladio Package (.trip)',
                meaning: 'Portable expedition archive downloadable in Full Vault or Shareable mode and importable in New Trip.',
                rangeOrType: 'Archive Format',
                defaultOrExample: 'Contains JSON, timeline, optional Wallet files',
              },
              {
                term: 'ONNX Embeddings (RAG)',
                meaning: 'Local CPU 768-dimensional semantic vectors used for POI taste matching without calling cloud LLMs.',
                rangeOrType: 'Local ML Search',
                defaultOrExample: 'In-process CPU embedding model',
              },
            ],
          },
        ],
        relatedArticleIds: ['welcome-to-paladio', 'planning-first-trip', 'settings-overview'],
      },
    ],
  },
];
