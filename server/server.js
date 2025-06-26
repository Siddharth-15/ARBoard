// ar-whiteboard-server/server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://127.0.0.1:5500", // Allow your VS Code Live Server origin
        // You might also need to allow: "http://localhost:5500" or your specific frontend port
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001; // Use a different port from your frontend, e.g., 3001

// In-memory storage for sessions (very basic)
let activeSessions = {}; // Example: { "session123": { participants: [], hostId: null } }

io.on('connection', (socket) => {
    console.log(`SERVER: User connected - ${socket.id}`);

    socket.on('create_session_request', (data, callback) => {
        const userName = data.userName || 'Host';
        const sessionId = `ARWS_${Math.random().toString(36).substr(2, 7).toUpperCase()}`;
        activeSessions[sessionId] = {
            id: sessionId,
            hostId: socket.id,
            participants: { [socket.id]: { name: userName, isHost: true } },
            drawingData: [[]] // Initialize with one empty page
        };
        socket.join(sessionId); // Host joins the room
        console.log(`SERVER: Session created - ID: ${sessionId}, Host: ${userName} (${socket.id})`);
        // Send back session ID and initial participant list (just the host)
        callback({ success: true, sessionId: sessionId, participants: activeSessions[sessionId].participants });
    });

    socket.on('join_session_request', (data, callback) => {
        const { sessionId, userName } = data;
        const session = activeSessions[sessionId];

        if (session) {
            socket.join(sessionId);
            session.participants[socket.id] = { name: userName || `User_${socket.id.substr(0,4)}`, isHost: false };
            
            // Notify OTHERS in the room about the new user
            socket.to(sessionId).emit('user_joined_notification', { 
                userId: socket.id, 
                userName: session.participants[socket.id].name 
            });
            
            console.log(`SERVER: User ${userName} (${socket.id}) joined session ${sessionId}`);
            // Send session details (including current drawing data and participants) to the new joiner
            callback({ 
                success: true, 
                sessionId: sessionId, 
                drawingData: session.drawingData, 
                participants: session.participants 
            });
        } else {
            console.log(`SERVER: User ${socket.id} failed to join session ${sessionId} - Not found`);
            callback({ success: false, message: 'Session not found.' });
        }
    });
    
    // Placeholder for drawing actions
    socket.on('drawing_action', (data) => {
        const { sessionId, action } = data;
        if (activeSessions[sessionId]) {
            console.log(`SERVER: Received drawing_action for session ${sessionId}:`, action.tool);
            // Broadcast to others in the room
            socket.to(sessionId).emit('new_drawing_action_from_server', action);
        }
    });

    // Placeholder for page actions
    socket.on('page_action', (data) => {
        const { sessionId, action } = data;
         if (activeSessions[sessionId]) {
            console.log(`SERVER: Received page_action for session ${sessionId}:`, action.tool);
            // Update server-side model if necessary (e.g., add empty page to drawingData)
            if (action.tool === 'add_page' && activeSessions[sessionId].drawingData) {
                while (activeSessions[sessionId].drawingData.length <= action.newPageIndex) {
                    activeSessions[sessionId].drawingData.push([]);
                }
            }
            socket.to(sessionId).emit('page_update_from_server', action);
        }
    });


    socket.on('disconnect', () => {
        console.log(`SERVER: User disconnected - ${socket.id}`);
        for (const sessionId in activeSessions) {
            const session = activeSessions[sessionId];
            if (session.participants[socket.id]) {
                const disconnectedUserName = session.participants[socket.id].name;
                delete session.participants[socket.id];
                console.log(`SERVER: User ${disconnectedUserName} removed from session ${sessionId}`);
                socket.to(sessionId).emit('user_left_notification', { 
                    userId: socket.id, 
                    userName: disconnectedUserName 
                });

                if (Object.keys(session.participants).length === 0) {
                    console.log(`SERVER: Session ${sessionId} is now empty. Deleting.`);
                    delete activeSessions[sessionId];
                }
                break; 
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`AR Whiteboard Backend Server running on http://localhost:${PORT}`);
});