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

// Dynamic Data Pools
const botNames = ["Priya", "Anjali", "Sneha", "Riya", "Kriti", "Simran", "Tanya", "Neha", "Divya", "Palak"];
const botLocations = ["Delhi", "Lucknow", "Mumbai", "Chandigarh", "Jaipur", "Pune", "Kolkata", "Indore", "Noida", "Patna"];
const botAvatars = [
    "https://cdn-icons-png.flaticon.com/512/6997/6997662.png",
    "https://cdn-icons-png.flaticon.com/512/4140/4140047.png",
    "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
];

// STEP BY STEP RANDOM DIALOGUE POOLS
const step0Replies = ["Hey! Kaise ho? 😊", "Hello, kya chal raha hai?", "Hi, kisse baat ho rahi hai? 👀", "Heyy, kaise ho aap?"];
const step1Replies = (name) => [`Mera naam ${name} hai. Aapka naam kya hai?`, `I am ${name}. Waise aapka naam kya hai?`, `Mujhe ${name} bolte hain. Aapka naam?`];
const step2Replies = (loc) => [`Main ${loc} se hu, aap kahan se ho?`, `Btw main ${loc} se hu, aap kahan rehte ho?`, `Waise main ${loc} se belong karti hu, aap kahan se ho?`];

const step3Replies = [
    "Bas abhi thoda bored ho rahi thi toh socha kisi se baat kar lu. Aap kya karte ho?",
    "Kuch nahi yaar, bas aise hi scroll kar rahi thi fir ye site mil gayi. Aap kya karte ho waise?",
    "Main toh bas gaane sun rahi thi aur bohot boring lag raha tha din aaj ka. Aap batao, study ya job?",
    "Ghar pe akele baithi thi toh timepass ke liye try kiya ye. Aap kya karte ho?"
];

const step4Replies = [
    "Achaa sahi hai! Waise is website par kaafi acche log mil rahe hain aaj kal haha. 🙈",
    "Oh wow, cool! Mujhe laga yahan sab ajeeb log honge par aap sahi lag rahe ho.",
    "Nice! Chalo koi toh mila yahan normal dhang se baat karne wala.",
    "Great! Aur batao mood kaisa hai aaj aapka?"
];

const step5Replies = [
    "Aur batao, life me kya chal raha hai aapki?",
    "Kuch naya sunao, aaj ka din kaisa raha aapka?",
    "Waise yahan log bohot jaldi skip marte hain na? Hahaha.",
    "Btw aap yahan roz aate ho kya baat karne?"
];

const step6Replies = [
    "Achha suno, mujhe thoda kaam aa gaya hai mom bula rahi hain, baad me baat karte hain? Bye! ❤️",
    "Yaar phone ki battery 2% bachi hai, switch off hone wala hai. Chalti hu, bye! 🔋✨",
    "Arey exams chal rahe hain toh thoda padhne jana hai abhi, bye bye tc!",
    "Bestie ka call aa raha hai baar baar, uthana padega. Nice chatting with you, bye! 👋"
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
        
        socket.isBotConnected = false;
        socket.botStep = 0;
        
        // Dynamic assignment for this specific bot session
        socket.botName = botNames[Math.floor(Math.random() * botNames.length)];
        socket.botLocation = botLocations[Math.floor(Math.random() * botLocations.length)];
        
        // Randomly pick unique sentence variants for this session
        socket.chosenStep0 = step0Replies[Math.floor(Math.random() * step0Replies.length)];
        socket.chosenStep1 = step1Replies(socket.botName)[Math.floor(Math.random() * step1Replies(socket.botName).length)];
        socket.chosenStep2 = step2Replies(socket.botLocation)[Math.floor(Math.random() * step2Replies(socket.botLocation).length)];
        socket.chosenStep3 = step3Replies[Math.floor(Math.random() * step3Replies.length)];
        socket.chosenStep4 = step4Replies[Math.floor(Math.random() * step4Replies.length)];
        socket.chosenStep5 = step5Replies[Math.floor(Math.random() * step5Replies.length)];
        socket.chosenStep6 = step6Replies[Math.floor(Math.random() * step6Replies.length)];

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

                    // Pehla message thoda random gap ke baad jayega (3 to 6 seconds)
                    const initialDelay = 3000 + Math.random() * 3000;
                    setTimeout(() => {
                        if (socket.isBotConnected) {
                            sendBotMessage(socket, "");
                        }
                    }, initialDelay + 1500); // UI open delay adjusted
                }
            }, 3000); 
        }
    });

    socket.on('send_message', (msg) => {
        if (socket.partner) {
            socket.partner.emit('receive_message', msg);
        } else if (socket.isBotConnected) {
            // DYNAMIC DELAY GENERATOR (2000ms se 10000ms tak - Yani 2 se 10 second ke beech random)
            const randomTypingDelay = 1500 + Math.random() * 2000; // Kab tak user ko wait karana shuru karna h
            const totalReplyDelay = 2000 + Math.floor(Math.random() * 8000); // Total wait time (2 to 10 sec)

            // Thodi der baad bot pehle "Typing..." status dikhayega
            setTimeout(() => {
                if (socket.isBotConnected) {
                    socket.emit('partner_typing', true);
                }
            }, randomTypingDelay);
            
            // Aur total random duration bitne par reply send karega aur typing band karega
            setTimeout(() => {
                if (socket.isBotConnected) {
                    socket.emit('partner_typing', false);
                    sendBotMessage(socket, msg.toLowerCase());
                }
            }, totalReplyDelay);
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

function sendBotMessage(socket, userText) {
    if (!socket.isBotConnected) return;

    // Instagram Handler (Dynamic & Strict attitude)
    if (userText.includes("insta") || userText.includes("instagram") || userText.includes("id") || userText.includes("handle")) {
        const instaReplies = [
            "Nahi dungi, mujhe stranger logo pe jaldi bharosa nahi hota. 🤫",
            "Arey pehle thodi baat toh karlo, itni jaldi insta kon deta hai? 😂",
            "Insta public nahi karti main jaldi kisi stranger ke sath, sorry."
        ];
        socket.emit('receive_message', instaReplies[Math.floor(Math.random() * instaReplies.length)]);
        return; 
    }

    const botConversations = [
        socket.chosenStep0,
        socket.chosenStep1,
        socket.chosenStep2,
        socket.chosenStep3,
        socket.chosenStep4,
        socket.chosenStep5,
        socket.chosenStep6
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

function deletePendingBotTimers(socket) {
    // Clean ups if necessary
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