/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-8d0d8005'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "soundclear-logo.png",
    "revision": "0d6b9e341a946e3985ad021e034b5d5d"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "97d2ac71f3febf60a2b52941239365b1"
  }, {
    "url": "pwa-512x512.png",
    "revision": "578499b0957b4ee085567b121120880d"
  }, {
    "url": "pwa-192x192.png",
    "revision": "0c0d9d32c59709ae3a2021ad9bd37168"
  }, {
    "url": "index.html",
    "revision": "7677579d60ac99658655cda4a09a79ae"
  }, {
    "url": "icon.svg",
    "revision": "27a62076a7449fd8bf09f6f1a2ad4aa1"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "29e2733301c18dd00a105fb9fe1bf23c"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/web-DpOsqOQT.js",
    "revision": null
  }, {
    "url": "assets/web-BaZxfAZ2.js",
    "revision": null
  }, {
    "url": "assets/index-D2a0CPdz.js",
    "revision": null
  }, {
    "url": "assets/index-CIALtT-7.css",
    "revision": null
  }, {
    "url": "assets/aistudio/image_9d5c39c0.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_545670c6.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_31d11c06.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4322_2c690fea.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4321_46195de7.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4320_a5cea1c4.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4319_db3c425f.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4318_5aa8c442.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4317_7621474d.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4282_180d5b83.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4281_340941dc.png",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_4280_2a325aea.png",
    "revision": null
  }, {
    "url": "assets/aistudio/75DD2556-E7B1-4261-84AE-EE04912ABEF1_8c38c95c.png",
    "revision": null
  }, {
    "url": "assets/aistudio/19A298DE-2EBE-41B0-894E-9D6A8F339285_0a9e3133.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "29e2733301c18dd00a105fb9fe1bf23c"
  }, {
    "url": "icon.svg",
    "revision": "27a62076a7449fd8bf09f6f1a2ad4aa1"
  }, {
    "url": "pwa-192x192.png",
    "revision": "0c0d9d32c59709ae3a2021ad9bd37168"
  }, {
    "url": "pwa-512x512.png",
    "revision": "578499b0957b4ee085567b121120880d"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "97d2ac71f3febf60a2b52941239365b1"
  }, {
    "url": "soundclear-logo.png",
    "revision": "0d6b9e341a946e3985ad021e034b5d5d"
  }, {
    "url": "manifest.webmanifest",
    "revision": "41270d6c65aa77d2085bd5a11dd36059"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//]
  }));
  workbox.registerRoute(/\/api\/(home|charts|moods)(\?.*)?$/i, new workbox.NetworkFirst({
    "cacheName": "soundclear-catalog-api-cache",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 25,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
