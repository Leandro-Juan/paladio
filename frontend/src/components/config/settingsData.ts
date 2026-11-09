export type SettingsTabId =
  | 'overview'
  // 1. Workspace & Experience
  | 'profile'
  | 'appearance'
  | 'typography'
  | 'navigation'
  | 'maps'
  // 2. Localization & Formatting
  | 'language'
  | 'currency'
  | 'units'
  // 3. Travel Engine & Optimization
  | 'solver'
  | 'transit'
  | 'deals'
  // 4. AI & Swarm Intelligence
  | 'llm'
  | 'swarm'
  | 'memory'
  // 5. Sovereign Infrastructure & Admin
  | 'users'
  | 'updates'
  | 'telemetry'
  | 'vault';

export interface SettingCardItem {
  id: SettingsTabId;
  title: string;
  description: string;
  category: string;
  iconName:
    | 'palette'
    | 'font'
    | 'layout'
    | 'globe'
    | 'coins'
    | 'sparkles'
    | 'transit'
    | 'users'
    | 'profile'
    | 'refresh'
    | 'server'
    | 'map'
    | 'scale'
    | 'sliders'
    | 'tag'
    | 'brain'
    | 'database';
  iconTone?: 'coral' | 'teal' | 'gold';
  keywords: string[];
  requiresAdmin?: boolean;
  statusBadge?: string;
  subTabs?: Array<{ id: string; label: string }>;
}

export interface SettingCategoryGroup {
  id: string;
  title: string;
  subtitle: string;
  items: SettingCardItem[];
}

export const SETTINGS_CATEGORIES: SettingCategoryGroup[] = [
  {
    id: 'experience',
    title: 'Workspace & Experience',
    subtitle: 'Manage your personal profile, visual themes, typography pairings, and tactical map styling',
    items: [
      {
        id: 'profile',
        title: 'Personal Account',
        description: 'Credentials, display avatar, security passphrase, and traveler bio',
        category: 'experience',
        iconName: 'profile',
        iconTone: 'teal',
        keywords: ['profile', 'avatar', 'password', 'email', 'account', 'credentials', 'bio'],
        statusBadge: 'Active',
      },
      {
        id: 'appearance',
        title: 'Visual Themes',
        description: 'Pacific Jazz theme engine: Warm Editorial Light, Slate Dark, and Silent Waters',
        category: 'experience',
        iconName: 'palette',
        iconTone: 'coral',
        keywords: ['theme', 'appearance', 'dark', 'light', 'silent waters', 'palette', 'color', 'jazz'],
        statusBadge: 'Pacific Jazz',
        subTabs: [
          { id: 'theme', label: 'Color Themes' },
          { id: 'accents', label: 'Accent Highlights' },
        ],
      },
      {
        id: 'typography',
        title: 'Interface Typography',
        description: 'Pairing modern Inter with classic Jost editorial and JetBrains Mono metrics',
        category: 'experience',
        iconName: 'font',
        iconTone: 'teal',
        keywords: ['typography', 'font', 'inter', 'jost', 'pairing', 'mono', 'jetbrains'],
        statusBadge: 'Dual Pairing',
      },
      {
        id: 'navigation',
        title: 'Navigation Layout',
        description: 'Switch between the tactical sidebar rail and floating dock presentation',
        category: 'experience',
        iconName: 'layout',
        iconTone: 'teal',
        keywords: ['navigation', 'dock', 'sidebar', 'layout', 'floating dock'],
        statusBadge: 'Dock / Rail',
      },
      {
        id: 'maps',
        title: 'Cartography & Layers',
        description: 'Default map tile layer, transit route overlays, and home coordinate anchors',
        category: 'experience',
        iconName: 'map',
        iconTone: 'gold',
        keywords: ['map', 'cartography', 'tiles', 'cartodb', 'osm', 'satellite', 'transit lines'],
        statusBadge: 'CartoDB Dark',
      },
    ],
  },
  {
    id: 'localization',
    title: 'Localization & Formatting',
    subtitle: 'Interface display language, calculation currencies, units, and regional time standards',
    items: [
      {
        id: 'language',
        title: 'Display Language',
        description: 'Interface language, bidirectional script handling (LTR/RTL), and translation audits',
        category: 'localization',
        iconName: 'globe',
        iconTone: 'coral',
        keywords: ['language', 'locale', 'translation', 'i18n', 'spanish', 'english', 'japanese', 'arabic'],
        statusBadge: 'Multilingual',
      },
      {
        id: 'currency',
        title: 'Currency & Conversions',
        description: 'Default calculation currency for travel itineraries, expenses, and conversions',
        category: 'localization',
        iconName: 'coins',
        iconTone: 'gold',
        keywords: ['currency', 'money', 'eur', 'usd', 'jpy', 'exchange', 'expenses', 'regional'],
        statusBadge: 'Realtime FX',
      },
      {
        id: 'units',
        title: 'Units & Time Standards',
        description: 'Metric vs Imperial distances, 24h vs 12h clock, and standard ISO date formatting',
        category: 'localization',
        iconName: 'scale',
        iconTone: 'teal',
        keywords: ['units', 'metric', 'imperial', 'km', 'miles', 'clock', 'time', 'date format', '24h'],
        statusBadge: 'Metric / 24h',
      },
    ],
  },
  {
    id: 'engine',
    title: 'Travel Engine & Optimization',
    subtitle: 'Configure C++20 combinatorial solver constraints, compiled GTFS transit schedules, and deal scrapers',
    items: [
      {
        id: 'solver',
        title: 'Solver Constraints & Pacing',
        description: 'Daily walking distance caps, pacing tempo, meal windows, and fatigue thresholds',
        category: 'engine',
        iconName: 'sliders',
        iconTone: 'coral',
        keywords: ['solver', 'constraints', 'walking', 'pace', 'tempo', 'meals', 'fatigue', 'burnout', 'cpp'],
        statusBadge: 'Balanced',
      },
      {
        id: 'transit',
        title: 'Public Transit & GTFS',
        description: 'Compiled transit schedules, Valhalla tiles, and planned trip synchronizer',
        category: 'engine',
        iconName: 'transit',
        iconTone: 'teal',
        keywords: ['gtfs', 'transit', 'valhalla', 'metro', 'subway', 'bus', 'train', 'schedules', 'tiles'],
        statusBadge: 'Valhalla Core',
      },
      {
        id: 'deals',
        title: 'Deal Engine & Scraping',
        description: 'Flight and hotel scraper frequency, ticket parser triggers, and price drop alerts',
        category: 'engine',
        iconName: 'tag',
        iconTone: 'gold',
        keywords: ['deals', 'scraper', 'flights', 'hotels', 'tickets', 'alerts', 'prices'],
        statusBadge: 'Cadence: 24h',
      },
    ],
  },
  {
    id: 'intelligence',
    title: 'AI & Swarm Intelligence',
    subtitle: 'Manage multi-provider LLM models, LangGraph swarm agent behaviors, and continuous ML taste learning',
    items: [
      {
        id: 'llm',
        title: 'AI & LLM Engine',
        description: 'Multi-provider AI configuration (Gemini, Claude, OpenAI, Groq, Ollama, vLLM)',
        category: 'intelligence',
        iconName: 'sparkles',
        iconTone: 'coral',
        keywords: ['llm', 'ai', 'gemini', 'claude', 'openai', 'groq', 'ollama', 'provider', 'api key', 'model', 'deepseek', 'vllm'],
        statusBadge: 'Multi-Provider',
      },
      {
        id: 'swarm',
        title: 'Agent Swarms & Critic',
        description: 'LangGraph critic evaluation threshold, thinking token budget, and approval checkpoints',
        category: 'intelligence',
        iconName: 'brain',
        iconTone: 'teal',
        keywords: ['swarm', 'langgraph', 'critic', 'agent', 'tokens', 'thinking', 'approval', 'reasoning'],
        statusBadge: 'Strictness: 0.75',
      },
      {
        id: 'memory',
        title: 'ML Taste Learning & RAG',
        description: 'Continuous 16-D POI feature tensor weight learning and semantic vector memory',
        category: 'intelligence',
        iconName: 'database',
        iconTone: 'gold',
        keywords: ['memory', 'taste', 'tensor', 'poi encoder', 'learning', 'rag', 'embeddings', 'preferences'],
        statusBadge: '16-D Active',
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Sovereign Infrastructure & Admin',
    subtitle: 'User access control, GitHub auto-updates, Docker container telemetry, and encrypted data backups',
    items: [
      {
        id: 'users',
        title: 'Authorized Users',
        description: 'Provision user accounts, configure roles, permissions, and instance access',
        category: 'infrastructure',
        iconName: 'users',
        iconTone: 'coral',
        keywords: ['users', 'members', 'accounts', 'provision', 'roles', 'admin', 'permissions'],
        requiresAdmin: true,
        statusBadge: 'Admin Gated',
      },
      {
        id: 'updates',
        title: 'System Updates',
        description: 'GitHub repository continuous synchronization, release notes, and auto-updater',
        category: 'infrastructure',
        iconName: 'refresh',
        iconTone: 'teal',
        keywords: ['updates', 'updater', 'github', 'release', 'changelog', 'version', 'branch'],
        requiresAdmin: true,
        statusBadge: 'Up to Date',
      },
      {
        id: 'telemetry',
        title: 'Container Telemetry',
        description: 'Live status and port telemetry for FastAPI, TimescaleDB, Redis, and Valhalla',
        category: 'infrastructure',
        iconName: 'server',
        iconTone: 'teal',
        keywords: ['telemetry', 'docker', 'containers', 'fastapi', 'timescaledb', 'redis', 'valhalla', 'ports'],
        requiresAdmin: true,
        statusBadge: 'Healthy',
      },
      {
        id: 'vault',
        title: 'Data Vault & Backups',
        description: 'Instance database snapshots, anonymized trip JSON bundles, and storage cleanups',
        category: 'infrastructure',
        iconName: 'database',
        iconTone: 'gold',
        keywords: ['vault', 'backup', 'snapshot', 'export', 'trips', 'archive', 'storage'],
        statusBadge: 'Snapshots: ON',
      },
    ],
  },
];
