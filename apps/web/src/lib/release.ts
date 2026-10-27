import latest from '../../public/updates/latest.json';

/** Always the newest signed .dmg (refreshed by npm run publish:desktop). */
export const DOWNLOAD_URL = 'https://downloads.snip.rojinsharma.com/desktop/latest/Snip.dmg';

/**
 * Read from the same latest.json the app polls for updates, so the download page shows the
 * version that is actually live.
 */
export const LATEST_VERSION = latest.version;
