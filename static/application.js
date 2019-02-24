{{define "js"}}

const logging = document.getElementById('status');
function log(msg) {
  const element = document.createElement('li');
  element.textContent = msg;
  document.querySelector('.js-log').appendChild(element);
}

function warn(msg) {
  document.querySelector('.js-warning').textContent = msg;
}

/**
 *
 **/
function register() {
  if (!('serviceWorker' in navigator)) {
    warn("ServiceWorker not supported");
    return;
  }
  if (!('PushManager' in window)) {
    warn("PushManager not supported");
    return;
  }

  navigator.serviceWorker.register('sw.js')
    .then(function() {
      requestPermission();
    })
    .catch(function(err) {
      warn('Unable to register service worker.', err);
    });
}

// This function is needed because Chrome doesn't accept a base64 encoded string
// as value for applicationServerKey in pushManager.subscribe yet
// https://bugs.chromium.org/p/chromium/issues/detail?id=802280
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  let outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function requestPermission() {
  new Promise(function(resolve, reject) {
    log('Request notification permission');
    const permissionResult = Notification
      .requestPermission(function(result) { resolve(result); });

    if (permissionResult) {
      permissionResult.then(resolve, reject);
    }
  }).then(function(permissionResult) {
    if (permissionResult !== 'granted') {
      warn('Permission not granted');
      return;
    }
    subscribeUserToPush();
  });
}

function subscribeUserToPush() {
  return navigator.serviceWorker.register('sw.js')
    .then(function(registration) {
      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      };

      log('Request push subscription');
      return registration.pushManager.subscribe(subscribeOptions);
    })
    .then(function(pushSubscription) {
      console.log('Received PushSubscription: ',
        JSON.stringify(pushSubscription));

      log('Store push subscription');
      return sendSubscriptionToBackEnd(pushSubscription);
    });
}

function sendSubscriptionToBackEnd(subscription) {
  return fetch('/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(subscription)
  })
    .then(function(response) {
      if (!response.ok) {
        warn('Could not store subscription');
        throw new Error('Bad status code from server.');
      }

      return response.json();
    })
    .then(function(responseData) {
      log("Received new key: " + responseData.key);
      log("Use " + window.location.href + "subscriptions/" + responseData.key
        + " to send notifications");
    });
}

{{end}}
