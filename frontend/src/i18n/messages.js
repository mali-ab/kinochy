// Message bundles for next-intl, loaded from the JSON translation files.
// Importing this module pulls every locale's bundle, so it stays server-side:
// the request config (request.ts) and the SEO label helpers (labelHelpers.js).
// The site layout passes only the active locale's messages to the client.
import en from '../../translations/en.json';
import ru from '../../translations/ru.json';
import tm from '../../translations/tm.json';

export const messages = { tm, en, ru };