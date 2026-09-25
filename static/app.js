// =====================================================
// FIREBASE
// =====================================================

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


const firebaseApp =
    initializeApp(firebaseConfig);

const auth =
    getAuth(firebaseApp);

const googleProvider =
    new GoogleAuthProvider();


// =====================================================
// GLOBAL STATE
// =====================================================

let firebaseUser = null;

let allMessages = [];

let selectedDevice = "all";

let selectedCategory = "all";

let searchText = "";

let socket = null;

let reconnectTimer = null;


// =====================================================
// DOM ELEMENTS
// =====================================================

const authScreen =
    document.getElementById("authScreen");

const dashboardContent =
    document.getElementById("dashboardContent");

const googleSignInBtn =
    document.getElementById("googleSignInBtn");

const googleSignOutBtn =
    document.getElementById("googleSignOutBtn");

const userInfo =
    document.getElementById("userInfo");

const userEmail =
    document.getElementById("userEmail");

const authError =
    document.getElementById("authError");


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
// FIREBASE AUTH TOKEN
// =====================================================

async function getAuthToken() {

    if (!firebaseUser) {
        throw new Error("Authentication required");
    }

    return await firebaseUser.getIdToken();

}


// =====================================================
// AUTHENTICATED FETCH
// =====================================================

async function authFetch(
    url,
    options = {}
) {

    const token =
        await getAuthToken();


    const headers = {
        ...(options.headers || {}),
        "Authorization": `Bearer ${token}`
    };


    return fetch(
        url,
        {
            ...options,
            headers
        }
    );

}


// =====================================================
// AUTH SCREEN
// =====================================================

function showAuthScreen(
    message = ""
) {

    if (authScreen) {

        authScreen.style.display =
            "flex";

    }


    if (dashboardContent) {

        dashboardContent.style.display =
            "none";

    }


    if (userInfo) {

        userInfo.style.display =
            "none";

    }


    if (authError) {

        if (message) {

            authError.textContent =
                message;

            authError.style.display =
                "block";

        } else {

            authError.textContent =
                "";

            authError.style.display =
                "none";

        }

    }


    if (googleSignInBtn) {

        googleSignInBtn.disabled =
            false;

        googleSignInBtn.textContent =
            "Sign in with Google";

    }

}


// =====================================================
// SHOW DASHBOARD
// =====================================================

function showDashboard(
    user
) {

    if (authScreen) {

        authScreen.style.display =
            "none";

    }


    if (dashboardContent) {

        dashboardContent.style.display =
            "block";

    }


    if (userInfo) {

        userInfo.style.display =
            "flex";

    }


    if (userEmail) {

        userEmail.textContent =
            user.email || "";

    }


    if (authError) {

        authError.textContent =
            "";

        authError.style.display =
            "none";

    }

}


// =====================================================
// GOOGLE SIGN-IN
// =====================================================

if (googleSignInBtn) {

    googleSignInBtn.addEventListener(
        "click",
        async () => {

            try {

                googleSignInBtn.disabled =
                    true;

                googleSignInBtn.textContent =
                    "Signing in...";


                await signInWithPopup(
                    auth,
                    googleProvider
                );


            } catch (error) {

                console.error(
                    "Google sign-in failed:",
                    error
                );


                googleSignInBtn.disabled =
                    false;

                googleSignInBtn.textContent =
                    "Sign in with Google";


                /*
                 * User closed the Google popup.
                 * Don't show an error for that.
                 */

                if (
                    error.code ===
                    "auth/popup-closed-by-user"
                ) {

                    return;

                }


                showAuthScreen(
                    "Google sign-in failed. Please try again."
                );

            }

        }
    );

}


// =====================================================
// GOOGLE SIGN-OUT
// =====================================================

if (googleSignOutBtn) {

    googleSignOutBtn.addEventListener(
        "click",
        async () => {

            try {

                disconnectWebSocket();


                firebaseUser =
                    null;


                allMessages =
                    [];


                renderMessages();


                await signOut(
                    auth
                );


            } catch (error) {

                console.error(
                    "Google sign-out failed:",
                    error
                );

            }

        }
    );

}


// =====================================================
// FIREBASE AUTH STATE
// =====================================================

onAuthStateChanged(
    auth,
    async (user) => {

        // =================================================
        // NOT SIGNED IN
        // =================================================

        if (!user) {

            firebaseUser =
                null;


            disconnectWebSocket();


            allMessages =
                [];


            renderMessages();


            showAuthScreen();


            setConnectionStatus(
                false,
                "Sign in required"
            );


            return;

        }


        // =================================================
        // CHECK EMAIL
        // =================================================

        const email =
            String(
                user.email || ""
            ).toLowerCase();


        const isVerified =
            user.emailVerified === true;


        const isCompanyEmail =
            email.endsWith(
                "@usefaff.com"
            );


        // =================================================
        // REJECT PERSONAL ACCOUNTS
        // =================================================

        if (
            !isVerified ||
            !isCompanyEmail
        ) {

            firebaseUser =
                null;


            disconnectWebSocket();


            allMessages =
                [];


            renderMessages();


            /*
             * Sign the unauthorized user out.
             * The dashboard remains hidden.
             */

            try {

                await signOut(
                    auth
                );

            } catch (error) {

                console.error(
                    "Failed to sign out unauthorized user:",
                    error
                );

            }


            showAuthScreen(
                "Please sign in with your verified @usefaff.com account."
            );


            return;

        }


        // =================================================
        // APPROVED COMPANY USER
        // =================================================

        firebaseUser =
            user;


        showDashboard(
            user
        );


        try {

            await loadMessages();

            connectWebSocket();

        } catch (error) {

            console.error(
                "Dashboard initialization failed:",
                error
            );

        }

    }
);


// =====================================================
// INITIALIZE DASHBOARD CONTROLS
// =====================================================

setupDeviceFilters();

setupCategoryFilters();

setupSearch();


if (refreshButton) {

    refreshButton.addEventListener(
        "click",
        () => {

            if (firebaseUser) {
                loadMessages();
            }

        }
    );

}


// =====================================================
// LOAD MESSAGES
// =====================================================

async function loadMessages() {

    /*
     * Never request SMS data without
     * Firebase authentication.
     */

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


        if (!response.ok) {

            if (
                response.status ===
                401
            ) {

                console.error(
                    "Authentication rejected by server."
                );

                return;

            }


            if (
                response.status ===
                403
            ) {

                console.error(
                    "Access denied."
                );

                return;

            }


            throw new Error(
                `Failed to load messages: ${response.status}`
            );

        }


        const data =
            await response.json();


        if (Array.isArray(data)) {

            allMessages =
                data;

        } else if (
            Array.isArray(
                data.messages
            )
        ) {

            allMessages =
                data.messages;

        } else {

            allMessages =
                [];

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


        renderMessages();

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
// DEVICE FILTER
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
// CATEGORY FILTER
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
        selectedCategory ===
        "all"
    ) {

        if (
            selectedDevice ===
            "all"
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
        selectedDevice ===
        "all"
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

                searchInput.value =
                    "";

                searchText =
                    "";


                updateClearButton();

                renderMessages();

                searchInput.focus();

            }
        );

    }


    updateClearButton();

}


// =====================================================
// CLEAR SEARCH
// =====================================================

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
// FILTER MESSAGES
// =====================================================

function getFilteredMessages() {

    return allMessages.filter(
        message => {

            // -----------------------------------------
            // DEVICE
            // -----------------------------------------

            if (
                selectedDevice !==
                "all" &&
                String(
                    message.device_id || ""
                ).toLowerCase() !==
                selectedDevice.toLowerCase()
            ) {

                return false;

            }


            // -----------------------------------------
            // CATEGORY
            // -----------------------------------------

            if (
                selectedCategory !==
                "all" &&
                String(
                    message.category || ""
                ).toLowerCase() !==
                selectedCategory.toLowerCase()
            ) {

                return false;

            }


            // -----------------------------------------
            // SEARCH
            // -----------------------------------------

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


                const matches =
                    sender.includes(
                        searchText
                    ) ||
                    body.includes(
                        searchText
                    ) ||
                    category.includes(
                        searchText
                    ) ||
                    device.includes(
                        searchText
                    );


                if (!matches) {
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


    messagesList.innerHTML =
        "";


    // -----------------------------------------
    // COUNT
    // -----------------------------------------

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


    // -----------------------------------------
    // EMPTY
    // -----------------------------------------

    if (
        filteredMessages.length ===
        0
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


    // -----------------------------------------
    // CARDS
    // -----------------------------------------

    filteredMessages.forEach(
        message => {

            const card =
                createMessageCard(
                    message
                );


            messagesList.appendChild(
                card
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


    if (message.is_read) {

        card.classList.add(
            "read"
        );

    } else {

        card.classList.add(
            "unread"
        );

    }


    // -----------------------------------------
    // TOP
    // -----------------------------------------

    const topRow =
        document.createElement(
            "div"
        );


    topRow.className =
        "message-top";


    // -----------------------------------------
    // SENDER
    // -----------------------------------------

    const sender =
        document.createElement(
            "div"
        );


    sender.className =
        "message-sender";


    sender.textContent =
        message.sender ||
        "Unknown";


    // -----------------------------------------
    // BADGES
    // -----------------------------------------

    const badges =
        document.createElement(
            "div"
        );


    badges.className =
        "message-badges";


    // -----------------------------------------
    // DEVICE BADGE
    // -----------------------------------------

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


    // -----------------------------------------
    // CATEGORY BADGE
    // -----------------------------------------

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


    // -----------------------------------------
    // TIME
    // -----------------------------------------

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


    // -----------------------------------------
    // BODY
    // -----------------------------------------

    const body =
        document.createElement(
            "div"
        );


    body.className =
        "message-body";


    body.textContent =
        message.body ||
        "";


    // -----------------------------------------
    // ACTIONS
    // -----------------------------------------

    const actions =
        document.createElement(
            "div"
        );


    actions.className =
        "message-actions";


    // -----------------------------------------
    // MARK AS READ
    // -----------------------------------------

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


    // -----------------------------------------
    // BUILD CARD
    // -----------------------------------------

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
        actions.children.length >
        0
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

async function markAsRead(
    id
) {

    if (!firebaseUser) {
        return;
    }


    try {

        const response =
            await authFetch(
                `/api/messages/${id}/read`,
                {
                    method: "PATCH"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Failed to mark message as read: ${response.status}`
            );

        }


        const message =
            allMessages.find(
                item =>
                    String(
                        item.id
                    ) ===
                    String(id)
            );


        if (message) {

            message.is_read =
                true;

        }


        renderMessages();


    } catch (error) {

        console.error(
            "Mark as read failed:",
            error
        );


        /*
         * Don't expose backend details
         * unnecessarily to the user.
         */

        alert(
            "Unable to mark this message as read."
        );

    }

}


// =====================================================
// WEBSOCKET
// =====================================================

async function connectWebSocket() {

    /*
     * Never create a WebSocket
     * before authentication.
     */

    if (!firebaseUser) {
        return;
    }


    try {

        const token =
            await getAuthToken();


        if (!firebaseUser) {
            return;
        }


        const protocol =
            window.location.protocol ===
            "https:"
                ? "wss:"
                : "ws:";


        const wsUrl =
            `${protocol}//${window.location.host}/ws` +
            `?token=${encodeURIComponent(token)}`;


        socket =
            new WebSocket(
                wsUrl
            );


        socket.onopen =
            () => {

                console.log(
                    "Authenticated WebSocket connected"
                );


                setConnectionStatus(
                    true,
                    "Live"
                );

            };


        socket.onmessage =
            event => {

                try {

                    const message =
                        JSON.parse(
                            event.data
                        );


                    if (
                        !message ||
                        typeof message !==
                        "object"
                    ) {

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

                setConnectionStatus(
                    false,
                    "Reconnecting..."
                );


                clearTimeout(
                    reconnectTimer
                );


                /*
                 * Only reconnect if
                 * user is still logged in.
                 */

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


    reconnectTimer =
        null;


    if (socket) {

        socket.onclose =
            null;


        socket.close();


        socket =
            null;

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


    if (
        value ===
        "samsung"
    ) {

        return "Samsung";

    }


    if (
        value ===
        "poco"
    ) {

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
        new Date(
            timestamp
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(
            timestamp
        );

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


// =====================================================
// AUTOMATIC REFRESH
// =====================================================

setInterval(
    () => {

        /*
         * Only poll when an approved
         * user is authenticated.
         */

        if (firebaseUser) {

            loadMessages();

        }

    },
    3000
);