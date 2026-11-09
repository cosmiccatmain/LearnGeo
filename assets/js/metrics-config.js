/* ------------------------------------------------------------------
   LearnGeo — analytics and ads IDs (LEA-116 / LEA-117).

   GA4_MEASUREMENT_ID: paste the GA4 Measurement ID from
   analytics.google.com (looks like G-XXXXXXXX). Leave it as an empty
   string until that ID exists — gtag is never loaded while it's empty.

   ADSENSE_PUBLISHER_ID: AdSense publisher ID. The matching official
   snippet also lives in every page <head> so Google can verify the site.

   ADS_ENABLED: the one switch for every placement (home / landing /
   teachers footers, Games hub units, pre-game wait). false while
   AdSense review is open — the head snippet and ads.txt stay. Set
   true to render those slots again. No other rewrite.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  global.LearnGeoMetricsConfig = {
    GA4_MEASUREMENT_ID: '',
    ADSENSE_PUBLISHER_ID: 'ca-pub-6903921330074472',
    ADS_ENABLED: false
  };
})(window);
