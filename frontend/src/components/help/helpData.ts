export interface HelpArticle {
  id: string;
  categoryId: string;
  title: string;
  excerpt: string;
  readTime: string;
  badge?: string;
  difficulty?: 'Quick Guide' | 'Helpful' | 'Detailed';
  tldr: string;
  mockupType?: 'timeline' | 'route-comparison' | 'realism-radar' | 'cost-knapsack' | 'swarm-assistant';
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
    subtitle: 'Learn what Paladio does, how it organizes your travel, and how to create your first stress-free itinerary in minutes.',
    iconName: 'compass',
    articles: [
      {
        id: 'what-is-paladio',
        categoryId: 'getting-started',
        title: 'What is Paladio?',
        excerpt: 'Paladio is your private travel companion that designs realistic, enjoyable trips without rushed schedules or impossible routes.',
        readTime: '3 min',
        badge: 'OVERVIEW',
        difficulty: 'Quick Guide',
        tldr: 'Unlike generic travel apps, Paladio plans trips based on actual opening hours, real walking distances, and reasonable daily paces, keeping your private plans completely on your own device.',
        screenshotUrl: '/help-screenshots/dashboard.png',
        screenshotCaption: 'The Paladio Control Center showing your active trips, upcoming destinations, and trip health radar.',
        sections: [
          {
            heading: 'Why Paladio Feels Different',
            content: [
              'Most travel guides and chatbots suggest long lists of tourist spots without considering how far apart they are or whether you will actually have time to eat lunch. You end up rushing between opposite sides of the city, standing in front of closed doors, or feeling completely exhausted by afternoon.',
              'Paladio was designed to solve this. It acts like an experienced local guide who knows the city map: it groups nearby places together, checks when attractions are open, makes sure you have time for relaxing meals, and keeps travel walking to a minimum.',
            ],
            callout: {
              type: 'important',
              text: 'Private & Secure: Everything in Paladio is stored securely on your own system. Your travel dates, personal notes, and preferences are never sold or sent to third-party advertising services.',
            },
          },
          {
            heading: 'The Three Main Tools You Will Use',
            content: [
              'Whenever you open a trip, you will see three simple, connected views:',
              '1. The Map: Shows your destinations as colored pins for each day with clear route lines so you can see where you are going.',
              '2. The Daily Schedule: A clear timeline showing when to arrive at each place, how long to stay, and how many minutes of walking or transit to expect.',
              '3. The Budget Tracker: Keeps an eye on your spending, converts prices into your home currency, and helps split costs if you travel with friends.',
            ],
          },
        ],
        relatedArticleIds: ['quickstart-tour', 'creating-trips', 'smart-organization'],
      },
      {
        id: 'quickstart-tour',
        categoryId: 'getting-started',
        title: 'Planning Your First Trip',
        excerpt: 'Follow this simple step-by-step walkthrough to plan your first complete itinerary in under three minutes.',
        readTime: '4 min',
        badge: 'WALKTHROUGH',
        difficulty: 'Quick Guide',
        tldr: 'Choose your destination city, pick your travel dates, choose your preferred pace, and let Paladio create a balanced daily plan you can customize.',
        screenshotUrl: '/help-screenshots/engine.png',
        screenshotCaption: 'The Trip Creator wizard where you set your destination, dates, pace, and starting hotel.',
        sections: [
          {
            heading: 'Step 1: Start a New Trip',
            content: [
              'From your dashboard or the sidebar, click New Trip. Enter the city you want to visit (such as Tokyo, Paris, or Madrid), then select your departure and return dates.',
            ],
            steps: [
              'Type your destination city in the search box and select it from the list.',
              'Pick your travel dates on the calendar.',
              'Choose your daily pace: Relaxed (2 to 3 stops per day), Balanced (4 to 5 stops per day), or Active (6 or more stops).',
              'Set your starting point (such as your hotel or central train station).',
              'Click Create Itinerary to let Paladio prepare your initial schedule.',
            ],
          },
          {
            heading: 'Step 2: Review and Personalize',
            content: [
              'Paladio will present your day-by-day plan. You can drag and drop activities to change their order, click on any place to see photos and opening hours, or add places you specifically want to see.',
              'If you have reservations with a strict time (like a museum ticket at 2:00 PM), click the Lock button. Paladio will freeze that time and build the rest of your day comfortably around it.',
            ],
            callout: {
              type: 'tip',
              text: 'Check the Comfort Score in the top corner. A score of 9.0 or higher means your days have plenty of breathing room, guaranteed meal breaks, and comfortable walking distances.',
            },
          },
        ],
        relatedArticleIds: ['creating-trips', 'activity-locking', 'realism-score'],
      },
    ],
  },
  {
    id: 'trips',
    title: 'Managing Your Trip',
    subtitle: 'Everything about customizing your schedule, locking reservations, avoiding conflicts, and exporting offline guides.',
    iconName: 'calendar',
    articles: [
      {
        id: 'creating-trips',
        categoryId: 'trips',
        title: 'Setting Up a New Trip',
        excerpt: 'How destination anchors, travel pace, traveler count, and budget settings shape your itinerary.',
        readTime: '3 min',
        badge: 'SETUP',
        difficulty: 'Quick Guide',
        tldr: 'Setting your hotel location and choosing the right pace ensures your daily travel starts and ends at your doorstep with sensible walking distances.',
        screenshotUrl: '/help-screenshots/engine.png',
        screenshotCaption: 'Configuring trip preferences: travel pace, party size, and morning hotel departure anchor.',
        sections: [
          {
            heading: 'What the Setup Options Mean',
            content: [
              'When creating a trip, a few simple settings help Paladio tailor the schedule to your travel style:',
            ],
            parameterTable: [
              { term: 'Destination', meaning: 'The city or region you are visiting.', rangeOrType: 'City name', defaultOrExample: 'Madrid, Spain' },
              { term: 'Pace Style', meaning: 'How many places you visit each day and how much you walk.', rangeOrType: 'Relaxed / Balanced / Active', defaultOrExample: 'Balanced (about 8–10 km/day)' },
              { term: 'Morning Hotel', meaning: 'Where your day starts and ends each evening.', rangeOrType: 'Hotel name or address', defaultOrExample: 'Central Station Hotel' },
              { term: 'Travelers', meaning: 'Number of people in your group to calculate ticket totals and split shared costs.', rangeOrType: '1 or more', defaultOrExample: '2 travelers' },
              { term: 'Budget Limit', meaning: 'An optional spending ceiling for sightseeing and dining.', rangeOrType: 'Amount in your currency', defaultOrExample: '$1,500' },
            ],
          },
        ],
        relatedArticleIds: ['day-timeline', 'activity-locking'],
      },
      {
        id: 'day-timeline',
        categoryId: 'trips',
        title: 'Using the Day-by-Day Timeline',
        excerpt: 'How to read your daily schedule, check walking times, adjust how long you stay, and reorder stops.',
        readTime: '4 min',
        badge: 'WORKSPACE',
        difficulty: 'Helpful',
        tldr: 'The timeline displays your day in chronological order. Each card shows when you will arrive, how long you plan to stay, and the walking time to your next stop.',
        screenshotUrl: '/help-screenshots/trip-workspace.png',
        screenshotCaption: 'The trip workspace showing the interactive map on the left and the chronological timeline with transit badges on the right.',
        mockupType: 'timeline',
        sections: [
          {
            heading: 'Reading the Daily Timeline',
            content: [
              'Each card on the timeline represents a stop during your day. Between every stop, you will see a transit badge showing the estimated walking or transit time.',
            ],
            steps: [
              'Drag and drop any activity card up or down to change the order.',
              'Click the duration badge (e.g., "1h 30m") to give yourself more or less time at a sight.',
              'Click the Lock button to keep a booked reservation fixed at an exact time.',
              'Hover over the transit badge between cards to see the walking route highlighted on the map.',
            ],
            callout: {
              type: 'tip',
              text: 'Look for the Lunch and Dinner badges on the timeline. Paladio automatically saves time for meals so you never have to skip eating because of a packed schedule.',
            },
          },
        ],
        relatedArticleIds: ['activity-locking', 'conflict-resolution', 'smart-organization'],
      },
      {
        id: 'activity-locking',
        categoryId: 'trips',
        title: 'Locking Important Reservations',
        excerpt: 'How to lock ticketed times like museum admissions or flights so Paladio organizes other sights around them.',
        readTime: '3 min',
        badge: 'KEY FEATURE',
        difficulty: 'Quick Guide',
        tldr: 'Click the Lock icon on any activity with a fixed reservation. Paladio freezes that time and automatically moves flexible sights around it.',
        sections: [
          {
            heading: 'Fixed Reservations vs Flexible Visits',
            content: [
              'Some travel events have strict, non-negotiable times: an afternoon flight, a pre-booked cathedral ticket at 10:30 AM, or a special dinner reservation.',
              'Other activities are flexible: visiting a public park, shopping along a famous avenue, or seeing an open monument.',
              'When you click the Lock icon on any card, that activity is pinned to that exact time. If you later reorder your day or add new stops, Paladio guarantees your locked reservation never moves and keeps your schedule on time.',
            ],
            callout: {
              type: 'important',
              text: 'Always lock your pre-booked tickets, train departures, and flights first so Paladio can optimize the rest of your day around them.',
            },
          },
        ],
        relatedArticleIds: ['day-timeline', 'conflict-resolution'],
      },
      {
        id: 'conflict-resolution',
        categoryId: 'trips',
        title: 'Preventing Schedule Conflicts',
        excerpt: 'How Paladio warns you if an attraction closes early, if travel times are too tight, or if activities overlap.',
        readTime: '3 min',
        badge: 'ALERTS',
        difficulty: 'Helpful',
        tldr: 'If you drag an activity to a time when a venue is closed or if you don\'t have enough transit time, Paladio flags it with a clear warning so you can fix it before you travel.',
        sections: [
          {
            heading: 'Never Stand in Front of a Closed Door',
            content: [
              'Paladio continuously cross-references your planned arrival times with official opening days and closing hours. If an activity is scheduled outside open hours, an Amber or Red alert badge appears on the card.',
              'Clicking "Auto-Fix" adjusts your visiting order or slides activities forward so you arrive when the venue is open and welcoming visitors.',
            ],
          },
        ],
        relatedArticleIds: ['activity-locking', 'smart-organization'],
      },
      {
        id: 'exporting-dossiers',
        categoryId: 'trips',
        title: 'Saving & Taking Trips Offline',
        excerpt: 'How to print a clean travel guide, download offline GPS watch tracks, and access your itinerary anywhere.',
        readTime: '3 min',
        badge: 'OFFLINE',
        difficulty: 'Quick Guide',
        tldr: 'Export a printable PDF dossier with confirmation numbers and directions, or download a GPX track to navigate turn-by-turn without cellular data.',
        screenshotUrl: '/help-screenshots/vault.png',
        screenshotCaption: 'The Itinerary Vault where you can review, export, and manage your past and upcoming journeys.',
        sections: [
          {
            heading: 'Travel Without Needing Roaming Data',
            content: [
              'International roaming and poor subway reception can leave you without an internet connection. Paladio provides offline-ready export options:',
              '• Printable Travel Dossier: A clean, high-density PDF with your day-by-day plan, addresses, phone numbers, and reservation notes formatted for standard paper printing.',
              '• GPS Watch Track (GPX): Load your route onto your Apple Watch, Garmin, or phone map app (like OsmAnd) for offline walking directions.',
              '• Map Export (KML): View your trip markers and routes in Google Earth or offline mapping apps.',
            ],
          },
        ],
        relatedArticleIds: ['what-is-paladio', 'map-navigation'],
      },
    ],
  },
  {
    id: 'routes',
    title: 'Smart Route Planning',
    subtitle: 'How Paladio groups nearby places, eliminates back-and-forth walking, and keeps your travel days comfortable.',
    iconName: 'route',
    articles: [
      {
        id: 'smart-organization',
        categoryId: 'routes',
        title: 'How Paladio Organizes Your Day',
        excerpt: 'Learn how Paladio puts your stops in the most logical order so you spend time enjoying rather than traveling.',
        readTime: '4 min',
        badge: 'HOW IT WORKS',
        difficulty: 'Helpful',
        tldr: 'Paladio calculates the best order to visit your sights so you move smoothly forward through the city without backtracking, while making sure places are open when you arrive.',
        mockupType: 'route-comparison',
        sections: [
          {
            heading: 'The Secret to a Smooth Travel Day',
            content: [
              'When you pick six places you want to visit in a day, there are hundreds of possible orders to visit them in. A bad order means you waste hours in transit, arrive right as a museum closes, and end up exhausted.',
              'Paladio analyzes the real walking and transit times between all your chosen stops, checks their morning and afternoon opening hours, and arranges them into a clean, logical sequence with comfortable buffers between each stop.',
            ],
            callout: {
              type: 'tip',
              text: 'You never need to calculate transit minutes in your head. Paladio calculates actual street routes and pedestrian paths automatically.',
            },
          },
        ],
        relatedArticleIds: ['ping-pong-avoidance', 'realism-score', 'dynamic-rerouting'],
      },
      {
        id: 'ping-pong-avoidance',
        categoryId: 'routes',
        title: 'Avoiding Back-and-Forth Zigzags',
        excerpt: 'Why standard itineraries make you cross town repeatedly, and how Paladio groups your sights by neighborhood.',
        readTime: '3 min',
        badge: 'COMFORT',
        difficulty: 'Quick Guide',
        tldr: 'Paladio clusters your morning sights in one neighborhood and afternoon sights in another, ensuring you explore smoothly without crisscrossing the city.',
        mockupType: 'route-comparison',
        sections: [
          {
            heading: 'What is "Zigzagging"?',
            content: [
              'Imagine visiting a temple on the West side of town in the morning, taking an hour bus ride East for lunch, traveling back West for a garden, and returning East for dinner. This back-and-forth zigzagging is the number one reason travelers get worn out.',
              'Paladio uses neighborhood clustering: all morning activities stay within walking distance in one district. After lunch, you transition smoothly to your afternoon district, saving you hours of transit each day.',
            ],
          },
        ],
        relatedArticleIds: ['smart-organization', 'realism-score'],
      },
      {
        id: 'realism-score',
        categoryId: 'routes',
        title: 'The Trip Realism & Comfort Score',
        excerpt: 'Understand the 0–10 rating that verifies your day has guaranteed meals, sensible walking, and resting buffers.',
        readTime: '4 min',
        badge: 'SCORE EXPLAINED',
        difficulty: 'Helpful',
        tldr: 'The Realism Score rates how comfortable and practical your day will be in real life. It checks for meal breaks, walking strain, and crowded schedules.',
        mockupType: 'realism-radar',
        sections: [
          {
            heading: 'The 5 Pillars of a Great Travel Day',
            content: [
              'Every day in Paladio is evaluated against five simple health and comfort guidelines:',
              '1. Three Proper Meals: Guarantees a morning coffee or breakfast slot, a sit-down lunch break (at least 45 minutes between 11:30 and 14:00), and a relaxed evening dinner.',
              '2. Sensible Walking Limits: Keeps daily walking distance within comfortable limits based on your pace setting.',
              '3. No Zigzagging: Verifies that your route flows naturally from stop to stop without unnecessary backtracking.',
              '4. Rest & Coffee Buffers: Inserts a relaxing break after intensive sightseeing visits so you don\'t get cultural burnout.',
              '5. Open Hours Guaranteed: Checks that every place is open when you arrive with plenty of time to explore.',
            ],
            parameterTable: [
              { term: 'Score 9.0 to 10.0', meaning: 'Exceptional. Relaxing pace, guaranteed meals, and smooth neighborhood flow.', rangeOrType: 'Green / Ideal', defaultOrExample: 'Target standard' },
              { term: 'Score 7.5 to 8.9', meaning: 'Good, but busy. You may walk a bit more or have a quicker lunch.', rangeOrType: 'Yellow / Fine', defaultOrExample: 'Feasible' },
              { term: 'Score below 7.0', meaning: 'Too rushed. Too much walking or risk of missing closing times.', rangeOrType: 'Red / Alert', defaultOrExample: 'Click Auto-Fix' },
            ],
          },
        ],
        relatedArticleIds: ['smart-organization', 'ping-pong-avoidance'],
      },
      {
        id: 'dynamic-rerouting',
        categoryId: 'routes',
        title: 'Adjusting When Plans Change',
        excerpt: 'What to do if you wake up late, stay longer at a cafe, or get delayed by weather.',
        readTime: '3 min',
        badge: 'ON THE GO',
        difficulty: 'Quick Guide',
        tldr: 'If you linger at a stop or get delayed, click "Adjust Today\'s Schedule". Paladio keeps your booked dinner or flights safe while updating the rest of your day.',
        sections: [
          {
            heading: 'Real Travel Has Surprises',
            content: [
              'You might find a wonderful flea market you want to spend an extra hour in, or rain might delay your morning walk. When this happens, you don\'t have to start your plan from scratch.',
              'Simply click Adjust Today\'s Schedule. Paladio takes your current time into account, skips stops you have already finished, protects any locked evening reservations, and adjusts your afternoon smoothly.',
            ],
          },
        ],
        relatedArticleIds: ['activity-locking', 'smart-organization'],
      },
    ],
  },
  {
    id: 'costs',
    title: 'Budget & Expenses',
    subtitle: 'Track spending, view receipts in local and home currencies, and split expenses fairly with travel companions.',
    iconName: 'wallet',
    articles: [
      {
        id: 'budget-planning',
        categoryId: 'costs',
        title: 'Setting and Tracking Your Budget',
        excerpt: 'How Paladio helps balance free sights and paid attractions to keep your total trip within budget.',
        readTime: '3 min',
        badge: 'FINANCES',
        difficulty: 'Quick Guide',
        tldr: 'Set a spending ceiling for your trip. Paladio helps balance tickets, dining, and hotel costs while keeping a safe buffer for unexpected treats.',
        mockupType: 'cost-knapsack',
        sections: [
          {
            heading: 'Keeping Sightseeing Costs in Check',
            content: [
              'Between museum tickets, observation decks, tasting menus, and regional transit passes, trip costs add up quickly. Setting a budget helps you enjoy your vacation without worrying about unexpected credit card bills.',
              'In the Costs tab, you can enter your total target budget. Paladio breaks down expenses by category (Stay, Food & Drink, Sightseeing, Transit, and Shopping) and shows you a visual progress bar of where your money is going.',
            ],
          },
        ],
        relatedArticleIds: ['multi-currency', 'group-cost-splitting'],
      },
      {
        id: 'multi-currency',
        categoryId: 'costs',
        title: 'Local Currency & Live Conversions',
        excerpt: 'Log expenses in local money (like Yen or Euros) while Paladio shows what it equals in your home currency.',
        readTime: '3 min',
        badge: 'CURRENCY',
        difficulty: 'Quick Guide',
        tldr: 'Enter prices exactly as printed on receipts in the destination currency. Paladio automatically converts totals to your home currency with live exchange rates.',
        sections: [
          {
            heading: 'No More Mental Currency Math',
            content: [
              'When traveling abroad, converting every menu item or souvenir price in your head can be exhausting. In Paladio, your trip has two currency settings:',
              '• Home Currency (e.g., USD, EUR, GBP): The currency you think in and use for your overall budget.',
              '• Local Currency (e.g., JPY, CHF): The currency printed on restaurant receipts and entrance tickets.',
              'Use the currency wheel picker to log items in whatever currency you paid. Paladio handles the conversion instantly.',
            ],
          },
        ],
        relatedArticleIds: ['budget-planning', 'group-cost-splitting'],
      },
      {
        id: 'group-cost-splitting',
        categoryId: 'costs',
        title: 'Splitting Group Expenses',
        excerpt: 'Track who paid for hotels, dinners, and tickets, and let Paladio calculate who owes whom with minimal transfers.',
        readTime: '4 min',
        badge: 'GROUP TRAVEL',
        difficulty: 'Helpful',
        tldr: 'Log who paid for each expense. Paladio automatically calculates the simplest way to settle up so friends don\'t have to make dozens of confusing cross-payments.',
        mockupType: 'cost-knapsack',
        sections: [
          {
            heading: 'Ending Group Payment Confusion',
            content: [
              'Traveling with friends is great, but splitting bills can get messy. One person books the hotel, another buys train passes, and someone else covers dinner.',
              'Paladio tracks every expense by payer and participant. At the end of the trip, instead of everyone paying everyone else back in a tangled web, Paladio simplifies the math into the fewest possible payments (e.g., "Elena pays Alex $45 to settle all balances").',
            ],
          },
        ],
        relatedArticleIds: ['budget-planning', 'multi-currency'],
      },
    ],
  },
  {
    id: 'map',
    title: 'Interactive Map & Exploring',
    subtitle: 'Explore your destinations visually, follow daily color-coded routes, and discover hidden gems nearby.',
    iconName: 'map',
    articles: [
      {
        id: 'map-navigation',
        categoryId: 'map',
        title: 'Using the Interactive Map',
        excerpt: 'How to use map layers, day color filters, walking route lines, and numbered waypoint markers.',
        readTime: '3 min',
        badge: 'MAP GUIDE',
        difficulty: 'Quick Guide',
        tldr: 'The map displays all your trip stops with distinct colors for each day. Clicking any pin shows details and syncs with your daily schedule.',
        screenshotUrl: '/help-screenshots/trip-workspace.png',
        screenshotCaption: 'The map interface showing route polylines and numbered waypoint markers synced with your timeline.',
        sections: [
          {
            heading: 'Map & Schedule in Sync',
            content: [
              'The map and timeline are connected in real time. If you click a pin on the map, your timeline immediately highlights that stop. If you hover over a timeline stop, the map centers on that location.',
            ],
            steps: [
              'Use the Day Tabs at the top to highlight a single day or view the entire trip at once.',
              'Switch between clear Street maps and Satellite views depending on your preference.',
              'Click any numbered pin to see opening hours, walking times, and travel notes.',
            ],
          },
        ],
        relatedArticleIds: ['nearby-discovery', 'day-timeline'],
      },
      {
        id: 'nearby-discovery',
        categoryId: 'map',
        title: 'Finding Places Nearby',
        excerpt: 'How to discover authentic cafes, local bakeries, and quiet gardens within a short walk of your planned stops.',
        readTime: '3 min',
        badge: 'DISCOVERY',
        difficulty: 'Quick Guide',
        tldr: 'Looking for coffee or a quiet place to sit? Use nearby search to find curated spots within 500 meters of your current activity.',
        sections: [
          {
            heading: 'Discover Great Spots Near You',
            content: [
              'When you have an hour before a museum opens or want a morning coffee near your hotel, you don\'t want to hike across town. Paladio lets you search for spots by distance from where you already are.',
              'Filter by categories like Dining & Cafes, Culture, Parks & Nature, and Shopping, and add places directly to your day with a single tap.',
            ],
          },
        ],
        relatedArticleIds: ['map-navigation', 'what-is-paladio'],
      },
    ],
  },
  {
    id: 'assistant',
    title: 'Your AI Travel Assistant',
    subtitle: 'Ask questions, swap activities, find recommendations, and adjust your plans using simple conversation.',
    iconName: 'bot',
    articles: [
      {
        id: 'assistant-overview',
        categoryId: 'assistant',
        title: 'Chatting with Your Assistant',
        excerpt: 'How to ask your assistant in plain English to adjust days, swap activities, or find dining.',
        readTime: '4 min',
        badge: 'CHAT ASSISTANT',
        difficulty: 'Quick Guide',
        tldr: 'You can talk to your assistant like a knowledgeable travel concierge: "Find a quiet ramen shop for lunch on Day 2" or "Swap tomorrow afternoon for an art gallery".',
        mockupType: 'swarm-assistant',
        sections: [
          {
            heading: 'Natural Travel Requests',
            content: [
              'You don\'t need to learn special commands. Simply type what you want to change or ask questions about your trip:',
              '• "We want a relaxed morning on Day 3. Push our start time to 10:00 AM."',
              '• "Find a highly rated bakery within a 10-minute walk of our hotel for breakfast."',
              '• "Replace the science museum with an outdoor sculpture park on Day 2."',
              '• "Add a dinner spot near the river with vegetarian options under $30."',
            ],
          },
        ],
        relatedArticleIds: ['safe-approvals', 'what-is-paladio'],
      },
      {
        id: 'safe-approvals',
        categoryId: 'assistant',
        title: 'Safe Approvals (You\'re in Control)',
        excerpt: 'Why your assistant always previews suggestions as an approval card and never changes your trip without your consent.',
        readTime: '3 min',
        badge: 'SAFETY',
        difficulty: 'Quick Guide',
        tldr: 'Your assistant always shows a clear preview card showing what it suggests adding or changing. Nothing is added to your real itinerary until you click Approve.',
        mockupType: 'swarm-assistant',
        sections: [
          {
            heading: 'No Unexpected Changes',
            content: [
              'Some automated assistants overwrite your schedule automatically, causing confusion. In Paladio, your schedule is protected by a strict preview and approval step.',
              'When you ask for a change, your assistant prepares a proposal card showing exactly what will be adjusted: green lines show new additions, and red lines show removed stops. If you like the plan, click Approve. If not, you can dismiss it or ask for a different idea.',
            ],
            callout: {
              type: 'important',
              text: 'Complete Sovereignty: Your private trip plans are processed locally on your own machine. Your conversation never leaves your private system.',
            },
          },
        ],
        relatedArticleIds: ['assistant-overview', 'creating-trips'],
      },
    ],
  },
  {
    id: 'glossary',
    title: 'What Everything Means (Quick Reference)',
    subtitle: 'A clean reference decoding every score, badge, icon, and button in the Paladio interface.',
    iconName: 'book',
    articles: [
      {
        id: 'indicators-guide',
        categoryId: 'glossary',
        title: 'Visual Guide to Badges & Scores',
        excerpt: 'Complete reference explaining Comfort Scores, lock symbols, meal indicators, and schedule alerts.',
        readTime: '4 min',
        badge: 'REFERENCE',
        difficulty: 'Quick Guide',
        tldr: 'Refer to this table anytime you want to understand a badge, score, or icon on your trip schedule.',
        mockupType: 'realism-radar',
        sections: [
          {
            heading: 'Scores and Measurements Decoded',
            content: [
              'Here is what the numbers on your screen mean in everyday travel terms:',
            ],
            parameterTable: [
              { term: 'Comfort Score (0 to 10)', meaning: 'Overall rating of how enjoyable and feasible your day is. Above 9.0 means a comfortable, stress-free day.', rangeOrType: 'Number 0.0 – 10.0', defaultOrExample: 'Target: 9.0+' },
              { term: 'Daily Walking (km)', meaning: 'Estimated total foot travel for the day based on actual pedestrian paths.', rangeOrType: 'Kilometers or miles', defaultOrExample: '6 to 10 km/day' },
              { term: 'Transit Buffer', meaning: 'Estimated travel time between two stops including safe cushion time.', rangeOrType: 'Minutes', defaultOrExample: '15 to 25 min' },
              { term: 'Dwell Time', meaning: 'How much time you have allocated to explore an attraction or museum.', rangeOrType: 'Minutes or hours', defaultOrExample: '1h 30m' },
              { term: 'Budget Progress Bar', meaning: 'Percentage of your planned spending limit used by current activities and hotels.', rangeOrType: 'Percentage %', defaultOrExample: 'Safe under 90%' },
            ],
          },
          {
            heading: 'Icons and Status Badges',
            content: [
              '• Lock Icon (Red): The activity is locked at an exact time (like a flight or booked museum entry). It will not move when reorganizing.',
              '• Optimized Slot (Gold): A flexible visit placed in the best geographic position by Paladio to save you walking.',
              '• Meal Badge (Fork & Spoon): A dedicated lunch or dinner window preserving your proper meal schedule.',
              '• Alert Badge (Amber): Warning that time is tight or the venue closes shortly after your scheduled visit.',
              '• Clash Badge (Red): A conflict such as overlapping times or arriving after closing hours. Click Auto-Fix to resolve.',
              '• Transit Badge (Walking): Shows walking time and distance to your next stop.',
            ],
          },
        ],
        relatedArticleIds: ['realism-score', 'activity-locking', 'smart-organization'],
      },
    ],
  },
];
