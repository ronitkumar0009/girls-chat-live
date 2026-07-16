const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { GoogleGenAI } = require('@google/genai');

// 🔐 Secure way: Render ke Environment Variables se key automatically read hogi
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7
});

app.use(express.static('public'));

let waitingUsers = [];
let totalOnlineCount = 0;

const botNames = ["Priya", "Anjali", "Sneha", "Riya", "Kriti", "Simran", "Tanya", "Neha", "Divya", "Palak", "ragni", "Noor", "Alka", "Jannat", "Jainab"];
const botLocations = ["Delhi", "Lucknow", "Mumbai", "Chandigarh", "Jaipur", "Pune", "Kolkata", "Indore", "Noida", "Patna"];
const botAvatars = [
    "https://cdn-icons-png.flaticon.com/512/6997/6997662.png",
    "https://cdn-icons-png.flaticon.com/512/4140/4140047.png",
    "https://cdn-icons-png.flaticon.com/512/4140/4140048.png"
];

// Instargam par refuse karne ke liye random bahane
const instaExcuses = [
    "Nahi yaar, main strangers ko insta id nahi deti, bohot stalkers hote hain.",
    "Insta account temporary deactivated hai mera abhi, board/exams ki wajah se.",
    "Mera account private hai aur mummy bhi follow karti hain, toh wahan nahi de sakti sry.",
    "Mujhe anjaan logo pe jaldi trust nahi hota, toh abhi id share nahi karungi sorry. 🙈",
    "Nahi abhi yahi baat karte hain na, insta thoda personal ho jata hai."
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
        socket.chatHistory = [];
        socket.isProcessing = false; // Duplicate messages ko rokne ke liye guard lock

        socket.botName = botNames[Math.floor(Math.random() * botNames.length)];
        socket.botLocation = botLocations[Math.floor(Math.random() * botLocations.length)];
        socket.botAge = Math.floor(Math.random() * (24 - 19 + 1)) + 19;

        let match = waitingUsers.find(user => user.id !== socket.id);

        if (match) {
            waitingUsers = waitingUsers.filter(user => user.id !== match.id);
            socket.partner = match;
            match.partner = socket;

            socket.emit('match_found', { name: match.profileName, age: match.profileAge, pic: match.profilePic, gender: match.myGender });
            match.emit('match_found', { name: socket.profileName, age: socket.profileAge, pic: socket.profilePic, gender: socket.myGender });
        } else {
            waitingUsers.push(socket);

            socket.botTimeout = setTimeout(() => {
                if (waitingUsers.includes(socket) && !socket.partner) {
                    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
                    socket.isBotConnected = true;
                    
                    const randomPic = botAvatars[Math.floor(Math.random() * botAvatars.length)];

                    socket.emit('match_found', {
                        name: socket.botName,
                        age: socket.botAge,
                        pic: randomPic,
                        gender: 'female'
                    });

                    // 5 se 8 second ka natural delay pehle message ke liye bhi
                    const botStartsFirst = Math.random() < 0.5;
                    if (botStartsFirst) {
                        const initialDelay = 5000 + Math.floor(Math.random() * 3000); 
                        setTimeout(() => {
                            if (socket.isBotConnected) {
                                sendAiMessage(socket, "__START_CHAT__");
                            }
                        }, initialDelay);
                    }
                }
            }, 3000); 
        }
    });

    socket.on('send_message', (msg) => {
        if (socket.partner) {
            socket.partner.emit('receive_message', msg);
        } else if (socket.isBotConnected) {
            // Guard: Agar pehle se reply process ho raha hai toh dubara event trigger na ho
            if (socket.isProcessing) return;
            socket.isProcessing = true;

            // 5 se 8 second ka mast random gap delay (e.g. typing feels real)
            const typingDelay = 5000 + Math.floor(Math.random() * 3000);

            // Chat send karne ke thik 1 second baad 'typing' show karega
            setTimeout(() => {
                if (socket.isBotConnected) socket.emit('partner_typing', true);
            }, 1000);
            
            // Poora delay khatam hone par message bhejega
            setTimeout(() => {
                if (socket.isBotConnected) {
                    socket.emit('partner_typing', false);
                    sendAiMessage(socket, msg).then(() => {
                        socket.isProcessing = false; // Lock release kiya
                    });
                } else {
                    socket.isProcessing = false;
                }
            }, typingDelay);
        }
    });

    socket.on('typing', (isTyping) => {
        if (socket.partner) socket.partner.emit('partner_typing', isTyping);
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

async function sendAiMessage(socket, userText) {
    if (!socket.isBotConnected) return;

    // Hardcoded logic: Agar user Instagram mangta hai toh seedha random bahana bhejein, API call waste na karein
    const userLower = userText.toLowerCase();
    if (userLower.includes("insta") || userLower.includes("instagram") || userLower.includes("snap") || userLower.includes("id") || userLower.includes("number") || userLower.includes("no")) {
        // Random excuse nikalna list se
        const randomExcuse = instaExcuses[Math.floor(Math.random() * instaExcuses.length)];
        
        socket.chatHistory.push({ role: 'user', parts: [{ text: userText }] });
        socket.chatHistory.push({ role: 'model', parts: [{ text: randomExcuse }] });
        
        socket.emit('receive_message', randomExcuse);
        return;
    }

    const systemInstruction = `
    You are a real 21-year-old Indian girl named "${socket.botName}" from "${socket.botLocation}". 
    You are currently chatting with a random user on an anonymous text chat website.
    
    RULES YOU MUST FOLLOW:
    1. Reply ONLY in short, dynamic, natural Hindi or Hinglish (e.g., "Hey, kaise ho?", "Main badhiya, aap batao?", "Arey sahi me? Ekdam mast"). Do NOT use bookish or robotic Hindi. Talk exactly like a typical Indian girl on WhatsApp or Instagram DMs. Use occasional emojis.
    2. Keep your answers short (1 or 2 sentences max). Do not explain too much or write paragraphs.
    3. MATCH THE CONTEXT: If the user says they are from your city or same location, act surprised and naturally ask where exactly or tell them you live in the main town area. Respond logically based on what they say. Do not repeat previous answers.
    4. CLOSING LEAVE EXCUSE: After around 6 to 8 message exchanges, randomly bring up a believable excuse to drop out (e.g., phone switch off ho raha hai, mummy ka call aa raha hai, study karni hai) and say bye.
    `;

    try {
        if (userText !== "__START_CHAT__") {
            socket.chatHistory.push({ role: 'user', parts: [{ text: userText }] });
        } else {
            userText = "Initiate the chat with a short, friendly greeting in Hinglish like a regular Indian girl.";
        }

        // Chat history ko limits me rakhne ke liye taaki duplicate response ya overflow na ho
        if (socket.chatHistory.length > 20) {
            socket.chatHistory = socket.chatHistory.slice(-10);
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: socket.chatHistory.concat([{ role: 'user', parts: [{ text: userText }] }]),
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: 70,
                temperature: 0.8
            }
        });

        let aiReply = response.text.trim();
        
        // Agar response empty ho ya automatic repeat lag raha ho, toh default fallback dynamic karenge
        if (!aiReply || aiReply === "") {
            aiReply = "Aur batao, kya chal raha?";
        }

        socket.chatHistory.push({ role: 'model', parts: [{ text: aiReply }] });
        socket.emit('receive_message', aiReply);

        if (aiReply.toLowerCase().includes("bye") || aiReply.toLowerCase().includes("chalti hu") || aiReply.toLowerCase().includes("tata")) {
            setTimeout(() => {
                if (socket.isBotConnected) {
                    socket.emit('partner_disconnected');
                    socket.isBotConnected = false;
                }
            }, 3000);
        }

    } catch (error) {
        console.error("Gemini Engine Error:", error);
        
        // Fallback responses array taaki har bar same error message repeat na ho
        const fallbackMessages = [
            "Arey suno na, thoda network issue ho gaya hai shayad.",
            "Hmm... achha aur batao?",
            "Aapki awaz... sorry text late aa raha hai shayad.",
            "Suno, tum kya karte ho waise?"
        ];
        const randomFallback = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
        socket.emit('receive_message', randomFallback);
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