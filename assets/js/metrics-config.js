/* ------------------------------------------------------------------
   LearnGeo — analytics and ads IDs (LEA-116 / LEA-117).

   GA4_MEASUREMENT_ID: paste the GA4 Measurement ID from
   analytics.google.com (looks like G-XXXXXXXX). Leave it as an empty
   string until that ID exists — gtag is never loaded while it's empty.

   ADSENSE_PUBLISHER_ID: AdSense publisher ID. The matching official
   snippet also lives in every page <head> so Google can verify the site.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  global.LearnGeoMetricsConfig = {
    GA4_MEASUREMENT_ID: '',
    ADSENSE_PUBLISHER_ID: 'ca-pub-6903921330074472',
    /* Numeric ids from AdSense → Ads → By ad unit. Leave blank until
       those units exist — do not invent them. Display tags still
       request with the publisher id, an explicit size, and push(). */
    ADSENSE_UNIT_HORIZONTAL: '',
    ADSENSE_UNIT_RECTANGLE: '',
    ADSENSE_UNIT_VERTICAL: ''
  };
})(window);
