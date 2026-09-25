import firebaseConfig from "./config.js";

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


// =====================================================
// FIREBASE
// =====================================================

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
    prompt: "select_account"
});


// =====================================================
// STATE
// =====================================================

let firebaseUser = null;

let authRejectionMessage = "";

let allMessages = [];

let selectedDevice = "all";

let selectedCategory = "all";

let searchText = "";

let socket = null;

let reconnectTimer = null;

let pollingTimer = null;


// =====================================================
// DOM
// =====================================================

const authScreen =
    document.getElementById("authScreen");

const dashboardContent =
    document.getElementById("dashboardContent");

const authError =
    document.getElementById("authError");

const googleSignInBtn =
    document.getElementById("googleSignInBtn");

const googleSignOutBtn =
    document.getElementById("googleSignOutBtn");

const userInfo =
    document.getElementById("userInfo");

const userEmail =
    document.getElementById("userEmail");

const messagesList =
    document.getElementById("messagesList");

const emptyState =
    document.getElementById("emptyState");

const visibleCount =
    document.getElementById("visibleCount");

const searchInput =
    document.getElementById("searchInput");

const clearSearch =
    document.getElementById("clearSearch");

const refreshButton =
    document.getElementById("refreshButton");

const connectionDot =
    document.getElementById("connectionDot");

const connectionText =
    document.getElementById("connectionText");

const categoryDescription =
    document.getElementById("categoryDescription");


// =====================================================
// AUTH SCREEN
// =====================================================

function showAuthScreen(message = "") {

    if (authScreen) {
        authScreen.style.display = "flex";
    }

    if (dashboardContent) {
        dashboardContent.style.display = "none";
    }

    if (userInfo) {
        userInfo.style.display = "none";
    }

    if (googleSignInBtn) {
        googleSignInBtn.style.display = "inline-block";
    }

    if (googleSignOutBtn) {
        googleSignOutBtn.style.display = "none";
    }

    if (userEmail) {
        userEmail.textContent = "";
    }

    if (authError) {
        authError.textContent = message;
        authError.style.display =
            message ? "block" : "none";
    }
}


// =====================================================
// DASHBOARD
// =====================================================

function showDashboard(user) {

    if (authScreen) {
        authScreen.style.display = "none";
    }

    if (dashboardContent) {
        dashboardContent.style.display = "block";
    }

    if (userInfo) {
        userInfo.style.display = "flex";
    }

    if (googleSignInBtn) {
        googleSignInBtn.style.display = "none";
    }

    if (googleSignOutBtn) {
        googleSignOutBtn.style.display = "inline-block";
    }

    if (userEmail) {
        userEmail.textContent =
            user.email || "";
    }

    if (authError) {
        authError.textContent = "";
        authError.style.display = "none";
    }
}


// =====================================================
// GOOGLE SIGN IN
// =====================================================

async function signInWithGoogle() {

    try {

        // Clear previous error when user starts
        // a completely new login attempt.
        authRejectionMessage = "";

        showAuthScreen("");

        googleProvider.setCustomParameters({
            prompt: "select_account"
        });


        const result =
            await signInWithPopup(
                auth,
                googleProvider
            );


        const user =
            result.user;


        const email =
            (user.email || "")
                .trim()
                .toLowerCase();


        // =================================================
        // NORMAL GMAIL / WRONG DOMAIN
        // =================================================

        if (
            !email.endsWith("@usefaff.com")
        ) {

            authRejectionMessage =
                "Please sign in with your verified @usefaff.com account.";


            /*
             * Show the error BEFORE signing out.
             * This prevents the Firebase auth-state
             * callback from removing it.
             */
            showAuthScreen(
                authRejectionMessage
            );


            firebaseUser = null;


            await signOut(auth);


            /*
             * Show it again after signOut in case
             * Firebase changed the auth state.
             */
            showAuthScreen(
                authRejectionMessage
            );


            return;
        }


        // =================================================
        // UNVERIFIED COMPANY ACCOUNT
        // =================================================

        if (
            user.emailVerified !== true
        ) {

            authRejectionMessage =
                "Please sign in with your verified @usefaff.com account.";


            showAuthScreen(
                authRejectionMessage
            );


            firebaseUser = null;


            await signOut(auth);


            showAuthScreen(
                authRejectionMessage
            );


            return;
        }


        // =================================================
        // VALID ACCOUNT
        // =================================================

        authRejectionMessage = "";

        firebaseUser = user;

        showDashboard(user);

        await loadMessages();

        connectWebSocket();

        startPolling();


    } catch (error) {

        console.error(
            "Google sign-in failed:",
            error
        );


        if (
            error.code ===
            "auth/popup-closed-by-user"
        ) {

            showAuthScreen(
                "Sign-in was cancelled."
            );

        } else {

            showAuthScreen(
                error.message ||
                "Google sign-in failed."
            );

        }

    }
}


// =====================================================
// SIGN OUT
// =====================================================

async function signOutUser() {

    try {

        authRejectionMessage = "";

        firebaseUser = null;

        stopPolling();

        disconnectWebSocket();

        await signOut(auth);

        showAuthScreen("");

    } catch (error) {

        console.error(
            "Sign-out failed:",
            error
        );

    }
}


// =====================================================
// AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    async user => {

        // =================================================
        // LOGGED OUT
        // =================================================

        if (!user) {

            firebaseUser = null;

            stopPolling();

            disconnectWebSocket();

            allMessages = [];

            renderMessages();

            setConnectionStatus(
                false,
                "Sign in required"
            );


            /*
             * IMPORTANT:
             *
             * If this logout happened because an
             * unauthorized Gmail was rejected, keep
             * the rejection message.
             */

            if (
                authRejectionMessage
            ) {

                showAuthScreen(
                    authRejectionMessage
                );

            } else {

                showAuthScreen("");

            }

            return;
        }


        // =================================================
        // EMAIL
        // =================================================

        const email =
            (user.email || "")
                .trim()
                .toLowerCase();


        // =================================================
        // WRONG DOMAIN
        // =================================================

        if (
            !email.endsWith("@usefaff.com")
        ) {

            authRejectionMessage =
                "Please sign in with your verified @usefaff.com account.";


            showAuthScreen(
                authRejectionMessage
            );


            firebaseUser = null;

            await signOut(auth);

            return;
        }


        // =================================================
        // UNVERIFIED
        // =================================================

        if (
            user.emailVerified !== true
        ) {

            authRejectionMessage =
                "Please sign in with your verified @usefaff.com account.";


            showAuthScreen(
                authRejectionMessage
            );


            firebaseUser = null;

            await signOut(auth);

            return;
        }


        // =================================================
        // VALID USER
        // =================================================

        authRejectionMessage = "";

        firebaseUser = user;

        showDashboard(user);

        await loadMessages();

        connectWebSocket();

        startPolling();

    }
);


// =====================================================
// BUTTONS
// =====================================================

if (googleSignInBtn) {

    googleSignInBtn.addEventListener(
        "click",
        signInWithGoogle
    );

}


if (googleSignOutBtn) {

    googleSignOutBtn.addEventListener(
        "click",
        signOutUser
    );

}


// =====================================================
// INITIALIZE
// =====================================================

function initializeDashboard() {

    setupDeviceFilters();

    setupCategoryFilters();

    setupSearch();

    updateCategoryDescription();


    if (refreshButton) {

        refreshButton.addEventListener(
            "click",
            loadMessages
        );

    }
}


if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard
    );

} else {

    initializeDashboard();

}


// =====================================================
// AUTH FETCH
// =====================================================

async function getAuthToken() {

    if (!firebaseUser) {
        throw new Error(
            "Not authenticated"
        );
    }

    return await firebaseUser.getIdToken();
}


async function authFetch(
    url,
    options = {}
) {

    const token =
        await getAuthToken();

    options.headers = {
        ...(options.headers || {}),
        "Authorization":
            `Bearer ${token}`
    };

    return fetch(
        url,
        options
    );
}


// =====================================================
// LOAD MESSAGES
// =====================================================

async function loadMessages() {

    if (!firebaseUser) {
        return;
    }


    try {

        const response =
            await authFetch(
                "/api/messages",
                {
                    method: "GET",
                    cache: "no-store"
                }
            );


        if (
            response.status === 401
        ) {

            await signOut(auth);

            return;
        }


        if (!response.ok) {

            throw new Error(
                `Failed to load messages: ${response.status}`
            );

        }


        const data =
            await response.json();


        if (
            Array.isArray(data)
        ) {

            allMessages = data;

        } else if (
            Array.isArray(data.messages)
        ) {

            allMessages =
                data.messages;

        } else {

            allMessages = [];

        }


        sortMessages();

        renderMessages();

        setConnectionStatus(
            true,
            "Live"
        );


    } catch (error) {

        console.error(
            "Failed to load messages:",
            error
        );

        setConnectionStatus(
            false,
            "Server error"
        );

    }
}


// =====================================================
// SORT
// =====================================================

function sortMessages() {

    allMessages.sort(
        (a, b) => {

            const dateA =
                new Date(
                    a.timestamp || 0
                ).getTime();

            const dateB =
                new Date(
                    b.timestamp || 0
                ).getTime();

            return dateB - dateA;
        }
    );
}


// =====================================================
// DEVICE FILTERS
// =====================================================

function setupDeviceFilters() {

    const buttons =
        document.querySelectorAll(
            "#deviceFilters .filter-btn"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    selectedDevice =
                        button.dataset.device ||
                        "all";


                    buttons.forEach(
                        btn => {

                            btn.classList.remove(
                                "active"
                            );

                        }
                    );


                    button.classList.add(
                        "active"
                    );


                    updateCategoryDescription();

                    renderMessages();

                }
            );

        }
    );
}


// =====================================================
// CATEGORY FILTERS
// =====================================================

function setupCategoryFilters() {

    const buttons =
        document.querySelectorAll(
            "#categoryFilters .filter-btn"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    selectedCategory =
                        button.dataset.category ||
                        "all";


                    buttons.forEach(
                        btn => {

                            btn.classList.remove(
                                "active"
                            );

                        }
                    );


                    button.classList.add(
                        "active"
                    );


                    updateCategoryDescription();

                    renderMessages();

                }
            );

        }
    );
}


// =====================================================
// CATEGORY DESCRIPTION
// =====================================================

function updateCategoryDescription() {

    if (!categoryDescription) {
        return;
    }


    if (
        selectedCategory === "all"
    ) {

        if (
            selectedDevice === "all"
        ) {

            categoryDescription.textContent =
                "Showing all SMS messages";

        } else {

            categoryDescription.textContent =
                `Showing all SMS from ${formatDeviceName(selectedDevice)}`;

        }

        return;
    }


    if (
        selectedDevice === "all"
    ) {

        categoryDescription.textContent =
            `Showing ${selectedCategory} messages from all phones`;

    } else {

        categoryDescription.textContent =
            `Showing ${selectedCategory} messages from ${formatDeviceName(selectedDevice)}`;

    }
}


// =====================================================
// SEARCH
// =====================================================

function setupSearch() {

    if (!searchInput) {
        return;
    }


    searchInput.addEventListener(
        "input",
        () => {

            searchText =
                searchInput.value
                    .trim()
                    .toLowerCase();


            updateClearButton();

            renderMessages();

        }
    );


    if (clearSearch) {

        clearSearch.addEventListener(
            "click",
            () => {

                searchInput.value = "";

                searchText = "";

                updateClearButton();

                renderMessages();

                searchInput.focus();

            }
        );

    }


    updateClearButton();
}


function updateClearButton() {

    if (!clearSearch) {
        return;
    }


    if (
        searchInput &&
        searchInput.value.length > 0
    ) {

        clearSearch.style.display =
            "flex";

    } else {

        clearSearch.style.display =
            "none";

    }
}


// =====================================================
// FILTER
// =====================================================

function getFilteredMessages() {

    return allMessages.filter(
        message => {

            if (
                selectedDevice !== "all" &&
                String(
                    message.device_id || ""
                ).toLowerCase() !==
                selectedDevice.toLowerCase()
            ) {

                return false;
            }


            if (
                selectedCategory !== "all" &&
                String(
                    message.category || ""
                ).toLowerCase() !==
                selectedCategory.toLowerCase()
            ) {

                return false;
            }


            if (searchText) {

                const sender =
                    String(
                        message.sender || ""
                    ).toLowerCase();

                const body =
                    String(
                        message.body || ""
                    ).toLowerCase();

                const category =
                    String(
                        message.category || ""
                    ).toLowerCase();

                const device =
                    String(
                        message.device_id || ""
                    ).toLowerCase();


                if (
                    !sender.includes(searchText) &&
                    !body.includes(searchText) &&
                    !category.includes(searchText) &&
                    !device.includes(searchText)
                ) {

                    return false;
                }
            }


            return true;
        }
    );
}


// =====================================================
// RENDER
// =====================================================

function renderMessages() {

    if (!messagesList) {
        return;
    }


    const filteredMessages =
        getFilteredMessages();


    messagesList.innerHTML = "";


    if (visibleCount) {

        const count =
            filteredMessages.length;

        visibleCount.textContent =
            `${count} ${
                count === 1
                    ? "message"
                    : "messages"
            }`;
    }


    if (
        filteredMessages.length === 0
    ) {

        if (emptyState) {
            emptyState.style.display =
                "block";
        }

        return;
    }


    if (emptyState) {
        emptyState.style.display =
            "none";
    }


    filteredMessages.forEach(
        message => {

            messagesList.appendChild(
                createMessageCard(
                    message
                )
            );

        }
    );
}


// =====================================================
// MESSAGE CARD
// =====================================================

function createMessageCard(
    message
) {

    const card =
        document.createElement(
            "article"
        );


    card.className =
        "message-card";


    card.classList.add(
        message.is_read
            ? "read"
            : "unread"
    );


    const topRow =
        document.createElement(
            "div"
        );

    topRow.className =
        "message-top";


    const sender =
        document.createElement(
            "div"
        );

    sender.className =
        "message-sender";

    sender.textContent =
        message.sender ||
        "Unknown";


    const badges =
        document.createElement(
            "div"
        );

    badges.className =
        "message-badges";


    const deviceBadge =
        document.createElement(
            "span"
        );

    deviceBadge.className =
        "device-badge " +
        String(
            message.device_id ||
            "samsung"
        ).toLowerCase();

    deviceBadge.textContent =
        formatDeviceName(
            message.device_id ||
            "samsung"
        );


    const categoryBadge =
        document.createElement(
            "span"
        );

    categoryBadge.className =
        "category-badge";

    categoryBadge.textContent =
        message.category ||
        "Other";


    badges.appendChild(
        deviceBadge
    );

    badges.appendChild(
        categoryBadge
    );


    topRow.appendChild(
        sender
    );

    topRow.appendChild(
        badges
    );


    const time =
        document.createElement(
            "div"
        );

    time.className =
        "message-time";

    time.textContent =
        formatTimestamp(
            message.timestamp
        );


    const body =
        document.createElement(
            "div"
        );

    body.className =
        "message-body";

    body.textContent =
        message.body ||
        "";


    const actions =
        document.createElement(
            "div"
        );

    actions.className =
        "message-actions";


    if (!message.is_read) {

        const readButton =
            document.createElement(
                "button"
            );

        readButton.type =
            "button";

        readButton.className =
            "message-action";

        readButton.textContent =
            "Mark as read";


        readButton.addEventListener(
            "click",
            () => {

                markAsRead(
                    message.id
                );

            }
        );


        actions.appendChild(
            readButton
        );
    }


    card.appendChild(
        topRow
    );

    card.appendChild(
        time
    );

    card.appendChild(
        body
    );


    if (
        actions.children.length > 0
    ) {

        card.appendChild(
            actions
        );

    }


    return card;
}


// =====================================================
// MARK AS READ
// =====================================================

async function markAsRead(id) {

    try {

        const response =
            await authFetch(
                `/api/messages/${id}/read`,
                {
                    method: "PATCH"
                }
            );


        if (
            response.status === 401
        ) {

            await signOut(auth);

            return;
        }


        if (!response.ok) {

            throw new Error(
                `Failed to mark message as read: ${response.status}`
            );
        }


        const message =
            allMessages.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (message) {
            message.is_read = true;
        }


        renderMessages();


    } catch (error) {

        console.error(
            "Mark as read failed:",
            error
        );

        alert(
            "Unable to mark this message as read."
        );
    }
}


// =====================================================
// WEBSOCKET
// =====================================================

async function connectWebSocket() {

    if (!firebaseUser) {
        return;
    }


    if (
        socket &&
        (
            socket.readyState ===
            WebSocket.OPEN ||
            socket.readyState ===
            WebSocket.CONNECTING
        )
    ) {

        return;
    }


    try {

        const token =
            await getAuthToken();


        const protocol =
            window.location.protocol ===
            "https:"
                ? "wss:"
                : "ws:";


        const wsUrl =
            `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;


        socket =
            new WebSocket(
                wsUrl
            );


        socket.onopen =
            () => {

                console.log(
                    "WebSocket connected"
                );

                setConnectionStatus(
                    true,
                    "Live"
                );
            };


        socket.onmessage =
            event => {

                try {

                    const payload =
                        JSON.parse(
                            event.data
                        );


                    const message =
                        payload &&
                        payload.message
                            ? payload.message
                            : payload;


                    if (
                        !message ||
                        typeof message !==
                        "object"
                    ) {

                        return;
                    }


                    if (!message.id) {
                        return;
                    }


                    const exists =
                        allMessages.some(
                            item =>
                                String(
                                    item.id
                                ) ===
                                String(
                                    message.id
                                )
                        );


                    if (!exists) {

                        allMessages.unshift(
                            message
                        );

                        sortMessages();

                        renderMessages();
                    }


                } catch (error) {

                    console.error(
                        "WebSocket message error:",
                        error
                    );
                }
            };


        socket.onerror =
            error => {

                console.error(
                    "WebSocket error:",
                    error
                );

                setConnectionStatus(
                    false,
                    "Offline"
                );
            };


        socket.onclose =
            () => {

                socket = null;

                setConnectionStatus(
                    false,
                    "Reconnecting..."
                );


                clearTimeout(
                    reconnectTimer
                );


                if (firebaseUser) {

                    reconnectTimer =
                        setTimeout(
                            () => {
                                connectWebSocket();
                            },
                            3000
                        );
                }
            };


    } catch (error) {

        console.error(
            "WebSocket connection failed:",
            error
        );

        setConnectionStatus(
            false,
            "Offline"
        );
    }
}


// =====================================================
// DISCONNECT WEBSOCKET
// =====================================================

function disconnectWebSocket() {

    clearTimeout(
        reconnectTimer
    );

    reconnectTimer = null;


    if (socket) {

        socket.onclose = null;

        socket.close();

        socket = null;
    }
}


// =====================================================
// POLLING
// =====================================================

function startPolling() {

    stopPolling();


    pollingTimer =
        setInterval(
            () => {

                if (firebaseUser) {
                    loadMessages();
                }

            },
            3000
        );
}


function stopPolling() {

    if (pollingTimer) {

        clearInterval(
            pollingTimer
        );

        pollingTimer = null;
    }
}


// =====================================================
// CONNECTION STATUS
// =====================================================

function setConnectionStatus(
    connected,
    text
) {

    if (connectionDot) {

        connectionDot.classList.toggle(
            "connected",
            connected
        );

        connectionDot.classList.toggle(
            "disconnected",
            !connected
        );
    }


    if (connectionText) {

        connectionText.textContent =
            text;
    }
}


// =====================================================
// DEVICE NAME
// =====================================================

function formatDeviceName(
    device
) {

    const value =
        String(
            device || ""
        ).toLowerCase();


    if (value === "samsung") {
        return "Samsung";
    }


    if (value === "poco") {
        return "Poco";
    }


    return device ||
        "Unknown";
}


// =====================================================
// TIMESTAMP
// =====================================================

function formatTimestamp(
    timestamp
) {

    if (!timestamp) {
        return "";
    }


    const date =
        new Date(timestamp);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(timestamp);
    }


    return date.toLocaleString(
        undefined,
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}