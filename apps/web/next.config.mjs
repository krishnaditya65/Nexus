import createNextIntlPlugin from 'next-intl/plugin';

// next-intl's plugin wires the request-scoped message loader (see
// ./i18n.ts) into Next's App Router build — required, not optional,
// wiring for the "no bare string literals" rule in docs/FRONTEND_STANDARDS.md.
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
