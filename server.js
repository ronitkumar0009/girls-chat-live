const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Groq } = require('groq-sdk'); // ⚡ Official Groq SDK

// 🔐 Render Environment Variables se Groq API Key read hogi
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

// Instagram aur number maangne par natural rejection excuses
const instaExcuses = [
    "Nahi yaar, main strangers ko insta id nahi deti, bohot stalkers hote hain.",
    "Insta account temporary deactivated hai mera abhi, board/exams ki wajah se.",
    "Mera account private hai aur mummy bhi follow karti hain, toh wahan nahi de sakti sry.",
    "Mujhe anjaan logo pe jaldi trust nahi hota, toh abhi id share nahi karungi sorry. 🙈",
    "Nahi abhi yahi baat karte hain na, insta thoda personal ho jata hai."
];

// Helper function to get the current time period name for Indian Standard Time
function getCurrentTimeContext() {
    const currentDate = new Date();
    const utcOffset = currentDate.getTime() + (currentDate.getTimezoneOffset() * 60000);
    const istDate = new Date(utcOffset + (3600000 * 5.5)); 
    const currentHour = istDate.getHours(); 

    if (currentHour >= 5 && currentHour < 12) return "Morning (Subah ka waqt)";
    if (currentHour >= 12 && currentHour < 16) return "Afternoon (Dopehar ka waqt)";
    if (currentHour >= 16 && currentHour < 20) return "Evening (Shaam ka waqt)";
    if (currentHour >= 20 && currentHour < 24) return "Night (Raat ka waqt)";
    return "Late Night (Late raat ka waqt)";
}

// Sequential fallback system
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
        // Cleaning and restoring initial variables
        clearTimeout(socket.botTimeout);
        disconnectPartner(socket);
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

        socket.myGender = data.myGender || "unspecified";
        socket.targetGender = data.targetGender || "everyone";
        socket.profileName = data.profileName || "Stranger";
        socket.profileAge = data.profileAge || "22";
        socket.profilePic = data.profilePic || ""; 
        
        socket.isBotConnected = false;
        socket.chatHistory = [];
        socket.isProcessing = false; 
        socket.fallbackIndex = 0; 

        socket.botName = botNames[Math.floor(Math.random() * botNames.length)];
        socket.botLocation = botLocations[Math.floor(Math.random() * botLocations.length)];
        socket.botAge = Math.floor(Math.random() * (24 - 19 + 1)) + 19;

        // 👥 ADVANCED PRIVATE ROOM GENDER MATCHMAKING LOGIC
        let match = waitingUsers.find(user => {
            if (user.id === socket.id) return false;

            // Check if socket satisfies user requirements
            const amIMatchForUser = (user.targetGender === 'everyone' || user.targetGender === socket.myGender);
            // Check if user satisfies socket requirements
            const isUserMatchForMe = (socket.targetGender === 'everyone' || socket.targetGender === user.myGender);

            return amIMatchForUser && isUserMatchForMe;
        });

        if (match) {
            waitingUsers = waitingUsers.filter(user => user.id !== match.id);
            
            socket.partner = match;
            match.partner = socket;

            const roomId = `room_${socket.id}_${match.id}`;
            socket.join(roomId);
            match.join(roomId);
            socket.currentRoom = roomId;
            match.currentRoom = roomId;

            socket.emit('match_found', { name: match.profileName, age: match.profileAge, pic: match.profilePic, gender: match.myGender });
            match.emit('match_found', { name: socket.profileName, age: socket.profileAge, pic: socket.profilePic, gender: socket.myGender });
        } else {
            waitingUsers.push(socket);

            socket.botTimeout = setTimeout(() => {
                if (waitingUsers.includes(socket) && !socket.partner) {
                    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
                    socket.isBotConnected = true;
                    
                    const letter = socket.botName.charAt(0);
                    const dynamicPic = `https://ui-avatars.com/api/?name=${letter}&background=db2777&color=fff&rounded=true&bold=true&size=128`;

                    socket.emit('match_found', {
                        name: socket.botName,
                        age: socket.botAge,
                        pic: dynamicPic,
                        gender: 'female' 
                    });
                }
            }, 3000); 
        }
    });

    socket.on('send_message', (msg) => {
        if (socket.partner) {
            io.to(socket.currentRoom).emit('receive_message', msg);
        } else if (socket.isBotConnected) {
            if (socket.isProcessing) return;
            socket.isProcessing = true;

            setTimeout(() => {
                if (socket.isBotConnected) socket.emit('partner_typing', true);
            }, 500);
            
            setTimeout(() => {
                if (socket.isBotConnected) {
                    sendAiMessage(socket, msg).finally(() => {
                        socket.emit('partner_typing', false);
                        socket.isProcessing = false; 
                    });
                } else {
                    socket.isProcessing = false;
                }
            }, 6000); 
        }
    });

    socket.on('typing', (isTyping) => {
        if (socket.partner) socket.partner.emit('partner_typing', isTyping);
    });

    socket.on('leave_chat', () => {
        clearTimeout(socket.botTimeout);
        waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
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

    const userLower = userText.toLowerCase();
    
    const asksForSocials = 
        userLower.includes("insta") || 
        userLower.includes("instagram") || 
        userLower.includes("snap") || 
        userLower.includes("snapchat") || 
        userLower.includes("tele ") ||
        userLower.includes("telegram") ||
        (userLower.includes(" id") && !userLower.includes("adult")) || 
        userLower.includes("number") || 
        userLower.includes("phone") ||
        userLower.includes("mobile") ||
        userLower.includes("whatsapp");

    if (asksForSocials) {
        const randomExcuse = instaExcuses[Math.floor(Math.random() * instaExcuses.length)];
        
        socket.chatHistory.push({ role: 'user', content: userText });
        socket.chatHistory.push({ role: 'assistant', content: randomExcuse });
        
        socket.emit('receive_message', randomExcuse);
        return;
    }

    const timeContext = getCurrentTimeContext();

    // 🌐 AI-BASED LIVE DYNAMIC LEAVE ENGINE (INTERNET/LLM POWERED)
    if (socket.chatHistory.length >= 8) {
        try {
            const exitCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a real 21-year-old Indian girl named "${socket.botName}". You must immediately generate a highly realistic, extremely natural, short WhatsApp-style Hindi/Hinglish message making an urgent excuse to suddenly leave the chat right now. 
                        
                        CRITICAL RULE: The excuse MUST perfectly match the current time of day which is: "${timeContext}". (For example: if morning, say college/coaching/mummy calling. If night, say papa came home/dinner/sleepy/net pack over).
                        
                        Respond ONLY with that one short sentence. Do not add quotes, do not add explanation, just give the dynamic text with common emojis.`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.9,
                max_tokens: 60
            });

            let dynamicLiveExcuse = exitCompletion.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
            if (!dynamicLiveExcuse) dynamicLiveExcuse = "Arey yaar mujhe jana hoga abhi thoda kaam aa gaya sudden. Bye tc! ❤️";

            socket.emit('receive_message', dynamicLiveExcuse);
        } catch (err) {
            console.error("Exit Generator Error:", err);
            socket.emit('receive_message', "Arey phone switch off hone wala hai 1% bacha hai, chalti hoon bye! 🔋");
        }
        
        setTimeout(() => {
            if (socket.isBotConnected) {
                socket.emit('partner_disconnected');
                socket.isBotConnected = false;
            }
        }, 3000);
        return;
    }

    const systemPrompt = `
    You are a real 21-year-old Indian girl named "${socket.botName}" from "${socket.botLocation}". 
    You are currently chatting with a random user on an anonymous text chat website.
    
    RULES YOU MUST FOLLOW:
    1. Reply ONLY in short, dynamic, natural Hindi or Hinglish (e.g., "Hey, kaise ho?", "Main badhiya, aap batao?", "Arey sahi me? Ekdam mast"). Do NOT use bookish, clean or robotic Hindi. Talk exactly like a typical Indian girl on WhatsApp or Instagram DMs. Use occasional emojis.
    2. Keep your answers short (1 or 2 sentences max). Do not explain too much or write long paragraphs.
    3. MATCH THE CONTEXT: Respond logically based on what they say. If they talk about adult movies, dirty talks, or something unexpected, respond naturally with mild attitude or shock like a normal girl (e.g., "Arey ye kya pooch rhe ho? 🙄", "Kuch bhi mtlb", "Nahi main nahi dekhti ye sab").
    4. NEVER say bye, chalti hu, or make leave excuses yourself. Just focus on having a normal conversation.
    `;

    try {
        socket.chatHistory.push({ role: 'user', content: userText });

        if (socket.chatHistory.length > 12) {
            socket.chatHistory = socket.chatHistory.slice(-6);
        }

        const messages = [
            { role: "system", content: systemPrompt },
            ...socket.chatHistory
        ];

        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: "llama-3.3-70b-versatile",
            temperature: 0.8,
            max_tokens: 80,
            top_p: 1
        });

        let aiReply = chatCompletion.choices[0].message.content.trim();
        
        if (!aiReply) {
            aiReply = "Aur batao, kya chal raha?";
        }

        socket.chatHistory.push({ role: 'assistant', content: aiReply });
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
        console.error("Groq Engine Error (Sequential Fallback Active):", error);
        
        const currentIdx = socket.fallbackIndex % fallbackMessages.length;
        const randomFallback = fallbackMessages[currentIdx];
        
        socket.fallbackIndex += 1;
        socket.emit('receive_message', randomFallback);
    }
}

function disconnectPartner(socket) {
    if (socket.partner) {
        socket.partner.emit('partner_disconnected');
        
        if(socket.currentRoom) {
            socket.partner.leave(socket.currentRoom);
            socket.leave(socket.currentRoom);
        }
        
        socket.partner.partner = null;
        socket.partner.currentRoom = null;
        socket.partner = null;
        socket.currentRoom = null;
    }
    if (socket.isBotConnected) {
        socket.isBotConnected = false;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});