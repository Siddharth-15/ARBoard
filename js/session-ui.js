// js/session-ui.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("session-ui.js: DOMContentLoaded");

    // Get critical DOM elements first
    const canvasArea = document.querySelector('.canvas-area');
    const whiteboardCanvasElement = document.getElementById('whiteboardCanvas');
    const pageSwitcherContainer = document.getElementById('pageSwitcherContainer'); 

    let whiteboardCoreInstance = null;
    let sessionManagerInstance = null; 

    // --- Define the sessionUiInterface object ---
    const sessionUiInterface = {
        updateParticipantListUI: function(participantsData) {
            const participantsUl = document.getElementById('participantsUl');
            const participantCountBadge = document.getElementById('participantCountBadge');
            const participantCountDisplay = document.getElementById('participantCountDisplay');
            if (!participantsUl || !participantCountBadge || !participantCountDisplay) {
                console.warn("session-ui.js (interface): Participant list UI elements not all found.");
                return;
            }

            participantsUl.innerHTML = '';
            if (!participantsData || Object.keys(participantsData).length === 0) { // Check if object is empty
                participantsUl.innerHTML = '<li>No participants yet.</li>';
                participantCountBadge.textContent = 0;
                participantCountDisplay.textContent = 0;
            } else {
                const participantArray = Object.values(participantsData); // Convert participant object to array
                participantArray.forEach(p => {
                    const li = document.createElement('li');
                    const avatarImg = `<img src="assets/images/team-member-placeholder.png" alt="User" class="avatar-sm">`;
                    let nameDisplay = escapeHTML(p.name || 'Anonymous');
                    if (sessionManagerInstance && sessionManagerInstance.currentUser && p.id === sessionManagerInstance.currentUser.id) {
                        nameDisplay += ' <span class="you-tag">You</span>';
                    }
                    if (p.isHost) {
                        nameDisplay += ' <span class="text-success small">(Host)</span>';
                    }
                    li.innerHTML = `${avatarImg} ${nameDisplay}`;
                    participantsUl.appendChild(li);
                });
                const totalParticipants = participantArray.length;
                participantCountBadge.textContent = totalParticipants;
                participantCountDisplay.textContent = totalParticipants;
            }
        },
        updatePageSwitcher: function() {
            if (!pageSwitcherContainer) {
                console.error("session-ui.js (interface): pageSwitcherContainer element not found!");
                return;
            }
            if (!whiteboardCoreInstance) {
                console.warn("session-ui.js (interface): WhiteboardCore not ready, cannot update page switcher.");
                return;
            }

            pageSwitcherContainer.innerHTML = ''; 
            const numPages = whiteboardCoreInstance.pages.length;
            const currentPageIdx = whiteboardCoreInstance.currentPageIndex;

            for (let i = 0; i < numPages; i++) {
                const pageButton = document.createElement('button');
                pageButton.classList.add('btn', 'btn-page');
                pageButton.textContent = i + 1;
                pageButton.dataset.pageIndex = i;
                if (i === currentPageIdx) {
                    pageButton.classList.add('active');
                }
                pageButton.addEventListener('click', function() {
                    const index = parseInt(this.dataset.pageIndex);
                    if (whiteboardCoreInstance) { 
                        whiteboardCoreInstance.switchToPage(index); // This will trigger onDrawCallback with 'switch_page'
                        // sessionUiInterface.updatePageSwitcher(); // No longer needed here, server response or direct call will handle
                    }
                });
                pageSwitcherContainer.appendChild(pageButton);
            }

            const currentIsHost = sessionManagerInstance ? sessionManagerInstance.currentUser.isHost : false;

            if (currentIsHost) { 
                const addPageButton = document.createElement('button');
                addPageButton.classList.add('btn', 'btn-page', 'btn-add-page');
                addPageButton.id = 'addPageBtn';
                addPageButton.title = 'Add New Page';
                addPageButton.innerHTML = '+';
                addPageButton.addEventListener('click', () => {
                    if (whiteboardCoreInstance) { 
                        whiteboardCoreInstance.addPage(); // This will trigger onDrawCallback with 'add_page'
                    }
                });
                pageSwitcherContainer.appendChild(addPageButton);
            }
            
            pageSwitcherContainer.classList.toggle('d-none', numPages === 0 && !currentIsHost);
            console.log("session-ui.js (interface): Page switcher updated. Pages:", numPages, "Current:", currentPageIdx);
        },
        setSessionInfo: function(currentSessionId, currentUserName, isCurrentUserHost) {
            document.title = `AR Whiteboard - ${currentSessionId || "New Session"}`;
            const sessionNameDisplay = document.getElementById('sessionNameDisplay');
            const sessionIdDisplay = document.getElementById('sessionIdDisplay');
            if(sessionNameDisplay) sessionNameDisplay.textContent = `Session Active`;
            if(sessionIdDisplay) sessionIdDisplay.textContent = `ID: ${currentSessionId || "N/A"}`;

            const enterArBtn = document.getElementById('enterArBtn');
            if (enterArBtn) {
                enterArBtn.classList.toggle('d-none', isCurrentUserHost);
            }
            // Logic to disable drawing tools if not host
            const drawingTools = document.querySelectorAll('.main-toolbar .tool-group button:not(#tool-select), .main-toolbar .tool-group input');
            if (!isCurrentUserHost) {
                drawingTools.forEach(toolElement => toolElement.disabled = true);
                console.log("session-ui.js: Participant mode - drawing tools disabled.");
            } else {
                drawingTools.forEach(toolElement => toolElement.disabled = false);
                 console.log("session-ui.js: Host mode - drawing tools enabled.");
            }
        },
        showError: function(message) {
            alert("Error: " + message); 
        }
    };
    
    // Helper function (if not defined elsewhere or globally)
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return str.toString()
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "''")
            .replace(/'/g, "'");
    }

    // --- Initialize Whiteboard & SessionManager ---
    if (canvasArea && whiteboardCanvasElement && typeof WhiteboardCore !== 'undefined') {
        const onDrawActionFromCore = (action) => {
            if (sessionManagerInstance) {
                if (action.tool === 'load_state') { // From local undo/redo
                    if (sessionManagerInstance.currentUser.isHost) { // Only host broadcasts full state changes from undo/redo
                        sessionManagerInstance.sendDrawingAction(action); 
                    }
                } else if (action.tool === 'add_page' || action.tool === 'switch_page') {
                    sessionManagerInstance.sendPageAction(action);
                } else { // Standard drawing actions (pen, marker, eraser, shapes, text, clear)
                    sessionManagerInstance.sendDrawingAction(action);
                }
            } else {
                console.warn("session-ui.js: sessionManagerInstance not available in onDrawActionFromCore. Action not sent:", action);
            }
        };

        whiteboardCoreInstance = new WhiteboardCore(
            'whiteboardCanvas',
            canvasArea.clientWidth,
            canvasArea.clientHeight,
            onDrawActionFromCore
        );
        console.log("session-ui.js: WhiteboardCore initialized.");

        if (typeof SessionManager !== 'undefined') {
            sessionManagerInstance = new SessionManager(whiteboardCoreInstance, sessionUiInterface);
            console.log("session-ui.js: SessionManager initialized.");
        } else {
            console.error("session-ui.js: SessionManager class is not defined! Make sure session-manager.js is loaded BEFORE session-ui.js and contains the class.");
            sessionUiInterface.showError("Collaboration features are unavailable. SessionManager failed to load.");
        }

        window.addEventListener('resize', () => {
            if (whiteboardCoreInstance && canvasArea) {
                whiteboardCoreInstance.resizeCanvas(canvasArea.clientWidth, canvasArea.clientHeight);
            }
        });
        
    } else {
        // Log detailed errors for missing core components
        if (!canvasArea) console.error("session-ui.js: CRITICAL - .canvas-area element not found!");
        if (!whiteboardCanvasElement) console.error("session-ui.js: CRITICAL - #whiteboardCanvas element not found!");
        if (typeof WhiteboardCore === 'undefined') console.error("session-ui.js: CRITICAL - WhiteboardCore class is not defined.");
        if (!pageSwitcherContainer) console.warn("session-ui.js: #pageSwitcherContainer element not found at init time, page switcher might not work initially.");
        return; // Stop further UI setup if critical parts are missing
    }

    // --- Toolbar Event Listeners --- (These should now work correctly with the instances)
    const toolsMapping = {
        'tool-select': 'select', 'tool-pen': 'pen', 'tool-marker': 'marker',
        'tool-eraser': 'eraser', 'tool-line': 'line', 'tool-rect': 'rect',
        'tool-circle': 'circle', 'tool-text': 'text'
    };

    document.querySelectorAll('.main-toolbar .btn-tool[id^="tool-"]').forEach(button => {
        button.addEventListener('click', function() {
            // Check if user is allowed to change tools (e.g., host only or if participants can draw)
            if (sessionManagerInstance && !sessionManagerInstance.currentUser.isHost) {
                // If participants are not allowed to draw by your rules, you might prevent tool changes
                // For now, this example allows tool selection, but drawing itself is controlled by sendDrawingAction
                // console.log("Participant selected tool, drawing might be restricted by SessionManager");
            }
            document.querySelectorAll('.main-toolbar .btn-tool.active').forEach(activeBtn => activeBtn.classList.remove('active'));
            this.classList.add('active');
            const toolName = toolsMapping[this.id];
            if (toolName && whiteboardCoreInstance) {
                whiteboardCoreInstance.setTool(toolName);
            }
        });
    });
    // Make 'pen' the default active tool on load, if the element exists
    const defaultToolButton = document.getElementById('tool-pen');
    if(defaultToolButton) defaultToolButton.classList.add('active');


    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker && whiteboardCoreInstance) {
        whiteboardCoreInstance.setColor(colorPicker.value); 
        colorPicker.addEventListener('input', (e) => whiteboardCoreInstance.setColor(e.target.value));
    }

    const sizePicker = document.getElementById('sizePicker');
    if (sizePicker && whiteboardCoreInstance) {
        whiteboardCoreInstance.setSize(sizePicker.value); 
        sizePicker.addEventListener('input', (e) => whiteboardCoreInstance.setSize(e.target.value));
    }

    const undoBtn = document.getElementById('tool-undo');
    if (undoBtn && whiteboardCoreInstance) undoBtn.addEventListener('click', () => whiteboardCoreInstance.undo());
    
    const redoBtn = document.getElementById('tool-redo');
    if (redoBtn && whiteboardCoreInstance) redoBtn.addEventListener('click', () => whiteboardCoreInstance.redo());
    
    const clearBoardBtn = document.getElementById('clearBoardBtn');
    if (clearBoardBtn && whiteboardCoreInstance) {
        clearBoardBtn.addEventListener('click', () => {
            if (sessionManagerInstance && !sessionManagerInstance.currentUser.isHost) {
                alert("Only the host can clear the board."); // Example permission check
                return;
            }
            if (confirm("Are you sure you want to clear the entire canvas for this page?")) {
                whiteboardCoreInstance.clearCanvas(); // This will trigger onDrawActionFromCore
            }
        });
    }

    // Save Session Button - using localStorage for simulation
    const saveSessionBtn = document.getElementById('saveSessionBtn');
    if (saveSessionBtn && whiteboardCoreInstance) {
        saveSessionBtn.addEventListener('click', () => {
            console.log("session-ui.js: Save Session clicked.");
            const allPagesData = whiteboardCoreInstance.getAllPagesData();
            let currentSessionName = "My Whiteboard Session";
            // Try to get existing session name if loading one
            const urlParamsForSave = new URLSearchParams(window.location.search);
            const currentSessionIdForSave = urlParamsForSave.get('session_id');
            if (currentSessionIdForSave) {
                const sessions = JSON.parse(localStorage.getItem('arWhiteboardSessions')) || [];
                const existingSession = sessions.find(s => s.id === currentSessionIdForSave);
                if (existingSession && existingSession.name) {
                    currentSessionName = existingSession.name;
                }
            }

            const sessionName = prompt("Please enter a name for this session:", currentSessionName);

            if (sessionName === null || sessionName.trim() === "") {
                alert("Session name cannot be empty. Save cancelled.");
                return;
            }
            
            // Use session ID from SessionManager if available (meaning connected to server session)
            // Otherwise, use URL param if loading, or generate new for a purely local save.
            const sessionIdToUse = (sessionManagerInstance && sessionManagerInstance.sessionId)
                                 ? sessionManagerInstance.sessionId
                                 : currentSessionIdForSave || `LCLsession_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;


            const sessionDataToSave = {
                name: sessionName.trim(),
                pages: allPagesData,
                timestamp: new Date().toISOString(),
                id: sessionIdToUse,
                // userId: sessionManagerInstance ? sessionManagerInstance.currentUser.id : 'local_user',
                // isHostedByCurrentUser: sessionManagerInstance ? sessionManagerInstance.currentUser.isHost : true
            };
            console.log("Session Data to Save to localStorage:", sessionDataToSave);

            let savedSessions = JSON.parse(localStorage.getItem('arWhiteboardSessions')) || [];
            const existingSessionIndex = savedSessions.findIndex(s => s.id === sessionIdToUse);

            if (existingSessionIndex > -1) {
                savedSessions[existingSessionIndex] = sessionDataToSave;
                console.log("session-ui.js: Existing session updated in localStorage.");
            } else {
                savedSessions.push(sessionDataToSave);
                console.log("session-ui.js: New session added to localStorage.");
            }
            
            try {
                localStorage.setItem('arWhiteboardSessions', JSON.stringify(savedSessions));
                alert(`Session "${sessionName}" saved (locally)! Redirecting to dashboard...`);
                window.location.href = 'profile.html';
            } catch (e) {
                console.error("session-ui.js: Error saving session to localStorage", e);
                alert("Could not save session locally. LocalStorage might be full or disabled.");
            }
        });
    }

    // --- Side Panel UI ---
    const toggleSidePanelBtn = document.getElementById('toggleSidePanelBtn');
    const sessionSidePanel = document.getElementById('sessionSidePanel');
    if (toggleSidePanelBtn && sessionSidePanel) {
        toggleSidePanelBtn.addEventListener('click', () => sessionSidePanel.classList.toggle('open'));
    }
    
    // --- AR Button UI ---
    const enterArBtn = document.getElementById('enterArBtn');
    const exitArBtn = document.getElementById('exitArButton');
    const arPopup = document.getElementById('arModePopup');
    if (enterArBtn && exitArBtn && arPopup) { // Ensure all AR elements exist
        // Visibility is now handled by sessionUiInterface.setSessionInfo
        enterArBtn.addEventListener('click', () => {
            console.log("session-ui.js: Enter AR clicked.");
            arPopup.style.display = 'block';
            exitArBtn.classList.remove('d-none');
            // TODO: Call actual AR integration start method
            setTimeout(() => { arPopup.style.display = 'none'; }, 2000);
        });
        exitArBtn.addEventListener('click', () => {
            console.log("session-ui.js: Exit AR clicked.");
            exitArBtn.classList.add('d-none');
            // TODO: Call actual AR integration exit method
        });
    }

    console.log("session-ui.js: All UI initializations complete.");
});