// MCP integration catalog. Each entry becomes an MCP server for the Claude Code agent.
// kind 'npx': runs locally via npx; kind 'http': remote MCP endpoint.
// env: API keys the user must provide on connect.
// Through Zapier/Composio entries this reaches thousands of services.
window.CLOP_INTEGRATIONS = [
  // --- files, memory, browser ---
  { id: 'filesystem', name: 'Filesystem+', cat: 'system', kind: 'npx', pkg: '@modelcontextprotocol/server-filesystem', args: ['{PROJECTS}'], env: [] },
  { id: 'memory', name: 'Memory (knowledge graph)', cat: 'system', kind: 'npx', pkg: '@modelcontextprotocol/server-memory', env: [] },
  { id: 'sequential', name: 'Sequential Thinking', cat: 'system', kind: 'npx', pkg: '@modelcontextprotocol/server-sequential-thinking', env: [] },
  { id: 'playwright', name: 'Playwright Browser', cat: 'web', kind: 'npx', pkg: '@playwright/mcp', env: [] },
  { id: 'puppeteer', name: 'Puppeteer Browser', cat: 'web', kind: 'npx', pkg: '@modelcontextprotocol/server-puppeteer', env: [] },
  { id: 'context7', name: 'Context7 (library docs)', cat: 'dev', kind: 'npx', pkg: '@upstash/context7-mcp', env: [] },

  // --- search & web data ---
  { id: 'brave', name: 'Brave Search', cat: 'web', kind: 'npx', pkg: '@modelcontextprotocol/server-brave-search', env: ['BRAVE_API_KEY'] },
  { id: 'tavily', name: 'Tavily Search', cat: 'web', kind: 'npx', pkg: 'tavily-mcp', env: ['TAVILY_API_KEY'] },
  { id: 'exa', name: 'Exa Search', cat: 'web', kind: 'npx', pkg: 'exa-mcp-server', env: ['EXA_API_KEY'] },
  { id: 'firecrawl', name: 'Firecrawl (scraping)', cat: 'web', kind: 'npx', pkg: 'firecrawl-mcp', env: ['FIRECRAWL_API_KEY'] },
  { id: 'fetch', name: 'Fetch (HTTP requests)', cat: 'web', kind: 'npx', pkg: 'mcp-server-fetch-typescript', env: [] },

  // --- dev services ---
  { id: 'github', name: 'GitHub', cat: 'dev', kind: 'npx', pkg: '@modelcontextprotocol/server-github', env: ['GITHUB_PERSONAL_ACCESS_TOKEN'] },
  { id: 'gitlab', name: 'GitLab', cat: 'dev', kind: 'npx', pkg: '@modelcontextprotocol/server-gitlab', env: ['GITLAB_PERSONAL_ACCESS_TOKEN'] },
  { id: 'sentry', name: 'Sentry', cat: 'dev', kind: 'npx', pkg: '@sentry/mcp-server', env: ['SENTRY_AUTH_TOKEN'] },
  { id: 'supabase', name: 'Supabase', cat: 'dev', kind: 'npx', pkg: '@supabase/mcp-server-supabase', env: ['SUPABASE_ACCESS_TOKEN'] },
  { id: 'vercel', name: 'Vercel', cat: 'dev', kind: 'http', url: 'https://mcp.vercel.com', env: [] },
  { id: 'cloudflare-docs', name: 'Cloudflare Docs', cat: 'dev', kind: 'http', url: 'https://docs.mcp.cloudflare.com/mcp', env: [] },
  { id: 'heroku', name: 'Heroku', cat: 'dev', kind: 'npx', pkg: '@heroku/mcp-server', env: ['HEROKU_API_KEY'] },
  { id: 'circleci', name: 'CircleCI', cat: 'dev', kind: 'npx', pkg: '@circleci/mcp-server-circleci', env: ['CIRCLECI_TOKEN'] },
  { id: 'buildkite', name: 'Buildkite', cat: 'dev', kind: 'npx', pkg: 'buildkite-mcp-server', env: ['BUILDKITE_API_TOKEN'] },
  { id: 'e2b', name: 'E2B (code sandbox)', cat: 'dev', kind: 'npx', pkg: '@e2b/mcp-server', env: ['E2B_API_KEY'] },

  // --- databases ---
  { id: 'postgres', name: 'PostgreSQL', cat: 'db', kind: 'npx', pkg: '@modelcontextprotocol/server-postgres', args: ['{DATABASE_URL}'], env: ['DATABASE_URL'] },
  { id: 'redis', name: 'Redis', cat: 'db', kind: 'npx', pkg: '@modelcontextprotocol/server-redis', args: ['{REDIS_URL}'], env: ['REDIS_URL'] },
  { id: 'mongodb', name: 'MongoDB', cat: 'db', kind: 'npx', pkg: 'mongodb-mcp-server', env: ['MDB_MCP_CONNECTION_STRING'] },
  { id: 'sqlite', name: 'SQLite', cat: 'db', kind: 'npx', pkg: 'mcp-server-sqlite-npx', args: ['{DB_PATH}'], env: ['DB_PATH'] },
  { id: 'neon', name: 'Neon Postgres', cat: 'db', kind: 'npx', pkg: '@neondatabase/mcp-server-neon', args: ['start', '{NEON_API_KEY}'], env: ['NEON_API_KEY'] },
  { id: 'clickhouse', name: 'ClickHouse', cat: 'db', kind: 'http', url: 'https://mcp.clickhouse.com/mcp', env: [] },

  // --- productivity / docs ---
  { id: 'notion', name: 'Notion', cat: 'work', kind: 'npx', pkg: '@notionhq/notion-mcp-server', env: ['NOTION_TOKEN'] },
  { id: 'slack', name: 'Slack', cat: 'work', kind: 'npx', pkg: '@modelcontextprotocol/server-slack', env: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'] },
  { id: 'airtable', name: 'Airtable', cat: 'work', kind: 'npx', pkg: 'airtable-mcp-server', env: ['AIRTABLE_API_KEY'] },
  { id: 'linear', name: 'Linear', cat: 'work', kind: 'npx', pkg: 'mcp-remote', args: ['https://mcp.linear.app/sse'], env: [] },
  { id: 'atlassian', name: 'Jira / Confluence', cat: 'work', kind: 'npx', pkg: 'mcp-remote', args: ['https://mcp.atlassian.com/v1/sse'], env: [] },
  { id: 'asana', name: 'Asana', cat: 'work', kind: 'npx', pkg: 'mcp-remote', args: ['https://mcp.asana.com/sse'], env: [] },
  { id: 'intercom', name: 'Intercom', cat: 'work', kind: 'npx', pkg: 'mcp-remote', args: ['https://mcp.intercom.com/sse'], env: [] },
  { id: 'monday', name: 'monday.com', cat: 'work', kind: 'npx', pkg: '@mondaydotcomorg/monday-api-mcp', env: ['MONDAY_TOKEN'] },
  { id: 'todoist', name: 'Todoist', cat: 'work', kind: 'npx', pkg: '@abhiz123/todoist-mcp-server', env: ['TODOIST_API_TOKEN'] },
  { id: 'gdrive', name: 'Google Drive', cat: 'work', kind: 'npx', pkg: '@modelcontextprotocol/server-gdrive', env: [] },

  // --- payments / business ---
  { id: 'stripe', name: 'Stripe', cat: 'biz', kind: 'npx', pkg: '@stripe/mcp', args: ['--tools=all'], env: ['STRIPE_SECRET_KEY'] },
  { id: 'paypal', name: 'PayPal', cat: 'biz', kind: 'npx', pkg: 'mcp-remote', args: ['https://mcp.paypal.com/sse'], env: [] },
  { id: 'square', name: 'Square', cat: 'biz', kind: 'npx', pkg: 'mcp-remote', args: ['https://mcp.squareup.com/sse'], env: [] },
  { id: 'plaid', name: 'Plaid', cat: 'biz', kind: 'npx', pkg: 'mcp-remote', args: ['https://api.dashboard.plaid.com/mcp/sse'], env: [] },
  { id: 'shopify', name: 'Shopify Dev', cat: 'biz', kind: 'npx', pkg: '@shopify/dev-mcp', env: [] },

  // --- media / design / misc ---
  { id: 'figma', name: 'Figma', cat: 'design', kind: 'http', url: 'https://mcp.figma.com/mcp', env: [] },
  { id: 'everart', name: 'EverArt (images)', cat: 'design', kind: 'npx', pkg: '@modelcontextprotocol/server-everart', env: ['EVERART_API_KEY'] },
  { id: 'youtube', name: 'YouTube (transcripts)', cat: 'media', kind: 'npx', pkg: '@anaisbetts/mcp-youtube', env: [] },
  { id: 'gmaps', name: 'Google Maps', cat: 'media', kind: 'npx', pkg: '@modelcontextprotocol/server-google-maps', env: ['GOOGLE_MAPS_API_KEY'] },
  { id: 'elevenlabs', name: 'ElevenLabs (voice)', cat: 'media', kind: 'npx', pkg: 'elevenlabs-mcp-server', env: ['ELEVENLABS_API_KEY'] },

  // --- aggregators: thousands of apps through one connector ---
  { id: 'zapier', name: 'Zapier (8000+ apps)', cat: 'hub', kind: 'http', url: '{ZAPIER_MCP_URL}', env: ['ZAPIER_MCP_URL'] },
  { id: 'composio', name: 'Composio (250+ apps)', cat: 'hub', kind: 'npx', pkg: '@composio/mcp', args: ['start'], env: ['COMPOSIO_API_KEY'] },
  { id: 'pipedream', name: 'Pipedream (2500+ apps)', cat: 'hub', kind: 'http', url: '{PIPEDREAM_MCP_URL}', env: ['PIPEDREAM_MCP_URL'] }
];
