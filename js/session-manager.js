// ar-whiteboard-project/js/session-manager.js
class SessionManager {
    constructor(whiteboardCoreInstance, uiHandler) {
        this.socket = null;
        this.whiteboardCore = whiteboardCoreInstance;
        this.ui = uiHandler; // An object with methods to update the UI
        this.sessionId = null;
        this.currentUser = { id: null, name: 'Anonymous', isHost: false };
        this.participants = {};

        this._connect();
    }

    _connect() {
        const socketUrl = 'http://localhost:3001'; // << YOUR LOCAL BACKEND SERVER URL
        try {
            this.socket = io(socketUrl, {
                reconnectionAttempts: 5, // Try to reconnect a few times
                reconnectionDelay: 3000   // Wait 3 seconds between attempts
            });
            console.log("SessionManager: Attempting to connect to WebSocket server...", socketUrl);
        } catch (e) {
            console.error("SessionManager: Failed to initialize Socket.IO client. Is the library included?", e);
            if (this.ui && typeof this.ui.showError === 'function') {
                this.ui.showError("Cannot connect to collaboration server. Socket library might be missing.");
            }
            return;
        }


        this.socket.on('connect', () => {
            console.log('SessionManager: Connected to server with ID:', this.socket.id);
            this.currentUser.id = this.socket.id;
            this._handleInitialSessionAction();
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('SessionManager: Disconnected from server:', reason);
            if (this.ui && typeof this.ui.showError === 'function') {
                this.ui.showError("Disconnected from collaboration server. " + reason);
            }
        });
        
        this.socket.on('connect_error', (err) => {
            console.error('SessionManager: Connection Error!', err.message);
            if (this.ui && typeof this.ui.showError === 'function') {
                 this.ui.showError("Failed to connect to collaboration server. Is it running?");
            }
        });

        this.socket.on('new_drawing_action_from_server', (action) => {
            console.log('SessionManager: Received drawing action from server:', action);
            if (this.whiteboardCore) {
                this.whiteboardCore.drawActions([action]);
            }
        });
        
        this.socket.on('page_update_from_server', (action) => {
            console.log('SessionManager: Received page_update_from_server:', action);
            if (this.whiteboardCore) {
                if (action.tool === 'add_page') {
                     // Ensure local model reflects the new page count if initiated by another host
                    while (this.whiteboardCore.pages.length <= action.newPageIndex) {
                        this.whiteboardCore.pages.push([]);
                    }
                } else if (action.tool === 'switch_page') {
                    // If a remote user (host) switched page, update our view
                    // this.whiteboardCore.switchToPage(action.pageIndex); // Careful about triggering loops
                }
            }
            if (this.ui && typeof this.ui.updatePageSwitcher === 'function') {
                this.ui.updatePageSwitcher();
            }
        });

        this.socket.on('user_joined_notification', ({ userId, userName }) => {
            console.log(`SessionManager: User ${userName} (${userId}) joined session.`);
            this.participants[userId] = { name: userName, id: userId, isHost: false }; // Assume new joiner is not host
            if (this.ui && typeof this.ui.updateParticipantListUI === 'function') {
                this.ui.updateParticipantListUI(Object.values(this.participants));
            }
        });

        this.socket.on('user_left_notification', ({ userId, userName }) => {
            console.log(`SessionManager: User ${userName} (${userId}) left session.`);
            delete this.participants[userId];
            if (this.ui && typeof this.ui.updateParticipantListUI === 'function') {
                this.ui.updateParticipantListUI(Object.values(this.participants));
            }
        });

         this.socket.on('session_error', (data) => {
            console.error('SessionManager: Received session_error from server:', data.message);
            if (this.ui && typeof this.ui.showError === 'function') {
                this.ui.showError(data.message || "A session error occurred.");
            }
            // Potentially redirect to home or disable UI further
         });
    }

    _handleInitialSessionAction() {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionIdFromUrl = urlParams.get('session_id');
        const action = urlParams.get('action');
        const userNameFromStorage = localStorage.getItem('arWhiteboardUserName') || `User_${this.socket.id.substr(0,4)}`;
        
        let userName = userNameFromStorage;
        if (!localStorage.getItem('arWhiteboardUserName')) { // Prompt only if not set
            const promptedName = prompt("Enter your name for this session:", userNameFromStorage);
            if (promptedName && promptedName.trim() !== "") {
                userName = promptedName.trim();
                localStorage.setItem('arWhiteboardUserName', userName);
            }
        }
        this.currentUser.name = userName;

        if (action === 'host' && !sessionIdFromUrl) {
            this.createSession();
        } else if (sessionIdFromUrl) {
            this.joinSession(sessionIdFromUrl);
        } else {
            // Default: if session.html is opened directly without params, treat as host creating session
            console.log("SessionManager: No session_id in URL, defaulting to create_session.");
            this.createSession();
        }
    }

    createSession() {
        this.currentUser.isHost = true;
        this.socket.emit('create_session_request', { userName: this.currentUser.name }, (response) => {
            if (response.success) {
                this.sessionId = response.sessionId;
                this.participants = response.participants;
                console.log('SessionManager: Session created. ID:', this.sessionId, "Participants:", this.participants);
                if (this.ui && typeof this.ui.setSessionInfo === 'function') {
                    this.ui.setSessionInfo(this.sessionId, this.currentUser.name, this.currentUser.isHost);
                }
                if (this.ui && typeof this.ui.updateParticipantListUI === 'function') {
                    this.ui.updateParticipantListUI(Object.values(this.participants));
                }
                if (this.ui && typeof this.ui.updatePageSwitcher === 'function') {
                    this.ui.updatePageSwitcher(); // For initial page
                }
                // Update URL for sharing (optional but good UX)
                window.history.replaceState({}, '', `session.html?session_id=${this.sessionId}`);

            } else {
                console.error('SessionManager: Failed to create session.');
                 if (this.ui && typeof this.ui.showError === 'function') {
                    this.ui.showError("Failed to create session on server.");
                }
            }
        });
    }

    joinSession(sessionIdToJoin) {
        this.currentUser.isHost = false; // When joining, you are not the host.
        this.socket.emit('join_session_request', { sessionId: sessionIdToJoin, userName: this.currentUser.name }, (response) => {
            if (response.success) {
                this.sessionId = response.sessionId;
                this.participants = response.participants;
                console.log('SessionManager: Joined session. ID:', this.sessionId, "Participants:", this.participants);
                
                if (this.whiteboardCore && response.drawingData) {
                    this.whiteboardCore.loadAllPagesData(response.drawingData);
                }
                
                if (this.ui && typeof this.ui.setSessionInfo === 'function') {
                    this.ui.setSessionInfo(this.sessionId, this.currentUser.name, this.currentUser.isHost);
                }
                if (this.ui && typeof this.ui.updateParticipantListUI === 'function') {
                    this.ui.updateParticipantListUI(Object.values(this.participants));
                }
                 if (this.ui && typeof this.ui.updatePageSwitcher === 'function') {
                    this.ui.updatePageSwitcher(); // After loading data
                }
                 window.history.replaceState({}, '', `session.html?session_id=${this.sessionId}`);

            } else {
                console.error('SessionManager: Failed to join session -', response.message);
                 if (this.ui && typeof this.ui.showError === 'function') {
                    this.ui.showError(response.message || "Failed to join session.");
                }
                // Potentially redirect to home or profile
                // window.location.href = 'index.html'; 
            }
        });
    }

    sendDrawingAction(action) {
        if (this.socket && this.sessionId && this.socket.connected) {
            if (action.pageIndex === undefined && this.whiteboardCore) {
                action.pageIndex = this.whiteboardCore.currentPageIndex;
            }
            // Only send if user has permission (e.g. host, or if participants are allowed to draw)
            // For now, host always can. Participants can't based on your rule.
            if (this.currentUser.isHost) { 
                this.socket.emit('drawing_action', { sessionId: this.sessionId, action });
            } else {
                // console.log("SessionManager: Participant tried to draw, action not sent (as per rule).");
            }
        }
    }

    sendPageAction(action) {
        if (this.socket && this.sessionId && this.socket.connected && this.currentUser.isHost) {
             if (action.pageIndex === undefined && this.whiteboardCore) {
                action.pageIndex = this.whiteboardCore.currentPageIndex;
            }
            this.socket.emit('page_action', { sessionId: this.sessionId, action });
        }
    }
}