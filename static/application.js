{{define "js"}}

const STEPS = {
  permission: 'Request notification permission',
  register:   'Request push subscription',
  store:      'Store push subscription',
  display:    'Receive key',
};

const ERRORS = {
  serviceworker: `ServiceWorker not supported. Sorry mate you need to update
    your browser.`,
  pushmanager: `PushManager not supported. Sorry mate you need to update
    your browser.`,
  swregister: 'Unable to register service worker, because: ',
  permission: `Permission not granted, if you want to receive notifications
    then you should better allow notifications.`,
  store: 'Could not store subscription',
};

/**
 * Init the inactive steps to show progress of the registration.
 **/
function initSteps() {
  let stepList = document.createElement('ul');
  stepList.className = 'steps';
  Object.values(STEPS).forEach(text => {
    let step = document.createElement('li');
    step.textContent = text;
    stepList.appendChild(step);
  });
  let stepSection = document.createElement('section');
  stepSection.appendChild(stepList)

  document.querySelector('main').appendChild(stepSection);
}

/**
 * Mark the last non-completed step as completed.
 **/
function completeStep() {
  document.querySelector('li:not(.active)').className = 'active';
}

/**
 * Show part of the key in the last step.
 **/
function showKeyInSteps(key) {
  let keyBox = document.createElement('span');
  keyBox.textContent = key;
  document.querySelector('li:last-of-type').appendChild(keyBox);
}

/**
 * Show result, provide a usage example and include the key.
 **/
function showResult(key) {
  let header = document.createElement('h2');
  header.className = 'subtitle';
  header.textContent = 'What now?';
  let message = document.createElement('p');
  message.textContent = 'Use the received key to trigger the notifications in'
    + ' registred device (client).';
  let example = document.createElement('textarea');
  example.className = 'usage-example';
  example.value = 'curl -XPOST --data "Wait, what?" ';
  example.value += window.location + 'subscriptions/';
  example.value += key;

  let result = document.createElement('section');
  result.appendChild(header);
  result.appendChild(message);
  result.appendChild(example);

  document.querySelector('main').appendChild(result);
}

/**
 * Display some error message.
 **/
function showError(msg) {
  let message = document.createElement('p');
  message.className = 'error-message';
  message.textContent = 'Oh no! ' + msg;

  document.querySelector('main > section')
    .appendChild(message);
}

/**
 * Register a service worker.
 **/
function register() {
  initSteps();

  if (!('serviceWorker' in navigator)) {
    showError(ERRORS['serviceworker']);
    return;
  }
  if (!('PushManager' in window)) {
    showError(ERRORS['pushmanager']);
    return;
  }

  let button = document.querySelector('button');
  button.removeEventListener('click', register);
  button.disabled = true;

  navigator.serviceWorker.register('sw.js')
    .then(function() {
      completeStep();
      requestPermission();
    })
    .catch(function(err) {
      showError(ERRORS['swregister'] + err);
    });
}

/**
 * This function is needed because Chrome doesn't accept a base64 encoded
 * string as value for applicationServerKey in pushManager.subscribe yet, see
 * https://bugs.chromium.org/p/chromium/issues/detail?id=802280
 **/
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

/**
 * Request permission to send notifications. THis will open a browser dialog
 * asking the user for permission.
 **/
function requestPermission() {
  new Promise(function(resolve, reject) {
    const permissionResult = Notification
      .requestPermission(function(result) { resolve(result); });

    if (permissionResult) {
      permissionResult.then(resolve, reject);
    }
  }).then(function(permissionResult) {
    if (permissionResult !== 'granted') {
      showError(ERRORS[permission]);
      return;
    }
    completeStep();
    subscribeUserToPush();
  });
}

/**
 * Subscribe a user to push notifications. The browser client will take care
 * for registering and providing endpoint and credentials to deliver
 * notifications.
 **/
function subscribeUserToPush() {
  return navigator.serviceWorker
    .register('sw.js')
    .then(function(registration) {
      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      };

      return registration.pushManager.subscribe(subscribeOptions);
    })
    .then(function(pushSubscription) {
      console.debug('Received PushSubscription: ', pushSubscription);

      completeStep();
      return sendSubscriptionToBackEnd(pushSubscription);
    });
}

/**
 * Send subscription information to server.
 **/
function sendSubscriptionToBackEnd(subscription) {
  return fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  })
    .then(function(response) {
      if (!response.ok) {
        showError(ERRORS['store']);
        throw new Error('Bad status code from server.');
      }

      completeStep();
      return response.json();
    })
    .then(function(responseData) {
      showKeyInSteps(responseData.key);
      showResult(responseData.key);
    });
}

{{end}}
