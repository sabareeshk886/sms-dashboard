// =====================================================
// STATE
// =====================================================

let allMessages = [];

let selectedDevice = "all";
let selectedCategory = "all";
let selectedSource = "all";

let searchText = "";

let selectedDateMode = "all";
let selectedDate = "";
let selectedStartDate = "";
let selectedEndDate = "";

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

const dateFilterMode =
    document.getElementById("dateFilterMode");

const singleDateInput =
    document.getElementById("singleDateInput");

const startDateInput =
    document.getElementById("startDateInput");

const endDateInput =
    document.getElementById("endDateInput");

const clearDateFilter =
    document.getElementById("clearDateFilter");


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

    if (googleSignOutBtn) {
        googleSignOutBtn.style.display = "inline-block";
    }

    if (userEmail) {
        userEmail.textContent = user.email || "";
    }

    if (authError) {
        authError.textContent = "";
        authError.style.display = "none";
    }
}


// =====================================================
// INITIALIZE
// =====================================================

function initializeDashboard() {

    setupDeviceFilters();
    setupSourceFilters();
    setupCategoryFilters();
    setupSearch();
    setupDateFilter();

    updateCategoryDescription();

    if (refreshButton) {
        refreshButton.addEventListener(
            "click",
            loadMessages
        );
    }
}


if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard
    );

} else {

    initializeDashboard();

}


// =====================================================
// LOAD MESSAGES
// =====================================================

async function loadMessages() {

    try {

        const response =
            await fetch(
                "/api/messages",
                {
                    method: "GET",
                    cache: "no-store"
                }
            );

        if (!response.ok) {

            throw new Error(
                `Failed to load messages: ${response.status}`
            );

        }

        const data =
            await response.json();

        if (Array.isArray(data)) {

            allMessages = data;

        } else if (
            Array.isArray(data.messages)
        ) {

            allMessages = data.messages;

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
// SOURCE FILTERS
// =====================================================

function setupSourceFilters() {

    const buttons =
        document.querySelectorAll(
            "#sourceFilters .filter-btn"
        );

    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    buttons.forEach(
                        item => {
                            item.classList.remove(
                                "active"
                            );
                        }
                    );

                    button.classList.add(
                        "active"
                    );

                    selectedSource =
                        button.dataset.source ||
                        "all";

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

    if (selectedCategory === "all") {

        if (selectedDevice === "all") {

            categoryDescription.textContent =
                "Showing all messages";

        } else {

            categoryDescription.textContent =
                `Showing all SMS from ${formatDeviceName(selectedDevice)}`;
        }

        return;
    }

    if (selectedDevice === "all") {

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


// =====================================================
// SEARCH CLEAR BUTTON
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
// DATE FILTER
// =====================================================

function setupDateFilter() {

    if (!dateFilterMode) {
        return;
    }

    dateFilterMode.addEventListener(
        "change",
        () => {

            selectedDateMode =
                dateFilterMode.value ||
                "all";

            if (selectedDateMode === "all") {

                selectedDate = "";
                selectedStartDate = "";
                selectedEndDate = "";

                if (singleDateInput) {
                    singleDateInput.value = "";
                }

                if (startDateInput) {
                    startDateInput.value = "";
                }

                if (endDateInput) {
                    endDateInput.value = "";
                }
            }

            updateDateFilterVisibility();

            renderMessages();
        }
    );

    if (singleDateInput) {

        singleDateInput.addEventListener(
            "change",
            () => {

                selectedDate =
                    singleDateInput.value;

                renderMessages();
            }
        );
    }

    if (startDateInput) {

        startDateInput.addEventListener(
            "change",
            () => {

                selectedStartDate =
                    startDateInput.value;

                renderMessages();
            }
        );
    }

    if (endDateInput) {

        endDateInput.addEventListener(
            "change",
            () => {

                selectedEndDate =
                    endDateInput.value;

                renderMessages();
            }
        );
    }

    if (clearDateFilter) {

        clearDateFilter.addEventListener(
            "click",
            () => {

                selectedDateMode = "all";
                selectedDate = "";
                selectedStartDate = "";
                selectedEndDate = "";

                if (dateFilterMode) {
                    dateFilterMode.value = "all";
                }

                if (singleDateInput) {
                    singleDateInput.value = "";
                }

                if (startDateInput) {
                    startDateInput.value = "";
                }

                if (endDateInput) {
                    endDateInput.value = "";
                }

                updateDateFilterVisibility();

                renderMessages();
            }
        );
    }

    updateDateFilterVisibility();
}


// =====================================================
// DATE FILTER VISIBILITY
// =====================================================

function updateDateFilterVisibility() {

    const dateRangeInputs =
        document.getElementById(
            "dateRangeInputs"
        );

    if (singleDateInput) {

        singleDateInput.style.display =
            selectedDateMode === "single"
                ? "inline-block"
                : "none";
    }

    if (dateRangeInputs) {

        dateRangeInputs.style.display =
            selectedDateMode === "range"
                ? "flex"
                : "none";
    }

    if (startDateInput) {

        startDateInput.style.display =
            selectedDateMode === "range"
                ? "inline-block"
                : "none";
    }

    if (endDateInput) {

        endDateInput.style.display =
            selectedDateMode === "range"
                ? "inline-block"
                : "none";
    }

    if (clearDateFilter) {

        clearDateFilter.style.display =
            selectedDateMode === "all"
                ? "none"
                : "inline-block";
    }
}


// =====================================================
// MESSAGE DATE KEY
// =====================================================

function getMessageDateKey(timestamp) {

    const date =
        new Date(timestamp);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-${day}`;
}


// =====================================================
// FILTER
// =====================================================

function getFilteredMessages() {

    return allMessages.filter(
        message => {

            if (
                selectedDateMode === "single"
            ) {

                if (!selectedDate) {
                    return true;
                }

                const messageDate =
                    getMessageDateKey(
                        message.timestamp
                    );

                if (
                    messageDate !==
                    selectedDate
                ) {
                    return false;
                }
            }

            if (
                selectedDateMode === "range"
            ) {

                const messageDate =
                    getMessageDateKey(
                        message.timestamp
                    );

                if (
                    !messageDate ||
                    !selectedStartDate ||
                    !selectedEndDate
                ) {
                    return true;
                }

                if (
                    selectedStartDate >
                    selectedEndDate
                ) {
                    return false;
                }

                if (
                    messageDate <
                        selectedStartDate ||
                    messageDate >
                        selectedEndDate
                ) {
                    return false;
                }
            }

            // SOURCE

            if (
                selectedSource !== "all" &&
                String(
                    message.source || ""
                ).toLowerCase() !==
                selectedSource.toLowerCase()
            ) {
                return false;
            }

            // DEVICE

            if (
                selectedDevice !== "all" &&
                String(
                    message.device_id || ""
                ).toLowerCase() !==
                selectedDevice.toLowerCase()
            ) {
                return false;
            }

            // CATEGORY

            if (
                selectedCategory !== "all" &&
                String(
                    message.category || ""
                ).toLowerCase() !==
                selectedCategory.toLowerCase()
            ) {
                return false;
            }

            // SEARCH

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

    const displayGroups =
        groupMessagesForDisplay(
            filteredMessages
        );

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

    if (displayGroups.length === 0) {

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

    displayGroups.forEach(
        group => {

            if (group.isWhatsApp) {

                messagesList.appendChild(
                    createWhatsAppConversationCard(
                        group.messages
                    )
                );

            } else {

                messagesList.appendChild(
                    createMessageCard(
                        group.messages[0]
                    )
                );
            }
        }
    );
}


// =====================================================
// GROUP MESSAGES FOR DISPLAY
// =====================================================
//
// WhatsApp:
// Same phone + same sender/chat = ONE conversation card.
//
// SMS:
// Every SMS remains an individual card.
//
// Nothing is merged or deleted in the database.
// This only changes dashboard display.
// =====================================================

function groupMessagesForDisplay(
    messages
) {

    const groups = [];

    const whatsappGroups =
        new Map();

    messages.forEach(
        message => {

            const source =
                String(
                    message.source || ""
                )
                    .trim()
                    .toLowerCase();

            // SMS

            if (source !== "whatsapp") {

                groups.push({
                    isWhatsApp: false,
                    messages: [message]
                });

                return;
            }

            // WHATSAPP

            const device =
                String(
                    message.device_id ||
                    "samsung"
                )
                    .trim()
                    .toLowerCase();

            const sender =
                String(
                    message.sender ||
                    "Unknown"
                )
                    .trim()
                    .toLowerCase();

            const key =
                `${device}|${sender}`;

            if (
                !whatsappGroups.has(key)
            ) {

                const group = {
                    isWhatsApp: true,
                    messages: []
                };

                whatsappGroups.set(
                    key,
                    group
                );

                groups.push(group);
            }

            whatsappGroups
                .get(key)
                .messages
                .push(message);
        }
    );

    // Oldest -> newest
    whatsappGroups.forEach(
        group => {

            group.messages.sort(
                (a, b) => {

                    const timeA =
                        new Date(
                            a.timestamp || 0
                        ).getTime();

                    const timeB =
                        new Date(
                            b.timestamp || 0
                        ).getTime();

                    return timeA - timeB;
                }
            );
        }
    );

    // Newest conversation first
    groups.sort(
        (a, b) => {

            const latestA =
                a.messages[
                    a.messages.length - 1
                ];

            const latestB =
                b.messages[
                    b.messages.length - 1
                ];

            const timeA =
                new Date(
                    latestA.timestamp || 0
                ).getTime();

            const timeB =
                new Date(
                    latestB.timestamp || 0
                ).getTime();

            return timeB - timeA;
        }
    );

    return groups;
}


// =====================================================
// WHATSAPP CONVERSATION CARD
// =====================================================

function createWhatsAppConversationCard(
    messages
) {

    const latestMessage =
        messages[
            messages.length - 1
        ];

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "message-card whatsapp-conversation";

    card.classList.add(
        messages.some(
            message => !message.is_read
        )
            ? "unread"
            : "read"
    );


    // =================================================
    // TOP ROW
    // =================================================

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
        latestMessage.sender ||
        "Unknown";


    const badges =
        document.createElement(
            "div"
        );

    badges.className =
        "message-badges";


    // DEVICE BADGE

    const deviceBadge =
        document.createElement(
            "span"
        );

    deviceBadge.className =
        "device-badge " +
        String(
            latestMessage.device_id ||
            "samsung"
        ).toLowerCase();

    deviceBadge.textContent =
        formatDeviceName(
            latestMessage.device_id ||
            "samsung"
        );


    // =================================================
    // WHATSAPP SOURCE BADGE
    // =================================================

    const sourceBadge =
        document.createElement(
            "span"
        );

    sourceBadge.className =
        "source-badge whatsapp";

    sourceBadge.textContent =
        "WhatsApp";


    // CATEGORY BADGE

    const categoryBadge =
        document.createElement(
            "span"
        );

    categoryBadge.className =
        "category-badge";

    categoryBadge.textContent =
        latestMessage.category ||
        "Other";


    badges.appendChild(
        deviceBadge
    );

    badges.appendChild(
        sourceBadge
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

    card.appendChild(
        topRow
    );


    // =================================================
    // LATEST MESSAGE
    // =================================================

    const latestContainer =
        document.createElement(
            "div"
        );

    latestContainer.className =
        "whatsapp-latest-message";

    latestContainer.style.padding =
        "12px 0";


    const latestBody =
        document.createElement(
            "div"
        );

    latestBody.className =
        "message-body";

    latestBody.textContent =
        latestMessage.body ||
        "";


    const latestTime =
        document.createElement(
            "div"
        );

    latestTime.className =
        "message-time";

    latestTime.textContent =
        formatTimestamp(
            latestMessage.timestamp
        );


    latestContainer.appendChild(
        latestBody
    );

    latestContainer.appendChild(
        latestTime
    );

    card.appendChild(
        latestContainer
    );


    // =================================================
    // OLDER MESSAGES
    // =================================================

    const olderMessages =
        messages.slice(0, -1);


    const olderMessagesContainer =
        document.createElement(
            "div"
        );

    olderMessagesContainer.className =
        "whatsapp-older-messages";

    olderMessagesContainer.style.display =
        "none";

    olderMessagesContainer.style.borderTop =
        "1px solid rgba(0,0,0,0.08)";


    olderMessages.forEach(
        message => {

            const messageRow =
                document.createElement(
                    "div"
                );

            messageRow.className =
                "whatsapp-conversation-message";

            messageRow.style.padding =
                "12px 0";

            messageRow.style.borderBottom =
                "1px solid rgba(0,0,0,0.06)";


            if (!message.is_read) {

                messageRow.classList.add(
                    "unread"
                );
            }


            const body =
                document.createElement(
                    "div"
                );

            body.className =
                "message-body";

            body.textContent =
                message.body || "";


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


            messageRow.appendChild(
                body
            );

            messageRow.appendChild(
                time
            );

            olderMessagesContainer.appendChild(
                messageRow
            );
        }
    );


    card.appendChild(
        olderMessagesContainer
    );


    // =================================================
    // SHOW / HIDE OLDER
    // =================================================

    if (
        olderMessages.length > 0
    ) {

        const expandButton =
            document.createElement(
                "button"
            );

        expandButton.type =
            "button";

        expandButton.className =
            "whatsapp-expand-button";

        expandButton.style.width =
            "100%";

        expandButton.style.border =
            "none";

        expandButton.style.background =
            "transparent";

        expandButton.style.padding =
            "10px 0";

        expandButton.style.cursor =
            "pointer";

        expandButton.style.textAlign =
            "center";

        expandButton.style.fontSize =
            "12px";

        expandButton.style.fontWeight =
            "500";


        let expanded = false;


        const updateExpandButton =
            () => {

                expandButton.textContent =
                    expanded
                        ? "Hide older messages ▲"
                        : `Show ${olderMessages.length} older ${
                            olderMessages.length === 1
                                ? "message"
                                : "messages"
                        } ▼`;
            };


        updateExpandButton();


        expandButton.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                expanded =
                    !expanded;

                olderMessagesContainer.style.display =
                    expanded
                        ? "block"
                        : "none";

                updateExpandButton();
            }
        );


        card.appendChild(
            expandButton
        );
    }


    // =================================================
    // MARK CONVERSATION AS READ
    // =================================================

    const unreadMessages =
        messages.filter(
            message =>
                !message.is_read
        );


    if (
        unreadMessages.length > 0
    ) {

        const actions =
            document.createElement(
                "div"
            );

        actions.className =
            "message-actions";


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
            event => {

                event.stopPropagation();

                markConversationAsRead(
                    unreadMessages
                );
            }
        );


        actions.appendChild(
            readButton
        );

        card.appendChild(
            actions
        );
    }


    return card;
}


// =====================================================
// MARK WHATSAPP CONVERSATION AS READ
// =====================================================

async function markConversationAsRead(
    messages
) {

    try {

        const unreadMessages =
            messages.filter(
                message =>
                    !message.is_read
            );

        for (
            const message
            of unreadMessages
        ) {

            const response =
                await fetch(
                    `/api/messages/${message.id}/read`,
                    {
                        method: "PATCH"
                    }
                );

            if (
                response.status === 401
            ) {
                return;
            }

            if (!response.ok) {

                throw new Error(
                    `Failed to mark message ${message.id} as read: ${response.status}`
                );
            }

            message.is_read = true;

            const originalMessage =
                allMessages.find(
                    item =>
                        String(item.id) ===
                        String(message.id)
                );

            if (originalMessage) {
                originalMessage.is_read = true;
            }
        }

        renderMessages();

    } catch (error) {

        console.error(
            "Mark WhatsApp conversation as read failed:",
            error
        );

        alert(
            "Unable to mark this conversation as read."
        );
    }
}


// =====================================================
// NORMAL MESSAGE CARD
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


    // TOP ROW

    const topRow =
        document.createElement(
            "div"
        );

    topRow.className =
        "message-top";


    // SENDER

    const sender =
        document.createElement(
            "div"
        );

    sender.className =
        "message-sender";

    sender.textContent =
        message.sender ||
        "Unknown";


    // BADGES

    const badges =
        document.createElement(
            "div"
        );

    badges.className =
        "message-badges";


    // DEVICE

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


    // CATEGORY

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


    // TIME

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


    // BODY

    const body =
        document.createElement(
            "div"
        );

    body.className =
        "message-body";

    body.textContent =
        message.body ||
        "";


    // ACTIONS

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


    // BUILD

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

async function markAsRead(
    id
) {

    try {

        const response =
            await fetch(
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

        const protocol =
            window.location.protocol ===
            "https:"
                ? "wss:"
                : "ws:";


        const wsUrl =
            `${protocol}//${window.location.host}/ws`;


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


                reconnectTimer =
                    setTimeout(
                        () => {
                            connectWebSocket();
                        },
                        3000
                    );
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

                loadMessages();

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
// START DASHBOARD
// =====================================================

loadMessages();

connectWebSocket();

startPolling();


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