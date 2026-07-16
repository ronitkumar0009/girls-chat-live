const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7
});

app.use(express.static('public'));

let waitingUsers = [];
let totalOnlineCount = 0;

// Dynamic Data Lists for Bots
const botNames = ["Priya", "Anjali", "Sneha", "Riya", "Kriti", "Simran", "Tanya", "Neha"];
const botLocations = ["Delhi", "Lucknow", "Mumbai", "Chandigarh", "Jaipur", "Pune", "Kolkata", "Indore"];
const botAvatars = [
    "https://cdn-icons-png.flaticon.com/512/6997/6997662.png",
    "https://cdn-icons-png.flaticon.com/512/4140/4140047.png",
    "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
];
const botExitExcuses = [
    "Achha suno, mujhe thoda kaam aa gaya hai mom bula rahi hain, baad me baat karte hain? Bye! ❤️",
    "Yaar phone ki battery 2% bachi hai, switch off hone wala hai. Chalti hu, bye! 🔋✨",
    "Arey exams chal rahe hain toh thoda padhne jana hai abhi, bye bye tc!",
    "Bestie ka call aa raha hai baar baar, uthana padega. Nice chatting with you, bye! 👋",
    "meri mom bula rahi hai esliye mujhe jana hoga",
    "wait abhi aati hu tum wait karna ",
    "bye mai ja rahi hu game khelne mai bgmi khelti hu esliye mujhe jana hoga friends bula rahe hai"
];

io.on('connection', (socket) => {
    totalOnlineCount++;
    io.emit('update_online_count', totalOnlineCount);

    socket.on('find_match', (data) => {
        socket.myGender = data.myGender;
        socket.targetGender = data.targetGender;
        socket.profileName = data.profileName || "Stranger";
        socket.profileAge = data.profileAge || "22";
        socket.profilePic = data.profilePic || ""; 
        
        // Bot setup attributes
        socket.isBotConnected = false;
        socket.botStep = 0;
        socket.botName = botNames[Math.floor(Math.random() * botNames.length)];
        socket.botLocation = botLocations[Math.floor(Math.random() * botLocations.length)];
        socket.botExit = botExitExcuses[Math.floor(Math.random() * botExitExcuses.length)];

        let match = waitingUsers.find(user => user.id !== socket.id);

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

            // 3 Second Timeout for Bot Initialization
            socket.botTimeout = setTimeout(() => {
                if (waitingUsers.includes(socket) && !socket.partner) {
                    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
                    
                    socket.isBotConnected = true;
                    const randomPic = botAvatars[Math.floor(Math.random() * botAvatars.length)];
                    const randomAge = Math.floor(Math.random() * (24 - 19 + 1)) + 19;

                    socket.emit('match_found', {
                        name: socket.botName,
                        age: randomAge,
                        pic: randomPic,
                        gender: 'female'
                    });

                    setTimeout(() => {
                        if (socket.isBotConnected) {
                            sendBotMessage(socket, "");
                        }
                    }, 4500);
                }
            }, 3000); 
        }
    });

    socket.on('send_message', (msg) => {
        if (socket.partner) {
            socket.partner.emit('receive_message', msg);
        } else if (socket.isBotConnected) {
            socket.emit('partner_typing', true);
            
            setTimeout(() => {
                socket.emit('partner_typing', false);
                sendBotMessage(socket, msg.toLowerCase());
            }, 1800 + Math.random() * 1200);
        }
    });

    socket.on('typing', (isTyping) => {
        if (socket.partner) {
            socket.partner.emit('partner_typing', isTyping);
        }
    });

    socket.on('leave_chat', () => {
        clearTimeout(socket.botTimeout);
        disconnectPartner(socket);
    });

    socket.on('disconnect', () => {
        totalOnlineCount--;
        io.emit('update_online_count', Math.max(0, totalOnlineCount));
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
        clearTimeout(socket.botTimeout);
        disconnectPartner(socket);
    });
});

// Smart Hindi Bot Script Engine
function sendBotMessage(socket, userText) {
    if (!socket.isBotConnected) return;

    // --- INSTAGRAM DETECTOR LOGIC ---
    if (userText.includes("insta") || userText.includes("instagram") || userText.includes("id") || userText.includes("handle")) {
        socket.emit('receive_message', "Nahi dungi, mujhe stranger logo pe jaldi bharosa nahi hota. 🤫");
        return; // Normal script flow ko pause kar diya taaki ye reply pehle jaye
    }

    // Dynamic Conversation Steps base on custom locations
    const botConversations = [
        `Hey! Kaise ho? 😊`,
        `Mera naam ${socket.botName} hai. Aapka naam kya hai?`,
        `Main ${socket.botLocation} se hu, aap kahan se ho?`,
        `Bas abhi thoda bored ho rahi thi toh socha kisi se baat kar lu. Aap kya karte ho?`,
        `Achaa sahi hai! Waise is website par kaafi acche log mil rahe hain aaj kal haha. 🙈`,
        `Aur batao, life me kya chal raha hai aapki?`,
        socket.botExit // Dynamic random excuse
    ];

    const currentStep = socket.botStep;
    if (currentStep < botConversations.length) {
        const botMsg = botConversations[currentStep];
        socket.emit('receive_message', botMsg);
        socket.botStep++;
    } else {
        socket.emit('partner_disconnected');
        socket.isBotConnected = false;
    }
}

function disconnectPartner(socket) {
    if (socket.partner) {
        socket.partner.emit('partner_disconnected');
        socket.partner.partner = null;
        socket.partner = null;
    }
    if (socket.isBotConnected) {
        socket.isBotConnected = false;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});