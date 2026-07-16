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

const botNames = ["Priya", "Anjali", "Sneha", "Riya", "Kriti", "Simran", "Tanya", "Neha", "Divya", "Palak", "Alka", "Pooja", "Shreya"];
const botLocations = ["Delhi", "Lucknow", "Mumbai", "Chandigarh", "Jaipur", "Pune", "Kolkata", "Indore", "Noida", "Patna"];

// 👩 Guaranteed High-Quality Beautiful Vector Girl Avatars (Zero Boys Mix)
const botAvatars = [
    "https://cdn-icons-png.flaticon.com/512/6997/6997662.png", // Beautiful Clean Female Icon 1
    "https://cdn-icons-png.flaticon.com/512/4140/4140047.png", // Female Icon 2
    "https://cdn-icons-png.flaticon.com/512/4140/4140048.png", // Female Icon 3
    "https://cdn-icons-png.flaticon.com/512/1154/1154448.png"  // Female Icon 4
];

// Instagram par refuse karne ke liye random bahane
const instaExcuses = [
    "Nahi yaar, main strangers ko insta id nahi deti, bohot stalkers hote hain.",
    "Insta account temporary deactivated hai mera abhi, board/exams ki wajah se.",
    "Mera account private hai aur mummy bhi follow karti hain, toh wahan nahi de sakti sry.",
    "Mujhe anjaan logo pe jaldi trust nahi hota, toh abhi id share nahi karungi sorry. 🙈",
    "Nahi abhi yahi baat karte hain na, insta thoda personal ho jata hai."
];

// Fail-safe fallbacks agar API block ya fail ho jaye (Sequential, repeat nahi honge)
const fallbackMessages = [
    "Hii! Kaise ho?",
    "Arey suno na, kya kar rahe ho waise?",
    "Hmm... aur batao? Kuch acchi baatein karte hain na.",
    "Waise aap kahan se ho? Main toh Delhi se hoon.",
    "Aap bht acche se baat karte ho yaar, sach me!",
    "Chalo ab main chalti hoon thoda kam hai, baad me baat karenge, bye! ❤️"
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
        socket.isProcessing = false; // Duplicate messages preventer lock
        socket.fallbackIndex = 0; // Tracks response chain in case of API failure to prevent repetitions

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
                    
                    // Direct proper female avatar selection
                    const randomPic = botAvatars[Math.floor(Math.random() * botAvatars.length)];

                    socket.emit('match_found', {
                        name: socket.botName,
                        age: socket.botAge,
                        pic: randomPic,
                        gender: 'female' // Strict UI gender trigger
                    });

                    // Bot silently waits for the user to initiate the chat.
                }
            }, 3000); 
        }
    });

    socket.on('send_message', (msg) => {
        if (socket.partner) {
            socket.partner.emit('receive_message', msg);
        } else if (socket.isBotConnected) {
            if (socket.isProcessing) return;
            socket.isProcessing = true;

            // Strict 6 seconds delay (6000ms)
            const typingDelay = 6000; 

            // Show typing after exactly 1 second of user sending message
            setTimeout(() => {
                if (socket.isBotConnected) socket.emit('partner_typing', true);
            }, 1000);
            
            // Send reply after exactly 6 seconds total has passed
            setTimeout(() => {
                if (socket.isBotConnected) {
                    socket.emit('partner_typing', false);
                    sendAiMessage(socket, msg).then(() => {
                        socket.isProcessing = false; // Release lock
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

    // Direct Instagram/Snap/Number check to save API and avoid failure loops
    const userLower = userText.toLowerCase();
    if (userLower.includes("insta") || userLower.includes("instagram") || userLower.includes("snap") || userLower.includes("id") || userLower.includes("number") || userLower.includes("no") || userLower.includes("num")) {
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
    3. MATCH THE CONTEXT: If the user says they are from your city or same location, act surprised and naturally ask where exactly or tell them you live in the main town area. Respond logically based on what they say. Do not repeat previous answers. Do not say "network issue" unless the chat actually breaks.
    4. CLOSING LEAVE EXCUSE: After around 6 to 8 message exchanges, randomly bring up a believable excuse to drop out (e.g., phone switch off ho raha hai, mummy ka call aa raha hai, study karni hai) and say bye.
    `;

    try {
        socket.chatHistory.push({ role: 'user', parts: [{ text: userText }] });

        // Keep history in check to avoid repeating old context loops
        if (socket.chatHistory.length > 20) {
            socket.chatHistory = socket.chatHistory.slice(-10);
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: socket.chatHistory,
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: 70,
                temperature: 0.8
            }
        });

        let aiReply = response.text.trim();
        
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
        console.error("Gemini Engine Error (Falling back to safe sequence):", error);
        
        // Dynamic safe fallback index: Har message ke baad next sequential index pick hoga (No repeats!)
        const currentIdx = socket.fallbackIndex % fallbackMessages.length;
        const randomFallback = fallbackMessages[currentIdx];
        
        socket.fallbackIndex += 1; // Agle trigger par agla message aayega!
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