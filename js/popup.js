/* global chrome spacesRenderer */

import { getHashVariable } from './common.js';
import { spacesRenderer } from './spacesRenderer.js';
import { checkSessionOverwrite, escapeHtml } from './utils.js';

const UNSAVED_SESSION = '(unnamed window)';
const NO_HOTKEY = 'no hotkey set';

/**
 * Handles popup menu clicks by generating popup params and reloading
 * @param {string} action The popup action ('switch' or 'move')
 */
export async function handlePopupMenuClick(action) {
    const params = await chrome.runtime.sendMessage({'action': 'generatePopupParams', 'popupAction': action});
    if (!params) return;
    window.location.hash = params;
    window.location.reload();
}

const nodes = {};
let globalCurrentSpace;
let globalTabId;
let globalUrl;
let globalWindowId;
let globalSessionName;

/** Initialize the popup window. */
function initializePopup() {
    document.addEventListener('DOMContentLoaded', async () => {
        const url = getHashVariable('url', window.location.href);
        globalUrl = url !== '' ? decodeURIComponent(url) : false;
        const currentWindow = await chrome.windows.getCurrent({ populate: true });
        const windowId = currentWindow.id;
        globalWindowId = windowId !== '' ? windowId : false;
        globalTabId = getHashVariable('tabId', window.location.href);
        const sessionName = getHashVariable(
            'sessionName',
            window.location.href
        );
        globalSessionName =
            sessionName && sessionName !== 'false' ? sessionName : false;
        const action = getHashVariable('action', window.location.href);

        const requestSpacePromise = globalWindowId
            ? chrome.runtime.sendMessage({ action: 'requestSpaceFromWindowId', windowId: globalWindowId })
            : chrome.runtime.sendMessage({ action: 'requestCurrentSpace' });

        requestSpacePromise.then(space => {
            globalCurrentSpace = space;
            renderCommon();
            routeView(action);
        });
    });
}

// Auto-initialize when loaded in browser context
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    initializePopup();
}

function routeView(action) {
    if (action === 'move') {
        renderMoveCard();
    } else if (action === 'switch') {
        renderSwitchCard();
    } else {
        renderMainCard();
    }
}

/**
 * COMMON
 */

function renderCommon() {
    document.getElementById(
        'activeSpaceTitle'
    ).value = globalCurrentSpace.name
        ? globalCurrentSpace.name
        : UNSAVED_SESSION;

    document.querySelector('body').onkeyup = e => {
        // listen for escape key
        if (e.keyCode === 27) {
            handleCloseAction();
            // } else if (e.keyCode === 13) {
            //     handleNameSave();
        }
    };
    document.getElementById('spaceEdit').addEventListener('click', () => {
        handleNameEdit();
    });
    document
        .getElementById('activeSpaceTitle')
        .addEventListener('focus', () => {
            handleNameEdit();
        });
    document.getElementById('activeSpaceTitle').onkeyup = e => {
        // listen for enter key
        if (e.keyCode === 13) {
            document.getElementById('activeSpaceTitle').blur();
        }
    };
    document
        .getElementById('activeSpaceTitle')
        .addEventListener('blur', () => {
            handleNameSave();
        });
}

function handleCloseAction() {
    const opener = getHashVariable('opener', window.location.href);
    if (opener && opener === 'bg') {
        chrome.runtime.sendMessage({
            action: 'requestClose',
        });
    } else {
        window.close();
    }
}

/**
 * MAIN POPUP VIEW
 */

async function renderMainCard() {
    const hotkeys = await requestHotkeys();
        document.querySelector(
            '#switcherLink .hotkey'
        ).innerHTML = hotkeys.switchCode ? hotkeys.switchCode : NO_HOTKEY;
        document.querySelector(
            '#moverLink .hotkey'
        ).innerHTML = hotkeys.moveCode ? hotkeys.moveCode : NO_HOTKEY;

    const hotkeyEls = document.querySelectorAll('.hotkey');
    for (let i = 0; i < hotkeyEls.length; i += 1) {
        hotkeyEls[i].addEventListener('click', () => {
            chrome.runtime.sendMessage({
                action: 'requestShowKeyboardShortcuts',
            });
            window.close();
        });
    }

    document
        .querySelector('#allSpacesLink .optionText')
        .addEventListener('click', () => {
            chrome.runtime.sendMessage({
                action: 'requestShowSpaces',
            });
            window.close();
        });
    document
        .querySelector('#switcherLink .optionText')
        .addEventListener('click', () => handlePopupMenuClick('switch'));
    document
        .querySelector('#moverLink .optionText')
        .addEventListener('click', () => handlePopupMenuClick('move'));
}

async function requestHotkeys() {
    const commands = await chrome.commands.getAll();
    let switchStr;
    let moveStr;
    let spacesStr;

    commands.forEach(command => {
        if (command.name === 'spaces-switch') {
            switchStr = command.shortcut;
        } else if (command.name === 'spaces-move') {
            moveStr = command.shortcut;
        } else if (command.name === 'spaces-open') {
            spacesStr = command.shortcut;
        }
    });

    return {
        switchCode: switchStr,
        moveCode: moveStr,
        spacesCode: spacesStr,
    };
}

function handleNameEdit() {
    const inputEl = document.getElementById('activeSpaceTitle');
    inputEl.focus();
    if (inputEl.value === UNSAVED_SESSION) {
        inputEl.value = '';
    }
}

async function handleNameSave() {
    const inputEl = document.getElementById('activeSpaceTitle');
    const newName = inputEl.value;

    if (
        newName === UNSAVED_SESSION ||
        newName === globalCurrentSpace.name
    ) {
        return;
    }

    const canOverwrite = await checkSessionOverwrite(newName);
    if (!canOverwrite) {
        inputEl.value = globalCurrentSpace.name || UNSAVED_SESSION;
        inputEl.blur();
        return;
    }

    if (globalCurrentSpace.sessionId) {
        chrome.runtime.sendMessage({
            action: 'updateSessionName',
            deleteOld: true,
            sessionName: newName,
            sessionId: globalCurrentSpace.sessionId,
        });
    } else {
        chrome.runtime.sendMessage({
            action: 'saveNewSession',
            deleteOld: true,
            sessionName: newName,
            windowId: globalCurrentSpace.windowId,
        });
    }
}

/**
 * SWITCHER VIEW
 */

async function renderSwitchCard() {
    document.getElementById(
        'popupContainer'
    ).innerHTML = document.getElementById('switcherTemplate').innerHTML;
    
    const spaces = await chrome.runtime.sendMessage({ action: 'requestAllSpaces' });
    spacesRenderer.initialise(8, true);
    spacesRenderer.renderSpaces(spaces);

    document.getElementById('spaceSelectForm').onsubmit = e => {
        e.preventDefault();
        handleSwitchAction(getSelectedSpace());
    };

    const allSpaceEls = document.querySelectorAll('.space');
    Array.prototype.forEach.call(allSpaceEls, el => {
        // eslint-disable-next-line no-param-reassign
        el.onclick = () => {
            handleSwitchAction(el);
        };
    });
}

function getSelectedSpace() {
    return document.querySelector('.space.selected');
}

async function handleSwitchAction(selectedSpaceEl) {
    await chrome.runtime.sendMessage({
        action: 'switchToSpace',
        sessionId: selectedSpaceEl.getAttribute('data-sessionId'),
        windowId: selectedSpaceEl.getAttribute('data-windowId'),
    });
    // Wait for the response from the background message handler before
    // closing the window.
    window.close();
}

/**
 * MOVE VIEW
 */

async function renderMoveCard() {
    document.getElementById(
        'popupContainer'
    ).innerHTML = document.getElementById('moveTemplate').innerHTML;

    // initialise global handles to key elements (singletons)
    // nodes.home = document.getElementById('spacesHome');
    nodes.body = document.querySelector('body');
    nodes.spaceEditButton = document.getElementById('spaceEdit');
    nodes.moveForm = document.getElementById('spaceSelectForm');
    nodes.moveInput = document.getElementById('sessionsInput');
    nodes.activeSpaceTitle = document.getElementById('activeSpaceTitle');
    nodes.activeTabTitle = document.getElementById('activeTabTitle');
    nodes.activeTabFavicon = document.getElementById('activeTabFavicon');
    nodes.okButton = document.getElementById('moveBtn');
    nodes.cancelButton = document.getElementById('cancelBtn');

    // nodes.home.setAttribute('href', chrome.extension.getURL('spaces.html'));

    nodes.moveForm.onsubmit = e => {
        e.preventDefault();
        handleSelectAction();
    };

    nodes.body.onkeyup = e => {
        // highlight ok button when you start typing
        if (nodes.moveInput.value.length > 0) {
            nodes.okButton.className = 'button okBtn selected';
        } else {
            nodes.okButton.className = 'button okBtn';
        }

        // listen for escape key
        if (e.keyCode === 27) {
            handleCloseAction();
        }
    };

    nodes.spaceEditButton.onclick = () => {
        handleEditSpace();
    };
    nodes.okButton.onclick = () => {
        handleSelectAction();
    };
    nodes.cancelButton.onclick = () => {
        handleCloseAction();
    };

    // update currentSpaceDiv
    // nodes.windowTitle.innerHTML = "Current space: " + (globalSessionName ? globalSessionName : 'unnamed');
    nodes.activeSpaceTitle.innerHTML = escapeHtml(globalSessionName) || '(unnamed)';
    // selectSpace(nodes.activeSpace);

    await updateTabDetails();

    const spaces = await chrome.runtime.sendMessage({ action: 'requestAllSpaces' });
    // remove currently visible space
    const filteredSpaces = spaces.filter(space => {
        return `${space.windowId}` !== globalWindowId;
    });
    spacesRenderer.initialise(5, false);
    spacesRenderer.renderSpaces(filteredSpaces);

    const allSpaceEls = document.querySelectorAll('.space');
    for (const el of allSpaceEls) {
        // eslint-disable-next-line no-param-reassign
        const existingClickHandler = el.onclick;
        el.onclick = e => {
            existingClickHandler(e);
            handleSelectAction();
        };
    }
}

async function updateTabDetails() {
    let faviconSrc;

    // if we are working with an open chrome tab
    if (globalTabId.length > 0) {
        const tab = await chrome.runtime.sendMessage({
            action: 'requestTabDetail',
            tabId: globalTabId,
        });
        
        if (tab) {
            nodes.activeTabTitle.innerHTML = escapeHtml(tab.title);

            // try to get best favicon url path
            if (
                tab.favIconUrl &&
                tab.favIconUrl.indexOf('chrome://theme') < 0
            ) {
                faviconSrc = tab.favIconUrl;
            } else {
                // TODO(codedread): Fix this, it errors.
                // faviconSrc = `chrome://favicon/${tab.url}`;
            }
            nodes.activeTabFavicon.setAttribute('src', faviconSrc);

            nodes.moveInput.setAttribute(
                'placeholder',
                'Move tab to..'
            );

            // nodes.windowTitle.innerHTML = tab.title;
            // nodes.windowFavicon.setAttribute('href', faviconSrc);
        }

        // else if we are dealing with a url only
    } else if (globalUrl) {
        const cleanUrl =
            globalUrl.indexOf('://') > 0
                ? globalUrl.substr(
                        globalUrl.indexOf('://') + 3,
                        globalUrl.length
                    )
                : globalUrl;
        nodes.activeTabTitle.innerHTML = escapeHtml(cleanUrl);
        nodes.activeTabFavicon.setAttribute('src', '/img/new.png');

        nodes.moveInput.setAttribute('placeholder', 'Add tab to..');
    }
}

function handleSelectAction() {
    const selectedSpaceEl = document.querySelector('.space.selected');
    const sessionId = selectedSpaceEl.getAttribute('data-sessionId');
    const windowId = selectedSpaceEl.getAttribute('data-windowId');
    const newSessionName = nodes.moveInput.value;
    const params = {};

    if (sessionId && sessionId !== 'false') {
        params.sessionId = sessionId;

        if (globalTabId) {
            params.action = 'moveTabToSession';
            params.tabId = globalTabId;
        } else if (globalUrl) {
            params.action = 'addLinkToSession';
            params.url = globalUrl;
        }
    } else if (windowId && windowId !== 'false') {
        params.windowId = windowId;

        if (globalTabId) {
            params.action = 'moveTabToWindow';
            params.tabId = globalTabId;
        } else if (globalUrl) {
            params.action = 'addLinkToWindow';
            params.url = globalUrl;
        }
    } else {
        params.sessionName = newSessionName;

        if (globalTabId) {
            params.action = 'moveTabToNewSession';
            params.tabId = globalTabId;
        } else if (globalUrl) {
            params.action = 'addLinkToNewSession';
            params.url = globalUrl;
        }
    }

    chrome.runtime.sendMessage(params);
    // this window will be closed by background script
}

function handleEditSpace() {
    chrome.runtime.sendMessage({
        action: 'requestShowSpaces',
        windowId: globalWindowId,
        edit: 'true',
    });
}
