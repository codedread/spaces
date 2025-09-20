/* global chrome */

/**
 * @typedef {import('./common.js').Space} Space
 */

import { getHashVariable } from './common.js';
import { checkSessionOverwrite, escapeHtml } from './utils.js';

const UNSAVED_SESSION_NAME = 'Unnamed window';
const UNSAVED_SESSION = `<em>${UNSAVED_SESSION_NAME}</em>`;
const nodes = {};
let globalSelectedSpace;
let bannerState;

// METHODS FOR RENDERING SIDENAV (spaces list)

function renderSpacesList(spaces) {
    let spaceEl;
    
    // Clear globalSelectedSpace at the start - it will be set if we find a match
    globalSelectedSpace = null;

    nodes.openSpaces.innerHTML = '';
    nodes.closedSpaces.innerHTML = '';

    spaces.forEach(space => {
        spaceEl = renderSpaceListEl(space);
        if (space.windowId) {
            nodes.openSpaces.appendChild(spaceEl);
        } else {
            nodes.closedSpaces.appendChild(spaceEl);
        }
    });
}

function renderSpaceListEl(space) {
    let hash;

    const listEl = document.createElement('li');
    const linkEl = document.createElement('a');

    if (space.sessionId) {
        hash = `#sessionId=${space.sessionId}`;
    } else if (space.windowId) {
        hash = `#windowId=${space.windowId}`;
    }
    linkEl.setAttribute('href', hash);

    if (space.name) {
        linkEl.innerHTML = escapeHtml(space.name);
    } else {
        linkEl.innerHTML = UNSAVED_SESSION;
    }

    // Check if this space should be selected based on current hash
    const currentSessionId = getHashVariable('sessionId', window.location.href);
    const currentWindowId = getHashVariable('windowId', window.location.href);
    
    if (
        (currentSessionId && space.sessionId && currentSessionId == space.sessionId) ||
        (currentWindowId && space.windowId && currentWindowId == space.windowId)
    ) {
        linkEl.className = 'selected';
        // Also update globalSelectedSpace for the detail view
        globalSelectedSpace = space;
    }

    // if (space && !space.windowId) {
    //     iconEl.className = 'icon fa fa-external-link';
    //     iconEl.setAttribute('title', 'Load this space');
    // } else {
    //     iconEl.className = 'icon fa fa-arrow-circle-right';
    //     iconEl.setAttribute('title', 'Switch to this space');
    // }
    // listEl.appendChild(iconEl);

    // //add event listener for each load/switch icon
    // iconEl.addEventListener("click", () => {
    //     handleLoadSpace(space.sessionId, space.windowId);
    // });

    listEl.appendChild(linkEl);
    return listEl;
}

// METHODS FOR RENDERING MAIN CONTENT (space detail)

function renderSpaceDetail(space, editMode) {
    updateNameForm(space);
    toggleNameEditMode(editMode);
    updateButtons(space);
    renderTabs(space);
}

function updateNameForm(space) {
    if (space && space.name) {
        nodes.nameFormInput.value = space.name;
        nodes.nameFormDisplay.innerHTML = escapeHtml(space.name);
    } else {
        nodes.nameFormInput.value = '';
        if (space) {
            nodes.nameFormDisplay.innerHTML = UNSAVED_SESSION;
        } else {
            nodes.nameFormDisplay.innerHTML = '';
        }
    }
}

function toggleNameEditMode(visible) {
    if (visible) {
        nodes.nameFormDisplay.style.display = 'none';
        nodes.nameFormInput.style.display = 'inline';
        nodes.nameFormInput.focus();
    } else {
        nodes.nameFormDisplay.style.display = 'inline';
        nodes.nameFormInput.style.display = 'none';
    }
}

function updateButtons(space) {
    const sessionId = space && space.sessionId ? space.sessionId : false;
    const windowId = space && space.windowId ? space.windowId : false;

    nodes.actionSwitch.style.display = windowId ? 'inline-block' : 'none';
    nodes.actionOpen.style.display =
        space && !windowId ? 'inline-block' : 'none';
    nodes.actionEdit.style.display =
        sessionId || windowId ? 'inline-block' : 'none';
    nodes.actionExport.style.display =
        sessionId || windowId ? 'inline-block' : 'none';
    nodes.actionDelete.style.display =
        !windowId && sessionId ? 'inline-block' : 'none';
    nodes.actionClose.style.display = windowId ? 'inline-block' : 'none';
}

function renderTabs(space) {
    nodes.activeTabs.innerHTML = '';
    nodes.historicalTabs.innerHTML = '';

    if (!space) {
        nodes.spaceDetailContainer.style.display = 'none';
    } else {
        nodes.spaceDetailContainer.style.display = 'block';

        space.tabs.forEach(tab => {
            nodes.activeTabs.appendChild(renderTabListEl(tab, space));
        });
        if (space.history) {
            space.history.forEach(tab => {
                nodes.historicalTabs.appendChild(
                    renderTabListEl(tab, space)
                );
            });
        } else {
            // TODO: hide historical tabs section
        }
    }
}

function renderTabListEl(tab, space) {
    let faviconSrc;

    const listEl = document.createElement('li');
    const linkEl = document.createElement('a');
    const faviconEl = document.createElement('img');

    // Use the provided favicon URL if it exists and is not a generic Chrome theme icon.
    if (tab.favIconUrl && tab.favIconUrl.indexOf('chrome://theme') < 0) {
        faviconSrc = tab.favIconUrl;
    // Otherwise, if the tab has a URL, construct a URL to fetch the favicon
    // via the extension's _favicon API. This is the recommended approach for Manifest V3.
    } else if (tab.url) {
        const pageUrl = encodeURIComponent(tab.url);
        faviconSrc = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${pageUrl}&size=16`;
    }
    
    if (faviconSrc) {
        faviconEl.setAttribute('src', faviconSrc);
    }

    linkEl.innerHTML = escapeHtml(tab.title ?? tab.url);
    linkEl.setAttribute('href', tab.url);
    linkEl.setAttribute('target', '_blank');

    // add event listener for each tab link
    linkEl.addEventListener('click', e => {
        e.preventDefault();
        handleLoadTab(space.sessionId, space.windowId, tab.url);
    });

    if (tab.duplicate) {
        linkEl.className = 'duplicate';
    }

    listEl.appendChild(faviconEl);
    listEl.appendChild(linkEl);
    return listEl;
}

function initialiseBanner(spaces) {
    let savedSpacesExist = false;

    savedSpacesExist = spaces.some(space => {
        if (space.name) return true;
        return false;
    });

    if (!savedSpacesExist) {
        setBannerState(1);
    }
}

async function setBannerState(state) {
    const lessonOneEl = document.getElementById('lessonOne');
    const lessonTwoEl = document.getElementById('lessonTwo');

    if (state !== bannerState) {
        bannerState = state;

        await toggleBanner(false);
        if (state > 0) {
            nodes.banner.style.display = 'block';
            if (state === 1) {
                lessonOneEl.style.display = 'block';
                lessonTwoEl.style.display = 'none';
            } else if (state === 2) {
                lessonOneEl.style.display = 'none';
                lessonTwoEl.style.display = 'block';
            }
            await toggleBanner(true);
        }
    }
}

async function toggleBanner(visible) {
    return new Promise(resolve => {
        setTimeout(() => {
            nodes.banner.className = visible ? ' ' : 'hidden';
            setTimeout(() => resolve(), 200);
        }, 100);
    });
}

function toggleModal(visible) {
    nodes.modalBlocker.style.display = visible ? 'block' : 'none';
    nodes.modalContainer.style.display = visible ? 'block' : 'none';

    if (visible) {
        nodes.modalInput.value = '';
        nodes.modalInput.focus();
    }
}

// ACTION HANDLERS

async function handleLoadSpace(sessionId, windowId) {
    if (sessionId) {
        await performLoadSession(sessionId);
        reroute(sessionId, false, false);
    } else if (windowId) {
        await performLoadWindow(windowId);
        reroute(false, windowId, false);
    }
}

async function handleLoadTab(sessionId, windowId, tabUrl) {
    if (sessionId) {
        await performLoadTabInSession(sessionId, tabUrl);
    } else if (windowId) {
        await performLoadTabInWindow(windowId, tabUrl);
    }
}

// if background page requests this page update, then assume we need to do a full page update
function handleAutoUpdateRequest(spaces) {
    let matchingSpaces;
    let selectedSpace;

    // re-render main spaces list
    updateSpacesList(spaces);

    // if we are currently viewing a space detail then update this object from returned spaces list
    if (globalSelectedSpace) {
        // look for currently selected space by sessionId
        if (globalSelectedSpace.sessionId) {
            matchingSpaces = spaces.filter(curSpace => {
                return curSpace.sessionId === globalSelectedSpace.sessionId;
            });
            if (matchingSpaces.length === 1) {
                [selectedSpace] = matchingSpaces;
            }

            // else look for currently selected space by windowId
        } else if (globalSelectedSpace.windowId) {
            matchingSpaces = spaces.filter(curSpace => {
                return curSpace.windowId === globalSelectedSpace.windowId;
            });
            if (matchingSpaces.length === 1) {
                [selectedSpace] = matchingSpaces;
            }
        }

        // update cache and re-render space detail view
        if (selectedSpace) {
            globalSelectedSpace = selectedSpace;
            updateSpaceDetail(true);
        } else {
            reroute(false, false, true);
        }
    }
}

async function handleNameSave() {
    const newName = nodes.nameFormInput.value;
    const oldName = globalSelectedSpace.name;
    const { sessionId } = globalSelectedSpace;
    const { windowId } = globalSelectedSpace;

    // if invalid name set then revert back to non-edit mode
    if (newName === oldName || newName.trim() === '') {
        updateNameForm(globalSelectedSpace);
        toggleNameEditMode(false);
        return;
    }

    const canOverwrite = await checkSessionOverwrite(newName);
    if (!canOverwrite) {
        updateNameForm(globalSelectedSpace);
        toggleNameEditMode(false);
        return;
    }

    // otherwise call the save service
    if (sessionId) {
        const session = await performSessionUpdate(newName, sessionId);
        if (session) reroute(session.id, false, true);
    } else if (windowId) {
        const session = await performNewSessionSave(newName, windowId);
        if (session) reroute(session.id, false, true);
    }

    // handle banner
    if (bannerState === 1) {
        setBannerState(2);
    }
}

async function handleDelete() {
    const { sessionId } = globalSelectedSpace;
    if (sessionId) {
        const session = await fetchSpaceDetail(sessionId, false);
        if (!session) {
            console.error(
                `handleDelete: No session found with id ${sessionId}`
            );
            return;
        }
        const sessionName = session.name || UNSAVED_SESSION_NAME;
        const confirm = window.confirm(
            `Are you sure you want to delete the space: ${sessionName}?`
        );

        if (confirm) {
            await performDelete(sessionId);
            updateSpacesList();
            reroute(false, false, true);
        }
    }
}

async function handleClose() {
  if (!globalSelectedSpace || !globalSelectedSpace.windowId) {
    console.error("No opened window is currently selected.");
    return;
  }
  const { windowId, sessionId } = globalSelectedSpace;

  // Only show confirm if the space is unnamed
  if (!sessionId) {
    const confirm = window.confirm(
      "Are you sure you want to close this window?"
    );
    if (!confirm) return;
  }

  chrome.runtime.sendMessage({ action: 'closeWindow', windowId });
  await updateSpacesList();

  // Clear the detail view since the closed window was selected
  globalSelectedSpace = null;
  renderSpaceDetail(false, false);
}

// import accepts either a newline separated list of urls or a json backup object
async function handleImport() {
    let urlList;
    let spaces;

    const rawInput = nodes.modalInput.value;

    // check for json object
    try {
        spaces = JSON.parse(rawInput);
        await performRestoreFromBackup(spaces);
        updateSpacesList();
    } catch (e) {
        // otherwise treat as a list of newline separated urls
        if (rawInput.trim().length > 0) {
            urlList = rawInput.split('\n');

            // filter out bad urls
            urlList = urlList.filter(url => {
                if (url.trim().length > 0 && url.indexOf('://') > 0)
                    return true;
                return false;
            });

            if (urlList.length > 0) {
                const session = await performSessionImport(urlList);
                if (session) reroute(session.id, false, true);
            }
        }
    }
}

async function handleBackup() {
    // Get all spaces in lean format for backup
    const leanSpaces = await getSpacesForBackup();

    const blob = new Blob([JSON.stringify(leanSpaces)], {
        type: 'application/json',
    });
    const blobUrl = URL.createObjectURL(blob);
    const filename = 'spaces-backup.json';
    const link = document.createElement('a');
    link.setAttribute('href', blobUrl);
    link.setAttribute('download', filename);
    link.click();
}

async function handleExport() {
    const { sessionId } = globalSelectedSpace;
    const { windowId } = globalSelectedSpace;
    let csvContent = '';
    let dataString = '';

    const space = await fetchSpaceDetail(sessionId, windowId);
    space.tabs.forEach(curTab => {
        const url = normaliseTabUrl(curTab.url);
        dataString += `${url}\n`;
    });
    csvContent += dataString;

    const blob = new Blob([csvContent], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);
    const filename = `${space.name || 'untitled'}.txt`;
    const link = document.createElement('a');
    link.setAttribute('href', blobUrl);
    link.setAttribute('download', filename);
    link.click();
}

// SERVICES

/** @returns {Promise<Space[]>} */
async function fetchAllSpaces() {
    return chrome.runtime.sendMessage({
        action: 'requestAllSpaces',
    });
}

/** @returns {Promise<Space>} */
async function fetchSpaceDetail(sessionId, windowId) {
    return chrome.runtime.sendMessage({
        action: 'requestSpaceDetail',
        sessionId: sessionId || false,
        windowId: windowId || false,
    });
}

/** @returns {Promise<void>} */
async function performLoadSession(sessionId) {
    return chrome.runtime.sendMessage({
        action: 'loadSession',
        sessionId,
    });
}

/** @returns {Promise<void>} */
async function performLoadWindow(windowId) {
    return chrome.runtime.sendMessage({
        action: 'loadWindow',
        windowId,
    });
}

/** @returns {Promise<void>} */
async function performLoadTabInSession(sessionId, tabUrl) {
    return chrome.runtime.sendMessage({
        action: 'loadTabInSession',
        sessionId,
        tabUrl,
    });
}

/** @returns {Promise<void>} */
async function performLoadTabInWindow(windowId, tabUrl) {
    return chrome.runtime.sendMessage({
        action: 'loadTabInWindow',
        windowId,
        tabUrl,
    });
}

/** @returns {Promise<void>} */
async function performDelete(sessionId) {
    return chrome.runtime.sendMessage({
        action: 'deleteSession',
        sessionId,
    });
}

/** @returns {Promise<Space>} */
async function performSessionUpdate(newName, sessionId) {
    return chrome.runtime.sendMessage({
        action: 'updateSessionName',
        deleteOld: true,
        sessionName: newName,
        sessionId,
    });
}

/** @returns {Promise<Space>} */
async function performNewSessionSave(newName, windowId) {
    return chrome.runtime.sendMessage({
        action: 'saveNewSession',
        deleteOld: true,
        sessionName: newName,
        windowId,
    });
}

/** @returns {Promise<Space>} */
async function performSessionImport(urlList) {
    return chrome.runtime.sendMessage({
        action: 'importNewSession',
        urlList,
    });
}

/** @returns {Promise<void>} */
async function performRestoreFromBackup(spaces) {
    for (const space of spaces) {
        const canOverwrite = await checkSessionOverwrite(space.name);
        if (!canOverwrite) {
            continue;
        }

        await chrome.runtime.sendMessage({
            action: 'restoreFromBackup',
            deleteOld: true,
            space,
        });
    }
}

// EVENT LISTENERS FOR STATIC DOM ELEMENTS

function addEventListeners() {
    // register hashchange listener
    window.onhashchange = async () => {
        await updateSpacesList();
        // Update the detail view using the globalSelectedSpace set by updateSpacesList
        await updateSpaceDetail(true);
    };

    // register incoming events listener
    chrome.runtime.onMessage.addListener(request => {
        if (request.action === 'updateSpaces' && request.spaces) {
            handleAutoUpdateRequest(request.spaces);
        }
    });

    // register dom listeners
    nodes.nameFormDisplay.addEventListener('click', () => {
        toggleNameEditMode(true);
    });
    nodes.nameFormInput.addEventListener('blur', () => {
        handleNameSave();
    });
    nodes.nameForm.addEventListener('submit', e => {
        e.preventDefault();
        handleNameSave();
    });
    nodes.actionSwitch.addEventListener('click', () => {
        handleLoadSpace(
            globalSelectedSpace.sessionId,
            globalSelectedSpace.windowId
        );
    });
    nodes.actionOpen.addEventListener('click', () => {
        handleLoadSpace(globalSelectedSpace.sessionId, false);
    });
    nodes.actionEdit.addEventListener('click', () => {
        toggleNameEditMode(true);
    });
    nodes.actionExport.addEventListener('click', () => {
        handleExport();
    });
    nodes.actionBackup.addEventListener('click', () => {
        handleBackup();
    });
    nodes.actionDelete.addEventListener('click', () => {
        handleDelete();
    });
    nodes.actionClose.addEventListener('click', () => {
        handleClose();
    });
    nodes.actionImport.addEventListener('click', e => {
        e.preventDefault();
        toggleModal(true);
    });
    nodes.modalBlocker.addEventListener('click', () => {
        toggleModal(false);
    });
    nodes.modalButton.addEventListener('click', () => {
        handleImport();
        toggleModal(false);
    });
}

// ROUTING

// update the hash with new ids (can trigger page re-render)
function reroute(sessionId, windowId, forceRerender) {
    let hash;

    hash = '#';
    if (sessionId) {
        hash += `sessionId=${sessionId}`;
    } else if (windowId) {
        hash += `windowId=${sessionId}`;
    }

    // if hash hasn't changed page will not trigger onhashchange event
    if (window.location.hash === hash) {
        if (forceRerender) {
            updateSpacesList();
            updateSpaceDetail();
        }

        // otherwise set new hash and let the change listener call routeHash
    } else {
        window.location.hash = hash;
    }
}

async function updateSpacesList(spaces) {
    // if spaces passed in then re-render immediately
    if (spaces) {
        renderSpacesList(spaces);

        // otherwise do a fetch of spaces first
    } else {
        const newSpaces = await fetchAllSpaces();
        renderSpacesList(newSpaces);

        // determine if welcome banner should show
        initialiseBanner(newSpaces);
    }
}

async function updateSpaceDetail(useCachedSpace) {
    const sessionId = getHashVariable('sessionId', window.location.href);
    const windowId = getHashVariable('windowId', window.location.href);
    const editMode = getHashVariable('editMode', window.location.href);

    // use cached currently selected space
    if (useCachedSpace) {
        addDuplicateMetadata(globalSelectedSpace);
        renderSpaceDetail(globalSelectedSpace, editMode);

        // otherwise refetch space based on hashvars
    } else if (sessionId || windowId) {
        const space = await fetchSpaceDetail(sessionId, windowId);
        addDuplicateMetadata(space);
        renderSpaceDetail(space, editMode);

        // otherwise hide space detail view
    } else {
        renderSpaceDetail(false, false);
    }
}

/**
 * Initialize the spaces window.
 * This function should be called from the HTML page after the DOM is loaded.
 */
// Auto-initialize when loaded in browser context
if (typeof window !== 'undefined') {
    window.onload = () => {
        // initialise global handles to key elements (singletons)
        nodes.home = document.getElementById('spacesHome');
        nodes.openSpaces = document.getElementById('openSpaces');
        nodes.closedSpaces = document.getElementById('closedSpaces');
        nodes.activeTabs = document.getElementById('activeTabs');
        nodes.historicalTabs = document.getElementById('historicalTabs');
        nodes.spaceDetailContainer = document.querySelector(
            '.content .contentBody'
        );
        nodes.nameForm = document.querySelector('#nameForm');
        nodes.nameFormDisplay = document.querySelector('#nameForm span');
        nodes.nameFormInput = document.querySelector('#nameForm input');
        nodes.actionSwitch = document.getElementById('actionSwitch');
        nodes.actionOpen = document.getElementById('actionOpen');
        nodes.actionEdit = document.getElementById('actionEdit');
        nodes.actionClose = document.getElementById('actionClose');
        nodes.actionExport = document.getElementById('actionExport');
        nodes.actionBackup = document.getElementById('actionBackup');
        nodes.actionDelete = document.getElementById('actionDelete');
        nodes.actionImport = document.getElementById('actionImport');
        nodes.banner = document.getElementById('banner');
        nodes.modalBlocker = document.querySelector('.blocker');
        nodes.modalContainer = document.querySelector('.modal');
        nodes.modalInput = document.getElementById('importTextArea');
        nodes.modalButton = document.getElementById('importBtn');

        nodes.home.setAttribute('href', chrome.runtime.getURL('spaces.html'));

        // initialise event listeners for static elements
        addEventListeners();

        // render side nav
        updateSpacesList();

        // render main content
        updateSpaceDetail();
    };
}

// Module-level helper functions.

/**
 * Adds duplicate metadata to tabs within a space.
 * Normalizes tab titles (using URL if title is missing) and marks tabs as duplicates
 * if multiple tabs have the same title.
 * 
 * @param {Space} space - The space object containing an array of tabs
 */
function addDuplicateMetadata(space) {
    if (!space || !Array.isArray(space.tabs)) {
        return;
    }
    const dupeCounts = {};

    space.tabs.forEach(tab => {
        // eslint-disable-next-line no-param-reassign
        tab.title = tab.title || tab.url;
        dupeCounts[tab.title] = dupeCounts[tab.title]
            ? dupeCounts[tab.title] + 1
            : 1;
    });
    space.tabs.forEach(tab => {
        // eslint-disable-next-line no-param-reassign
        tab.duplicate = dupeCounts[tab.title] > 1;
    });
}

/**
 * Extracts the original URL from a Great Suspender extension suspended tab URL.
 * Great Suspender URLs have the format: chrome-extension://id/suspended.html?uri=originalUrl
 * 
 * @param {string} url - The URL to normalize (should be a string)
 * @returns {string} The original URL if it's a suspended URL, otherwise returns the input unchanged
 * 
 * @example
 * normaliseTabUrl('chrome-extension://abc/suspended.html?uri=https://example.com')
 * // returns: 'https://example.com'
 * 
 * normaliseTabUrl('https://example.com')
 * // returns: 'https://example.com'
 */
function normaliseTabUrl(url) {
    let normalisedUrl = url;
    if (url.indexOf('suspended.html') > 0 && url.indexOf('uri=') > 0) {
        normalisedUrl = url.substring(url.indexOf('uri=') + 4, url.length);
    }
    return normalisedUrl;
}

/**
 * Gets all spaces and transforms them into lean format for backup/export.
 * Strips out unnecessary properties and normalizes URLs.
 * 
 * @returns {Promise<Object[]>} Promise resolving to array of lean space objects with only essential properties
 * 
 * @example
 * const leanSpaces = await getSpacesForBackup();
 * // returns: [{ name: 'Work', tabs: [{ title: 'Gmail', url: 'https://gmail.com', favIconUrl: 'icon.png' }] }]
 */
async function getSpacesForBackup() {
    const allSpaces = await fetchAllSpaces();
    return allSpaces.map(space => {
        return {
            name: space.name,
            tabs: space.tabs.map(curTab => {
                return {
                    title: curTab.title,
                    url: normaliseTabUrl(curTab.url),
                    favIconUrl: curTab.favIconUrl,
                };
            }),
        };
    });
}

// Export for testing
export { addDuplicateMetadata, getSpacesForBackup, normaliseTabUrl };
