// Component registry for build-time HTML markers: <!-- component:<name> attr="..." -->
// Every export here must be a pure function (attrs) => markup string, safe in Node and the browser.
export { logoSVG as logo, faviconSVG } from './logo.js';
export { icon } from './icons.js';
