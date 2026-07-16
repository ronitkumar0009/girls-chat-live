const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = WebService = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7
});

app.use(express.static('public'));

let waitingUsers = [];
let totalOnlineCount = 0;

io.on('connection', (socket) => {
    totalOnlineCount++;
    io.emit('update_online_count', totalOnlineCount);

    socket.on('find_match', (data) => {
        socket.myGender = data.myGender;
        socket.targetGender = data.targetGender;
        socket.profileName = data.profileName || "Stranger";
        socket.profileAge = data.profileAge || "22";
        socket.profilePic = data.profilePic || ""; 

        let match = waitingUsers.find(user => {
            let genderMatch = false;
            if (socket.targetGender === 'random' && user.targetGender === 'random') {
                genderMatch = true;
            } else if (socket.targetGender === user.myGender && user.targetGender === socket.myGender) {
                genderMatch = true;
            } else if (socket.targetGender === 'random' && user.targetGender === socket.myGender) {
                genderMatch = true;
            } else if (socket.targetGender === user.myGender && user.targetGender === 'random') {
                genderMatch = true;
            }
            return genderMatch && user.id !== socket.id;
        });

        if (match) {
            waitingUsers = waitingUsers.filter(user => user.id !== match.id);
            socket.partner = match;
            match.partner = socket;

            socket.emit('match_found', {
                name: match.profileName,
                age: match.profileAge,
                pic: match.profilePic,
                gender: match.myGender
            });

            match.emit('match_found', {
                name: socket.profileName,
                age: socket.profileAge,
                pic: socket.profilePic,
                gender: socket.myGender
            });
        } else {
            waitingUsers.push(socket);
        }
    });

    socket.on('send_message', (msg) => {
        if (socket.partner) {
            socket.partner.emit('receive_message', msg);
        }
    });

    // --- Typing Status Relay ---
    socket.on('typing', (isTyping) => {
        if (socket.partner) {
            socket.partner.emit('partner_typing', isTyping);
        }
    });

    socket.on('leave_chat', () => {
        disconnectPartner(socket);
    });

    socket.on('disconnect', () => {
        totalOnlineCount--;
        io.emit('update_online_count', Math.max(0, totalOnlineCount));
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        disconnectPartner(socket);
    });
});

function disconnectPartner(socket) {
    if (socket.partner) {
        socket.partner.emit('partner_disconnected');
        socket.partner.partner = null;
        socket.partner = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});