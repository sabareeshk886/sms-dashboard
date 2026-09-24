let allMessages = [];
let socket = null;

const state = {
    phone: "all",
    smsType: "all",
    search: ""
};

document.addEventListener("DOMContentLoaded", () => {
    setupPhoneFilters();
    setupSmsTypeFilters();
    setupSearch();
    setupRefresh();

    loadMessages();
    connectWebSocket();
});


/* =========================
   LOAD MESSAGES
========================= */

async function loadMessages() {
    try {
        const response = await fetch("/api/messages", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(
                `Failed to load messages: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        /*
         * Support both:
         *
         * [...]
         *
         * and:
         *
         * {
         *   messages: [...]
         * }
         */

        if (Array.isArray(data)) {
            allMessages = data;
        } else if (Array.isArray(data.messages)) {
            allMessages = data.messages;
        } else if (Array.isArray(data.data)) {
            allMessages = data.data;
        } else {
            console.error(
                "Unexpected API response:",
                data
            );

            allMessages = [];
        }

        renderMessages();

    } catch (error) {
        console.error(
            "Could not load messages:",
            error
        );
    }
}


/* =========================
   WEBSOCKET
========================= */

function connectWebSocket() {

    if (socket) {
        try {
            socket.close();
        } catch (error) {
            console.log(error);
        }
    }

    const protocol =
        window.location.protocol === "https:"
            ? "wss:"
            : "ws:";

    const wsUrl =
        `${protocol}//${window.location.host}/ws`;

    console.log(
        "Connecting WebSocket:",
        wsUrl
    );

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {

        console.log(
            "WebSocket connected"
        );

        setLiveStatus(true);
    };


    socket.onmessage = (event) => {

        console.log(
            "WebSocket event:",
            event.data
        );

        try {

            const data =
                JSON.parse(event.data);

            /*
             * Support different backend formats.
             */

            let newMessage = null;

            if (
                data &&
                data.message &&
                typeof data.message === "object"
            ) {
                newMessage = data.message;
            }

            else if (
                data &&
                data.data &&
                typeof data.data === "object"
            ) {
                newMessage = data.data;
            }

            else if (
                data &&
                typeof data === "object" &&
                (
                    data.body ||
                    data.sender
                )
            ) {
                newMessage = data;
            }


            if (!newMessage) {

                console.log(
                    "WebSocket event was not an SMS:",
                    data
                );

                return;
            }


            /*
             * Prevent duplicates.
             */

            if (
                newMessage.id !== undefined &&
                allMessages.some(
                    message =>
                        String(message.id) ===
                        String(newMessage.id)
                )
            ) {
                return;
            }


            /*
             * Add new message to top.
             */

            allMessages.unshift(
                newMessage
            );

            renderMessages();


            /*
             * Optional browser notification.
             */

            showNotification(
                newMessage
            );

        } catch (error) {

            console.error(
                "WebSocket JSON error:",
                error
            );

        }
    };


    socket.onclose = () => {

        console.log(
            "WebSocket disconnected."
        );

        setLiveStatus(false);

        /*
         * Automatically reconnect.
         */

        setTimeout(() => {

            connectWebSocket();

        }, 3000);
    };


    socket.onerror = (error) => {

        console.error(
            "WebSocket error:",
            error
        );

        setLiveStatus(false);
    };
}


/* =========================
   PHONE FILTER
========================= */

function setupPhoneFilters() {

    /*
     * Your UI uses buttons, not select boxes.
     */

    const buttons =
        document.querySelectorAll(
            "[data-phone]"
        );

    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                buttons.forEach(
                    item =>
                        item.classList.remove(
                            "active"
                        )
                );

                button.classList.add(
                    "active"
                );

                state.phone =
                    (
                        button.dataset.phone ||
                        "all"
                    ).toLowerCase();

                renderMessages();
            }
        );
    });
}


/* =========================
   SMS TYPE FILTER
========================= */

function setupSmsTypeFilters() {

    const buttons =
        document.querySelectorAll(
            "[data-sms-type]"
        );

    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                buttons.forEach(
                    item =>
                        item.classList.remove(
                            "active"
                        )
                );

                button.classList.add(
                    "active"
                );

                state.smsType =
                    (
                        button.dataset.smsType ||
                        "all"
                    ).toLowerCase();

                renderMessages();
            }
        );
    });
}


/* =========================
   SEARCH
========================= */

function setupSearch() {

    const searchInput =
        document.querySelector(
            "#searchInput"
        );

    if (!searchInput) {
        console.warn(
            "Search input not found"
        );

        return;
    }

    searchInput.addEventListener(
        "input",
        () => {

            state.search =
                searchInput.value
                    .trim()
                    .toLowerCase();

            renderMessages();
        }
    );
}


/* =========================
   REFRESH BUTTON
========================= */

function setupRefresh() {

    const button =
        document.querySelector(
            "#refreshBtn"
        );

    if (!button) {
        console.warn(
            "Refresh button not found"
        );

        return;
    }

    button.addEventListener(
        "click",
        async () => {

            button.disabled = true;

            await loadMessages();

            button.disabled = false;
        }
    );
}


/* =========================
   RENDER
========================= */

function renderMessages() {

    /*
     * Try the existing message container.
     */

    const container =
        document.querySelector(
            "#messages"
        ) ||
        document.querySelector(
            "#messageList"
        ) ||
        document.querySelector(
            ".messages-list"
        );

    if (!container) {

        console.error(
            "Message container not found"
        );

        return;
    }


    const filtered =
        allMessages.filter(
            message => {

                const phone =
                    getPhone(message);

                const type =
                    getSmsType(message);


                const matchesPhone =
                    state.phone === "all" ||
                    phone === state.phone;


                const matchesType =
                    state.smsType === "all" ||
                    type === state.smsType;


                const sender =
                    String(
                        message.sender || ""
                    ).toLowerCase();


                const body =
                    String(
                        message.body || ""
                    ).toLowerCase();


                const matchesSearch =
                    !state.search ||
                    sender.includes(
                        state.search
                    ) ||
                    body.includes(
                        state.search
                    );


                return (
                    matchesPhone &&
                    matchesType &&
                    matchesSearch
                );
            }
        );


    /*
     * Update message count.
     */

    updateMessageCount(
        filtered.length
    );


    if (filtered.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                No messages found
            </div>
        `;

        return;
    }


    container.innerHTML =
        filtered
            .map(
                message =>
                    createMessageCard(
                        message
                    )
            )
            .join("");
}


/* =========================
   MESSAGE CARD
========================= */

function createMessageCard(
    message
) {

    const sender =
        escapeHtml(
            message.sender ||
            "Unknown"
        );


    const body =
        escapeHtml(
            message.body ||
            ""
        );


    const time =
        formatDate(
            message.timestamp ||
            message.created_at
        );


    const phone =
        getPhone(message);


    const phoneLabel =
        phone === "poco"
            ? "POCO"
            : "SAMSUNG";


    const type =
        getSmsType(message);


    const typeLabel =
        type.charAt(0).toUpperCase() +
        type.slice(1);


    const id =
        message.id;


    const isRead =
        message.is_read === true ||
        message.read === true;


    return `
        <div
            class="message-card ${
                isRead ? "read" : "unread"
            }"
            data-id="${escapeHtml(
                String(id || "")
            )}"
        >

            <div class="message-header">

                <div class="message-sender">
                    ${sender}
                </div>

                <div class="message-badges">

                    <span
                        class="device-badge ${phone}"
                    >
                        ${phoneLabel}
                    </span>

                    <span
                        class="type-badge ${type}"
                    >
                        ${escapeHtml(
                            typeLabel
                        )}
                    </span>

                </div>

            </div>


            <div class="message-time">
                ${escapeHtml(time)}
            </div>


            <div class="message-body">
                ${body}
            </div>


            <div class="message-actions">

                ${
                    !isRead && id
                        ? `
                            <button
                                class="read-btn"
                                onclick="markAsRead(${Number(id)})"
                            >
                                Mark as read
                            </button>
                          `
                        : ""
                }

            </div>

        </div>
    `;
}


/* =========================
   DEVICE
========================= */

function getPhone(message) {

    const value =
        String(
            message.device_id ||
            message.device ||
            "samsung"
        ).toLowerCase();


    if (
        value.includes("poco") ||
        value.includes("xiaomi") ||
        value.includes("redmi")
    ) {
        return "poco";
    }


    return "samsung";
}


/* =========================
   SMS TYPE
========================= */

function getSmsType(message) {

    const existing =
        message.sms_type ||
        message.type;


    if (existing) {

        return String(
            existing
        ).toLowerCase();
    }


    return detectSmsType(
        message.sender,
        message.body
    );
}


function detectSmsType(
    sender,
    body
) {

    const text =
        `${sender || ""} ${
            body || ""
        }`.toLowerCase();


    if (
        /\botp\b|one.?time|verification|verify|passcode|login code|authentication/.test(
            text
        )
    ) {
        return "otp";
    }


    if (
        /bank|credited|debited|transaction|account|upi|payment|withdrawal|balance/.test(
            text
        )
    ) {
        return "banking";
    }


    if (
        /delivery|delivered|shipment|order|package|parcel|out for delivery/.test(
            text
        )
    ) {
        return "delivery";
    }


    if (
        /office|work|meeting|employee|company|hr|attendance/.test(
            text
        )
    ) {
        return "work";
    }


    return "other";
}


/* =========================
   MARK AS READ
========================= */

async function markAsRead(id) {

    try {

        const response =
            await fetch(
                `/api/messages/${id}/read`,
                {
                    method: "PATCH"
                }
            );


        if (!response.ok) {

            console.error(
                "Could not mark message as read"
            );

            return;
        }


        const message =
            allMessages.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (message) {

            message.is_read = true;
            message.read = true;
        }


        renderMessages();

    } catch (error) {

        console.error(
            "Mark as read error:",
            error
        );
    }
}


/* =========================
   MESSAGE COUNT
========================= */

function updateMessageCount(
    count
) {

    const elements =
        document.querySelectorAll(
            ".message-count"
        );


    elements.forEach(
        element => {

            element.textContent =
                `${count} messages`;
        }
    );


    /*
     * Also support the current
     * dashboard structure if it
     * uses a plain count element.
     */

    const countElement =
        document.querySelector(
            "#messageCount"
        );


    if (countElement) {

        countElement.textContent =
            `${count} messages`;
    }
}


/* =========================
   LIVE STATUS
========================= */

function setLiveStatus(
    connected
) {

    const elements =
        document.querySelectorAll(
            ".live-status"
        );


    elements.forEach(
        element => {

            if (connected) {

                element.textContent =
                    "● Live";

                element.classList.add(
                    "connected"
                );

                element.classList.remove(
                    "disconnected"
                );

            } else {

                element.textContent =
                    "● Reconnecting...";

                element.classList.remove(
                    "connected"
                );

                element.classList.add(
                    "disconnected"
                );
            }
        }
    );


    /*
     * Fallback for the existing
     * Live indicator.
     */

    const live =
        document.querySelector(
            "#liveStatus"
        );


    if (live) {

        live.textContent =
            connected
                ? "● Live"
                : "● Reconnecting...";
    }
}


/* =========================
   NOTIFICATION
========================= */

function showNotification(
    message
) {

    if (
        !("Notification" in window)
    ) {
        return;
    }


    if (
        Notification.permission !==
        "granted"
    ) {
        return;
    }


    try {

        new Notification(
            `New SMS from ${
                message.sender ||
                "Unknown"
            }`,
            {
                body:
                    String(
                        message.body || ""
                    ).substring(0, 150)
            }
        );

    } catch (error) {

        console.log(
            "Notification error:",
            error
        );
    }
}


/* =========================
   DATE
========================= */

function formatDate(
    value
) {

    if (!value) {
        return "";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }


    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/* =========================
   HTML ESCAPE
========================= */

function escapeHtml(
    value
) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}