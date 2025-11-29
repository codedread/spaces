import { initializeServiceWorker } from './background.js';

console.log(`Spaces ${chrome.runtime.getManifest().version}`)
initializeServiceWorker();
