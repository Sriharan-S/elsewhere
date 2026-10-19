// The product name, domain and links live in site.config.json only.
import raw from '../site.config.json';

export const config = {
  ...raw,
  url: `https://${raw.domain}`,
  nameUpper: raw.name.toUpperCase(),
};

export default config;
