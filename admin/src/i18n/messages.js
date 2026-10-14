// Message bundles for the admin panel, mirrored from the site's JSON
// translation files. The admin switches language client-side without a
// navigation, so all locales are bundled together here — unlike the public
// site, which only ships the active locale.
import en from '../../translations/en.json';
import ru from '../../translations/ru.json';
import tm from '../../translations/tm.json';

export const messages = { tm, en, ru };
