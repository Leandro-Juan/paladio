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
  // 4. AI & Swarm Intelligence
  | 'llm'
  // 5. Sovereign Infrastructure & Admin
  | 'users'
  | 'updates'
  | 'vault'
  | 'notifications'
  | 'secrets';

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
    | 'database'
    | 'bell'
    | 'key';
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
    subtitle: 'Manage your personal profile, localization conventions, visual themes, typography pairings, and tactical map styling',
    items: [
      {
        id: 'profile',
        title: 'Personal Account',
        description: 'Credentials, display avatar, security passphrase, language, currency, units, and regional conventions',
        category: 'experience',
        iconName: 'profile',
        iconTone: 'teal',
        keywords: [
          'profile',
          'avatar',
          'password',
          'email',
          'account',
          'credentials',
          'bio',
          'language',
          'locale',
          'translation',
          'currency',
          'money',
          'units',
          'metric',
          'clock',
          'date format',
          'holidays',
        ],
        statusBadge: 'Active',
      },
      {
        id: 'appearance',
        title: 'Appearance & Interface',
        description: 'Pacific Jazz theme engine, interface typography pairings, navigation layout, and cartography layers',
        category: 'experience',
        iconName: 'palette',
        iconTone: 'coral',
        keywords: [
          'theme',
          'appearance',
          'dark',
          'light',
          'silent waters',
          'palette',
          'color',
          'jazz',
          'typography',
          'font',
          'inter',
          'jost',
          'pairing',
          'mono',
          'navigation',
          'dock',
          'sidebar',
          'layout',
          'map',
          'cartography',
          'tiles',
          'transit lines',
        ],
        statusBadge: 'Pacific Jazz',
        subTabs: [
          { id: 'theme', label: 'Color Themes' },
          { id: 'typography', label: 'Typography' },
          { id: 'navigation', label: 'Navigation' },
          { id: 'maps', label: 'Cartography' },
        ],
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
        requiresAdmin: true,
        statusBadge: 'Balanced',
      },
      {
        id: 'transit',
        title: 'City Data',
        description: 'City database storage, POIs, compiled transit schedules, and disk usage vault',
        category: 'engine',
        iconName: 'transit',
        iconTone: 'teal',
        keywords: ['city', 'data', 'storage', 'gtfs', 'transit', 'valhalla', 'metro', 'subway', 'bus', 'train', 'schedules', 'tiles', 'pois'],
        requiresAdmin: true,
        statusBadge: 'Storage Vault',
      },
    ],
  },
  {
    id: 'intelligence',
    title: 'AI & Swarm Intelligence',
    subtitle: 'Manage multi-provider LLM models and AI engine endpoints',
    items: [
      {
        id: 'llm',
        title: 'AI & LLM Engine',
        description: 'Multi-provider AI configuration (Gemini, Claude, OpenAI, Groq, Ollama, vLLM)',
        category: 'intelligence',
        iconName: 'sparkles',
        iconTone: 'coral',
        keywords: ['llm', 'ai', 'gemini', 'claude', 'openai', 'groq', 'ollama', 'provider', 'api key', 'model', 'deepseek', 'vllm'],
        requiresAdmin: true,
        statusBadge: 'Multi-Provider',
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
        id: 'vault',
        title: 'Data Vault & Backups',
        description: 'Instance database snapshots, anonymized trip exports, and Immich / Synology photo sync',
        category: 'infrastructure',
        iconName: 'database',
        iconTone: 'gold',
        keywords: ['vault', 'backup', 'snapshot', 'export', 'trips', 'archive', 'storage', 'photos', 'immich', 'synology', 'sync'],
        requiresAdmin: true,
        statusBadge: 'Vault & Media',
        subTabs: [
          { id: 'storage', label: 'Storage & Snapshots' },
          { id: 'photo_sync', label: 'Photo Sync (Immich & Synology)' },
        ],
      },
      {
        id: 'notifications',
        title: 'Notifications',
        description: 'Notification types, preferences, and push relay delivery (Pushify, Pushover, Ntfy, Webhooks)',
        category: 'infrastructure',
        iconName: 'bell',
        iconTone: 'coral',
        keywords: ['notifications', 'pushify', 'pushover', 'ntfy', 'webhook', 'alerts', 'push', 'events', 'sync'],
        requiresAdmin: true,
        statusBadge: 'Admin Gated',
        subTabs: [
          { id: 'types', label: 'Notification Types' },
          { id: 'pushify', label: 'Pushify' },
          { id: 'pushover', label: 'Pushover & Ntfy' },
          { id: 'webhooks', label: 'Custom Webhooks' },
        ],
      },
      {
        id: 'secrets',
        title: 'API Keys & Secrets',
        description: 'Configure Travelpayouts/Aviasales token, live fare verifier keys, and external service credentials',
        category: 'infrastructure',
        iconName: 'key',
        iconTone: 'gold',
        keywords: ['secrets', 'api', 'keys', 'token', 'aviasales', 'travelpayouts', 'credentials', 'verification', 'flights'],
        requiresAdmin: true,
        statusBadge: 'Credentials',
      },
    ],
  },
];

