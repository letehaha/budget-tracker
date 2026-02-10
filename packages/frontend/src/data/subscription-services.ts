export interface SubscriptionServiceEntry {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
}

export const SUBSCRIPTION_SERVICES: SubscriptionServiceEntry[] = [
  // Streaming – Video
  { id: 'netflix', name: 'Netflix', aliases: ['nflx'], domain: 'netflix.com' },
  { id: 'disney-plus', name: 'Disney+', aliases: ['disney plus', 'disneyplus'], domain: 'disneyplus.com' },
  { id: 'hbo-max', name: 'HBO Max', aliases: ['hbo', 'max'], domain: 'hbomax.com' },
  { id: 'hulu', name: 'Hulu', aliases: [], domain: 'hulu.com' },
  { id: 'amazon-prime', name: 'Amazon Prime', aliases: ['prime video', 'amazon prime video'], domain: 'amazon.com' },
  {
    id: 'paramount-plus',
    name: 'Paramount+',
    aliases: ['paramount plus', 'paramountplus'],
    domain: 'paramountplus.com',
  },
  { id: 'peacock', name: 'Peacock', aliases: ['nbc peacock'], domain: 'peacocktv.com' },
  { id: 'apple-tv', name: 'Apple TV+', aliases: ['apple tv plus', 'apple tv'], domain: 'apple.com' },
  { id: 'crunchyroll', name: 'Crunchyroll', aliases: [], domain: 'crunchyroll.com' },
  { id: 'youtube-premium', name: 'YouTube Premium', aliases: ['youtube', 'yt premium'], domain: 'youtube.com' },
  {
    id: 'discovery-plus',
    name: 'Discovery+',
    aliases: ['discovery plus', 'discoveryplus'],
    domain: 'discoveryplus.com',
  },
  { id: 'showtime', name: 'Showtime', aliases: [], domain: 'showtime.com' },
  { id: 'starz', name: 'Starz', aliases: [], domain: 'starz.com' },
  { id: 'shudder', name: 'Shudder', aliases: [], domain: 'shudder.com' },
  { id: 'mubi', name: 'MUBI', aliases: [], domain: 'mubi.com' },
  {
    id: 'criterion',
    name: 'Criterion Channel',
    aliases: ['criterion', 'the criterion channel'],
    domain: 'criterionchannel.com',
  },
  { id: 'acorn-tv', name: 'Acorn TV', aliases: ['acorn'], domain: 'acorn.tv' },
  { id: 'britbox', name: 'BritBox', aliases: [], domain: 'britbox.com' },
  { id: 'funimation', name: 'Funimation', aliases: [], domain: 'funimation.com' },
  { id: 'viki', name: 'Viki', aliases: ['rakuten viki'], domain: 'viki.com' },
  { id: 'curiositystream', name: 'CuriosityStream', aliases: ['curiosity stream'], domain: 'curiositystream.com' },
  { id: 'nebula', name: 'Nebula', aliases: [], domain: 'nebula.tv' },
  { id: 'dazn', name: 'DAZN', aliases: [], domain: 'dazn.com' },
  { id: 'espn-plus', name: 'ESPN+', aliases: ['espn plus', 'espn'], domain: 'espnplus.com' },

  // Streaming – Music
  { id: 'spotify', name: 'Spotify', aliases: [], domain: 'spotify.com' },
  { id: 'apple-music', name: 'Apple Music', aliases: [], domain: 'music.apple.com' },
  { id: 'tidal', name: 'Tidal', aliases: [], domain: 'tidal.com' },
  { id: 'deezer', name: 'Deezer', aliases: [], domain: 'deezer.com' },
  { id: 'audible', name: 'Audible', aliases: [], domain: 'audible.com' },
  { id: 'amazon-music', name: 'Amazon Music Unlimited', aliases: ['amazon music'], domain: 'music.amazon.com' },
  { id: 'youtube-music', name: 'YouTube Music', aliases: ['yt music'], domain: 'music.youtube.com' },
  { id: 'pandora', name: 'Pandora', aliases: ['pandora plus', 'pandora premium'], domain: 'pandora.com' },
  { id: 'soundcloud', name: 'SoundCloud Go+', aliases: ['soundcloud', 'soundcloud go'], domain: 'soundcloud.com' },
  { id: 'qobuz', name: 'Qobuz', aliases: [], domain: 'qobuz.com' },

  // Podcasts & Audio
  { id: 'luminary', name: 'Luminary', aliases: [], domain: 'luminarypodcasts.com' },
  { id: 'stitcher', name: 'Stitcher Premium', aliases: ['stitcher'], domain: 'stitcher.com' },
  { id: 'scribd', name: 'Scribd', aliases: [], domain: 'scribd.com' },
  { id: 'blinkist', name: 'Blinkist', aliases: [], domain: 'blinkist.com' },
  { id: 'audiobooks', name: 'Audiobooks.com', aliases: ['audiobooks'], domain: 'audiobooks.com' },

  // Software & Productivity
  {
    id: 'adobe',
    name: 'Adobe Creative Cloud',
    aliases: ['adobe cc', 'adobe', 'photoshop', 'lightroom'],
    domain: 'adobe.com',
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    aliases: ['office 365', 'ms 365', 'microsoft office', 'microsoft'],
    domain: 'microsoft.com',
  },
  { id: 'google-one', name: 'Google One', aliases: ['google storage', 'google drive'], domain: 'one.google.com' },
  { id: 'google-workspace', name: 'Google Workspace', aliases: ['g suite', 'gsuite'], domain: 'workspace.google.com' },
  { id: 'dropbox', name: 'Dropbox', aliases: [], domain: 'dropbox.com' },
  { id: 'icloud', name: 'iCloud+', aliases: ['icloud', 'icloud plus', 'apple icloud'], domain: 'icloud.com' },
  { id: 'box', name: 'Box', aliases: [], domain: 'box.com' },
  { id: 'onedrive', name: 'OneDrive', aliases: ['microsoft onedrive'], domain: 'onedrive.live.com' },
  { id: 'sync', name: 'Sync.com', aliases: ['sync'], domain: 'sync.com' },
  { id: 'pcloud', name: 'pCloud', aliases: [], domain: 'pcloud.com' },

  // Password Managers & Security
  { id: '1password', name: '1Password', aliases: ['one password', 'onepassword'], domain: '1password.com' },
  { id: 'bitwarden', name: 'Bitwarden', aliases: [], domain: 'bitwarden.com' },
  { id: 'lastpass', name: 'LastPass', aliases: [], domain: 'lastpass.com' },
  { id: 'dashlane', name: 'Dashlane', aliases: [], domain: 'dashlane.com' },
  { id: 'keeper', name: 'Keeper', aliases: ['keeper security'], domain: 'keepersecurity.com' },
  { id: 'nordpass', name: 'NordPass', aliases: [], domain: 'nordpass.com' },

  // Project Management & Collaboration
  { id: 'notion', name: 'Notion', aliases: [], domain: 'notion.so' },
  { id: 'slack', name: 'Slack', aliases: [], domain: 'slack.com' },
  { id: 'asana', name: 'Asana', aliases: [], domain: 'asana.com' },
  { id: 'monday', name: 'Monday.com', aliases: ['monday'], domain: 'monday.com' },
  { id: 'trello', name: 'Trello', aliases: [], domain: 'trello.com' },
  { id: 'clickup', name: 'ClickUp', aliases: [], domain: 'clickup.com' },
  { id: 'airtable', name: 'Airtable', aliases: [], domain: 'airtable.com' },
  { id: 'basecamp', name: 'Basecamp', aliases: [], domain: 'basecamp.com' },
  { id: 'jira', name: 'Jira', aliases: ['atlassian jira'], domain: 'atlassian.com' },
  { id: 'confluence', name: 'Confluence', aliases: [], domain: 'atlassian.com' },
  { id: 'linear', name: 'Linear', aliases: [], domain: 'linear.app' },
  { id: 'height', name: 'Height', aliases: [], domain: 'height.app' },
  { id: 'coda', name: 'Coda', aliases: [], domain: 'coda.io' },

  // Developer Tools
  { id: 'github', name: 'GitHub', aliases: ['github copilot'], domain: 'github.com' },
  { id: 'gitlab', name: 'GitLab', aliases: [], domain: 'gitlab.com' },
  {
    id: 'jetbrains',
    name: 'JetBrains',
    aliases: ['intellij', 'webstorm', 'pycharm', 'phpstorm'],
    domain: 'jetbrains.com',
  },
  { id: 'cursor', name: 'Cursor', aliases: [], domain: 'cursor.sh' },
  { id: 'replit', name: 'Replit', aliases: ['repl.it'], domain: 'replit.com' },
  { id: 'vercel', name: 'Vercel', aliases: [], domain: 'vercel.com' },
  { id: 'netlify', name: 'Netlify', aliases: [], domain: 'netlify.com' },
  { id: 'railway', name: 'Railway', aliases: [], domain: 'railway.app' },
  { id: 'render', name: 'Render', aliases: [], domain: 'render.com' },
  { id: 'datadog', name: 'Datadog', aliases: [], domain: 'datadoghq.com' },
  { id: 'sentry', name: 'Sentry', aliases: [], domain: 'sentry.io' },
  { id: 'postman', name: 'Postman', aliases: [], domain: 'postman.com' },

  // AI & ML Tools
  { id: 'chatgpt', name: 'ChatGPT', aliases: ['openai', 'chatgpt plus', 'gpt plus'], domain: 'openai.com' },
  { id: 'anthropic', name: 'Anthropic', aliases: ['anthropic'], domain: 'anthropic.com' },
  { id: 'claude', name: 'Claude', aliases: ['claude pro', 'claude code', 'claude max'], domain: 'claude.ai' },
  { id: 'midjourney', name: 'Midjourney', aliases: [], domain: 'midjourney.com' },
  { id: 'runway', name: 'Runway', aliases: ['runway ml'], domain: 'runwayml.com' },
  { id: 'jasper', name: 'Jasper', aliases: ['jasper ai'], domain: 'jasper.ai' },
  { id: 'copy-ai', name: 'Copy.ai', aliases: ['copy ai'], domain: 'copy.ai' },
  { id: 'writesonic', name: 'Writesonic', aliases: [], domain: 'writesonic.com' },
  { id: 'perplexity', name: 'Perplexity', aliases: ['perplexity ai'], domain: 'perplexity.ai' },

  // Design & Creative
  { id: 'figma', name: 'Figma', aliases: [], domain: 'figma.com' },
  { id: 'canva', name: 'Canva', aliases: ['canva pro'], domain: 'canva.com' },
  { id: 'sketch', name: 'Sketch', aliases: [], domain: 'sketch.com' },
  { id: 'invision', name: 'InVision', aliases: [], domain: 'invisionapp.com' },
  { id: 'framer', name: 'Framer', aliases: [], domain: 'framer.com' },
  { id: 'webflow', name: 'Webflow', aliases: [], domain: 'webflow.com' },
  { id: 'miro', name: 'Miro', aliases: [], domain: 'miro.com' },
  { id: 'figjam', name: 'FigJam', aliases: [], domain: 'figma.com' },
  { id: 'piktochart', name: 'Piktochart', aliases: [], domain: 'piktochart.com' },
  { id: 'visme', name: 'Visme', aliases: [], domain: 'visme.co' },

  // Writing & Grammar
  { id: 'grammarly', name: 'Grammarly', aliases: [], domain: 'grammarly.com' },
  { id: 'hemingway', name: 'Hemingway Editor', aliases: ['hemingway'], domain: 'hemingwayapp.com' },
  { id: 'prowritingaid', name: 'ProWritingAid', aliases: [], domain: 'prowritingaid.com' },

  // Hosting & Infrastructure
  { id: 'hetzner', name: 'Hetzner', aliases: ['hetzner cloud'], domain: 'hetzner.com' },
  { id: 'digitalocean', name: 'DigitalOcean', aliases: ['digital ocean', 'do'], domain: 'digitalocean.com' },
  { id: 'aws', name: 'Amazon Web Services', aliases: ['aws', 'amazon aws'], domain: 'aws.amazon.com' },
  { id: 'gcp', name: 'Google Cloud Platform', aliases: ['gcp', 'google cloud'], domain: 'cloud.google.com' },
  { id: 'azure', name: 'Microsoft Azure', aliases: ['azure'], domain: 'azure.microsoft.com' },
  { id: 'linode', name: 'Linode', aliases: ['akamai cloud'], domain: 'linode.com' },
  { id: 'vultr', name: 'Vultr', aliases: [], domain: 'vultr.com' },
  { id: 'cloudflare', name: 'Cloudflare', aliases: [], domain: 'cloudflare.com' },
  { id: 'heroku', name: 'Heroku', aliases: [], domain: 'heroku.com' },

  // Fitness & Wellness
  { id: 'peloton', name: 'Peloton', aliases: [], domain: 'onepeloton.com' },
  { id: 'strava', name: 'Strava', aliases: [], domain: 'strava.com' },
  { id: 'headspace', name: 'Headspace', aliases: [], domain: 'headspace.com' },
  { id: 'calm', name: 'Calm', aliases: [], domain: 'calm.com' },
  { id: 'hevy', name: 'Hevy', aliases: ['hevy pro'], domain: 'hevyapp.com' },
  { id: 'myfitnesspal', name: 'MyFitnessPal', aliases: ['mfp'], domain: 'myfitnesspal.com' },
  { id: 'noom', name: 'Noom', aliases: [], domain: 'noom.com' },
  { id: 'ww', name: 'WW', aliases: ['weight watchers', 'weightwatchers'], domain: 'weightwatchers.com' },
  { id: 'fitbit', name: 'Fitbit Premium', aliases: ['fitbit'], domain: 'fitbit.com' },
  { id: 'whoop', name: 'WHOOP', aliases: [], domain: 'whoop.com' },
  { id: 'classpass', name: 'ClassPass', aliases: [], domain: 'classpass.com' },
  { id: 'aaptiv', name: 'Aaptiv', aliases: [], domain: 'aaptiv.com' },
  { id: 'future', name: 'Future', aliases: ['future fitness'], domain: 'future.co' },
  { id: 'sweat', name: 'Sweat', aliases: ['kayla itsines'], domain: 'sweat.com' },

  // Gaming
  { id: 'xbox-game-pass', name: 'Xbox Game Pass', aliases: ['game pass', 'gamepass', 'xbox'], domain: 'xbox.com' },
  { id: 'playstation-plus', name: 'PlayStation Plus', aliases: ['ps plus', 'ps+', 'psn'], domain: 'playstation.com' },
  {
    id: 'nintendo-switch-online',
    name: 'Nintendo Switch Online',
    aliases: ['nintendo online', 'nso'],
    domain: 'nintendo.com',
  },
  { id: 'steam', name: 'Steam', aliases: ['valve'], domain: 'store.steampowered.com' },
  { id: 'ea-play', name: 'EA Play', aliases: ['ea access', 'ea'], domain: 'ea.com' },
  { id: 'ubisoft-plus', name: 'Ubisoft+', aliases: ['ubisoft plus', 'uplay plus'], domain: 'ubisoftplus.com' },
  { id: 'humble-bundle', name: 'Humble Bundle', aliases: ['humble choice', 'humble'], domain: 'humblebundle.com' },
  { id: 'gog', name: 'GOG Galaxy', aliases: ['gog', 'good old games'], domain: 'gog.com' },
  { id: 'epic-games', name: 'Epic Games Store', aliases: ['epic'], domain: 'epicgames.com' },

  // Communication & Video
  { id: 'zoom', name: 'Zoom', aliases: ['zoom pro', 'zoom meetings'], domain: 'zoom.us' },
  { id: 'twitch', name: 'Twitch', aliases: ['twitch turbo', 'twitch sub'], domain: 'twitch.tv' },
  { id: 'discord', name: 'Discord Nitro', aliases: ['discord'], domain: 'discord.com' },
  { id: 'teams', name: 'Microsoft Teams', aliases: ['ms teams'], domain: 'teams.microsoft.com' },
  { id: 'webex', name: 'Webex', aliases: ['cisco webex'], domain: 'webex.com' },
  { id: 'whereby', name: 'Whereby', aliases: [], domain: 'whereby.com' },
  { id: 'loom', name: 'Loom', aliases: [], domain: 'loom.com' },

  // VPN & Security
  { id: 'nordvpn', name: 'NordVPN', aliases: ['nord vpn', 'nord'], domain: 'nordvpn.com' },
  { id: 'expressvpn', name: 'ExpressVPN', aliases: ['express vpn'], domain: 'expressvpn.com' },
  { id: 'surfshark', name: 'Surfshark', aliases: [], domain: 'surfshark.com' },
  { id: 'protonvpn', name: 'ProtonVPN', aliases: ['proton vpn'], domain: 'protonvpn.com' },
  { id: 'cyberghost', name: 'CyberGhost', aliases: [], domain: 'cyberghostvpn.com' },
  { id: 'pia', name: 'Private Internet Access', aliases: ['pia'], domain: 'privateinternetaccess.com' },
  { id: 'malwarebytes', name: 'Malwarebytes', aliases: [], domain: 'malwarebytes.com' },
  { id: 'norton', name: 'Norton', aliases: ['norton 360'], domain: 'norton.com' },
  { id: 'mcafee', name: 'McAfee', aliases: [], domain: 'mcafee.com' },

  // Email & Communication
  { id: 'protonmail', name: 'ProtonMail', aliases: ['proton mail'], domain: 'proton.me' },
  { id: 'fastmail', name: 'Fastmail', aliases: [], domain: 'fastmail.com' },
  { id: 'hey', name: 'HEY', aliases: ['hey email'], domain: 'hey.com' },
  { id: 'superhuman', name: 'Superhuman', aliases: [], domain: 'superhuman.com' },

  // News & Media
  { id: 'nyt', name: 'The New York Times', aliases: ['nyt', 'ny times', 'new york times'], domain: 'nytimes.com' },
  { id: 'wsj', name: 'The Wall Street Journal', aliases: ['wsj', 'wall street journal'], domain: 'wsj.com' },
  {
    id: 'washington-post',
    name: 'The Washington Post',
    aliases: ['wapo', 'washington post'],
    domain: 'washingtonpost.com',
  },
  { id: 'the-athletic', name: 'The Athletic', aliases: ['athletic'], domain: 'theathletic.com' },
  { id: 'economist', name: 'The Economist', aliases: ['economist'], domain: 'economist.com' },
  { id: 'ft', name: 'Financial Times', aliases: ['ft', 'financial times'], domain: 'ft.com' },
  { id: 'bloomberg', name: 'Bloomberg', aliases: [], domain: 'bloomberg.com' },
  { id: 'reuters', name: 'Reuters', aliases: [], domain: 'reuters.com' },
  { id: 'medium', name: 'Medium', aliases: [], domain: 'medium.com' },
  { id: 'substack', name: 'Substack', aliases: [], domain: 'substack.com' },

  // Education & Learning
  { id: 'duolingo', name: 'Duolingo', aliases: ['duolingo plus', 'duolingo super'], domain: 'duolingo.com' },
  { id: 'coursera', name: 'Coursera Plus', aliases: ['coursera'], domain: 'coursera.org' },
  { id: 'udemy', name: 'Udemy', aliases: [], domain: 'udemy.com' },
  { id: 'skillshare', name: 'Skillshare', aliases: [], domain: 'skillshare.com' },
  { id: 'masterclass', name: 'MasterClass', aliases: [], domain: 'masterclass.com' },
  { id: 'linkedin-learning', name: 'LinkedIn Learning', aliases: ['lynda'], domain: 'linkedin.com' },
  { id: 'brilliant', name: 'Brilliant', aliases: [], domain: 'brilliant.org' },
  { id: 'datacamp', name: 'DataCamp', aliases: [], domain: 'datacamp.com' },
  { id: 'codecademy', name: 'Codecademy', aliases: [], domain: 'codecademy.com' },
  { id: 'pluralsight', name: 'Pluralsight', aliases: [], domain: 'pluralsight.com' },
  { id: 'treehouse', name: 'Treehouse', aliases: ['team treehouse'], domain: 'teamtreehouse.com' },

  // Food & Delivery
  { id: 'doordash', name: 'DoorDash DashPass', aliases: ['doordash', 'dashpass'], domain: 'doordash.com' },
  { id: 'uber-eats', name: 'Uber Eats Pass', aliases: ['uber eats', 'uber'], domain: 'ubereats.com' },
  { id: 'grubhub', name: 'Grubhub+', aliases: ['grubhub', 'grubhub plus'], domain: 'grubhub.com' },
  { id: 'instacart', name: 'Instacart+', aliases: ['instacart', 'instacart plus'], domain: 'instacart.com' },
  { id: 'gopuff', name: 'Gopuff Fam', aliases: ['gopuff'], domain: 'gopuff.com' },
  { id: 'hellofresh', name: 'HelloFresh', aliases: [], domain: 'hellofresh.com' },
  { id: 'blue-apron', name: 'Blue Apron', aliases: [], domain: 'blueapron.com' },
  { id: 'home-chef', name: 'Home Chef', aliases: [], domain: 'homechef.com' },

  // E-commerce & Retail
  { id: 'amazon-prime-full', name: 'Amazon Prime', aliases: ['prime', 'amazon'], domain: 'amazon.com' },
  { id: 'walmart-plus', name: 'Walmart+', aliases: ['walmart plus', 'walmart'], domain: 'walmart.com' },
  { id: 'target-circle', name: 'Target Circle 360', aliases: ['target circle', 'target'], domain: 'target.com' },
  { id: 'chewy', name: 'Chewy Autoship', aliases: ['chewy'], domain: 'chewy.com' },

  // Finance & Accounting
  { id: 'quickbooks', name: 'QuickBooks', aliases: ['qb'], domain: 'quickbooks.intuit.com' },
  { id: 'freshbooks', name: 'FreshBooks', aliases: [], domain: 'freshbooks.com' },
  { id: 'xero', name: 'Xero', aliases: [], domain: 'xero.com' },
  { id: 'wave', name: 'Wave', aliases: [], domain: 'waveapps.com' },
  { id: 'ynab', name: 'You Need a Budget', aliases: ['ynab'], domain: 'youneedabudget.com' },
  { id: 'mint', name: 'Mint', aliases: ['intuit mint'], domain: 'mint.intuit.com' },

  // Professional Services
  { id: 'linkedin', name: 'LinkedIn Premium', aliases: ['linkedin', 'linkedin premium'], domain: 'linkedin.com' },
  { id: 'patreon', name: 'Patreon', aliases: [], domain: 'patreon.com' },
  { id: 'onlyfans', name: 'OnlyFans', aliases: [], domain: 'onlyfans.com' },
  { id: 'ko-fi', name: 'Ko-fi', aliases: ['kofi'], domain: 'ko-fi.com' },

  // Transportation
  { id: 'uber-one', name: 'Uber One', aliases: ['uber'], domain: 'uber.com' },
  { id: 'lyft-pink', name: 'Lyft Pink', aliases: ['lyft'], domain: 'lyft.com' },
  { id: 'aaa', name: 'AAA', aliases: ['triple a'], domain: 'aaa.com' },

  // Social & Dating
  { id: 'tinder', name: 'Tinder Plus/Gold', aliases: ['tinder'], domain: 'tinder.com' },
  { id: 'bumble', name: 'Bumble Boost/Premium', aliases: ['bumble'], domain: 'bumble.com' },
  { id: 'hinge', name: 'Hinge+', aliases: ['hinge', 'hinge plus'], domain: 'hinge.co' },
  { id: 'match', name: 'Match.com', aliases: ['match'], domain: 'match.com' },

  // Photography & Video Editing
  { id: 'vsco', name: 'VSCO', aliases: [], domain: 'vsco.co' },
  { id: 'lightroom', name: 'Adobe Lightroom', aliases: ['lightroom'], domain: 'lightroom.adobe.com' },
  { id: 'final-cut', name: 'Final Cut Pro', aliases: ['final cut pro'], domain: 'apple.com' },
  { id: 'davinci-resolve', name: 'DaVinci Resolve', aliases: ['davinci'], domain: 'blackmagicdesign.com' },

  // Other
  { id: 'carrot-weather', name: 'CARROT Weather', aliases: ['carrot'], domain: 'carrotweather.com' },
  { id: 'dark-sky', name: 'Dark Sky', aliases: [], domain: 'darksky.net' },
  { id: 'fantastical', name: 'Fantastical', aliases: [], domain: 'flexibits.com' },
  { id: 'things', name: 'Things Cloud', aliases: ['things 3'], domain: 'culturedcode.com' },
  { id: 'todoist', name: 'Todoist', aliases: [], domain: 'todoist.com' },
  { id: 'evernote', name: 'Evernote', aliases: [], domain: 'evernote.com' },
  { id: 'bear', name: 'Bear', aliases: ['bear notes'], domain: 'bear.app' },
  { id: 'obsidian', name: 'Obsidian Sync', aliases: ['obsidian'], domain: 'obsidian.md' },
  { id: 'roam', name: 'Roam Research', aliases: ['roam'], domain: 'roamresearch.com' },
];
