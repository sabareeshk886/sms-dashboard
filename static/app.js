let allMessages = [];
let socket = null;

const state = {
    device: "all",
    type: "all",
    search: ""
};

document.addEventListener("DOMContentLoaded", () => {
    setupFilters();
    setupSearch();
    setupRefresh();

    loadMessages();
    connectWebSocket();
});

async function loadMessages() {
    try {
        const response = await fetch("/api/messages");

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        allMessages = Array.isArray(data)
            ? data
            : (data.messages || []);

        renderMessages();

    } catch (error) {
        console.error("Failed to load messages:", error);
    }
}

function connectWebSocket() {
    try {
        if (socket) {
            socket.close();
        }

        const protocol =
            window.location.protocol === "https:"
                ? "wss:"
                : "ws:";

        socket = new WebSocket(
            `${protocol}//${window.location.host}/ws`
        );

        socket.onopen = () => {
            console.log("WebSocket connected");
            updateLiveStatus(true);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                console.log("Live message received:", data);

                /*
                 * Backend may send the SMS object directly
                 * or inside a "message" property.
                 */
                const newMessage =
                    data.message || data;

                if (
                    !newMessage ||
                    typeof newMessage !== "object"
                ) {
                    return;
                }

                /*
                 * Ignore non-message WebSocket events.
                 */
                if (
                    !newMessage.body &&
                    !newMessage.sender
                ) {
                    return;
                }

                /*
                 * Avoid duplicate messages.
                 */
                const messageId =
                    newMessage.id;

                if (
                    messageId !== undefined &&
                    allMessages.some(
                        message =>
                            String(message.id) ===
                            String(messageId)
                    )
                ) {
                    return;
                }

                /*
                 * Add newest message to the top.
                 */
                allMessages.unshift(newMessage);

                renderMessages();

                /*
                 * Optional browser notification.
                 */
                showBrowserNotification(newMessage);

            } catch (error) {
                console.error(
                    "WebSocket message error:",
                    error
                );
            }
        };

        socket.onclose = () => {
            console.log(
                "WebSocket disconnected. Reconnecting..."
            );

            updateLiveStatus(false);

            setTimeout(() => {
                connectWebSocket();
            }, 3000);
        };

        socket.onerror = (error) => {
            console.error(
                "WebSocket error:",
                error
            );

            updateLiveStatus(false);
        };

    } catch (error) {
        console.error(
            "WebSocket connection failed:",
            error
        );

        updateLiveStatus(false);

        setTimeout(() => {
            connectWebSocket();
        }, 3000);
    }
}

function setupFilters() {
    const deviceFilter =
        document.getElementById("deviceFilter");

    const typeFilter =
        document.getElementById("typeFilter");

    if (deviceFilter) {
        deviceFilter.addEventListener(
            "change",
            () => {
                state.device =
                    deviceFilter.value.toLowerCase();

                renderMessages();
            }
        );
    }

    if (typeFilter) {
        typeFilter.addEventListener(
            "change",
            () => {
                state.type =
                    typeFilter.value.toLowerCase();

                renderMessages();
            }
        );
    }
}

function setupSearch() {
    const searchInput =
        document.getElementById("searchInput");

    if (!searchInput) {
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

function setupRefresh() {
    const refreshButton =
        document.getElementById("refreshBtn");

    if (!refreshButton) {
        return;
    }

    refreshButton.addEventListener(
        "click",
        async () => {
            refreshButton.disabled = true;

            try {
                await loadMessages();
            } finally {
                refreshButton.disabled = false;
            }
        }
    );
}

function renderMessages() {
    const container =
        document.getElementById("messages");

    if (!container) {
        console.error(
            'Element with id="messages" not found'
        );

        return;
    }

    const filteredMessages =
        allMessages.filter(
            message => {

                const device =
                    String(
                        message.device_id ||
                        message.device ||
                        "samsung"
                    ).toLowerCase();

                const type =
                    String(
                        message.sms_type ||
                        message.type ||
                        detectSmsType(
                            message.sender,
                            message.body
                        )
                    ).toLowerCase();

                const sender =
                    String(
                        message.sender || ""
                    ).toLowerCase();

                const body =
                    String(
                        message.body || ""
                    ).toLowerCase();

                const matchesDevice =
                    state.device === "all" ||
                    device === state.device;

                const matchesType =
                    state.type === "all" ||
                    type === state.type;

                const matchesSearch =
                    !state.search ||
                    sender.includes(state.search) ||
                    body.includes(state.search);

                return (
                    matchesDevice &&
                    matchesType &&
                    matchesSearch
                );
            }
        );

    if (filteredMessages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                No messages found
            </div>
        `;

        return;
    }

    container.innerHTML =
        filteredMessages
            .map(message => createMessageHTML(message))
            .join("");
}

function createMessageHTML(message) {
    const id =
        message.id ?? "";

    const sender =
        escapeHTML(
            message.sender || "Unknown"
        );

    const body =
        escapeHTML(
            message.body || ""
        );

    const timestamp =
        formatTimestamp(
            message.timestamp ||
            message.created_at
        );

    const device =
        String(
            message.device_id ||
            message.device ||
            "samsung"
        ).toLowerCase();

    const deviceName =
        device === "poco"
            ? "POCO"
            : "SAMSUNG";

    const type =
        String(
            message.sms_type ||
            message.type ||
            detectSmsType(
                message.sender,
                message.body
            )
        ).toLowerCase();

    const typeName =
        type.charAt(0).toUpperCase() +
        type.slice(1);

    const isRead =
        message.is_read === true ||
        message.read === true;

    return `
        <div
            class="message-card ${isRead ? "read" : "unread"}"
            data-id="${escapeHTML(String(id))}"
        >

            <div class="message-header">

                <div class="message-sender">
                    ${sender}
                </div>

                <div class="message-badges">

                    <span class="device-badge ${device}">
                        ${deviceName}
                    </span>

                    <span class="type-badge ${type}">
                        ${escapeHTML(typeName)}
                    </span>

                </div>

            </div>

            <div class="message-body">
                ${body}
            </div>

            <div class="message-footer">

                <span class="message-time">
                    ${escapeHTML(timestamp)}
                </span>

                ${
                    !isRead
                        ? `
                            <button
                                class="read-btn"
                                onclick="markAsRead(${Number(id)})"
                            >
                                Mark as read
                            </button>
                          `
                        : `
                            <span class="read-label">
                                Read
                            </span>
                          `
                }

            </div>

        </div>
    `;
}

async function markAsRead(id) {
    if (!id) {
        return;
    }

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
                "Failed to mark message as read"
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

function detectSmsType(sender, body) {
    const text =
        `${sender || ""} ${body || ""}`
            .toLowerCase();

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

function formatTimestamp(value) {
    if (!value) {
        return "";
    }

    try {
        const date =
            new Date(value);

        if (Number.isNaN(date.getTime())) {
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

    } catch {
        return String(value);
    }
}

function updateLiveStatus(connected) {
    const liveStatus =
        document.querySelector(
            ".live-status"
        );

    if (!liveStatus) {
        return;
    }

    if (connected) {
        liveStatus.textContent =
            "● Live";

        liveStatus.classList.add(
            "connected"
        );

        liveStatus.classList.remove(
            "disconnected"
        );
    } else {
        liveStatus.textContent =
            "● Reconnecting...";

        liveStatus.classList.remove(
            "connected"
        );

        liveStatus.classList.add(
            "disconnected"
        );
    }
}

function showBrowserNotification(message) {
    /*
     * Only show notifications if the user has
     * already granted permission.
     */
    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return;
    }

    const sender =
        message.sender || "New SMS";

    const body =
        message.body || "";

    try {
        new Notification(
            `New SMS from ${sender}`,
            {
                body: body.substring(0, 120)
            }
        );
    } catch (error) {
        console.log(
            "Notification unavailable:",
            error
        );
    }
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}