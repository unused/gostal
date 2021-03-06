'use strict';

/**
 * Handle received push events.
 **/
self.addEventListener('push', function(event) {
  const promiseChain = self.registration.showNotification(event.data.text());

  event.waitUntil(promiseChain);
});
