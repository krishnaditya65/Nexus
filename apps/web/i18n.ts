// next-intl's server-side message loader. docs/FRONTEND_STANDARDS.md's
// locale-resolution plan (tenant default + per-user override, both stored
// in services/auth) isn't built yet — that's a real gap, tracked there —
// so this always resolves 'en' for now. Every page still routes every
// user-facing string through next-intl's t() rather than a bare literal,
// so swapping in real locale resolution later touches this one function,
// not every component.
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = 'en';
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
