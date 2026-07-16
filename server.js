express = require('express');

const http = require('http');

const { Server } = require('socket.io');

const { Groq } = require('groq-sdk'); // ⚡ Imported official Groq SDK



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



// 🔥 RANDOM CHAT EXIT EXCUSES (Har baar bilkul random aur alag bahana aayega)

const leaveExcuses = [

    "Arey yaar, phone ki battery 2% hi bachi hai, switch off hone wala hai. Chalti hoon, bye! 🔋",

    "Suno, mujhe abhi coaching/college ke liye nikalna hai, late ho rahi hoon. Bye tc! 🏃‍♀️",

    "Didi kabse bula rahi hai kitchen me help ke liye, jana padega abhi. Bye tab tak! 👋",

    "Mera daily net pack 100% khatam ho gaya, lagta hai abhi band ho jayega chat. Bye tc. 😭",

    "Papa aagye hain office se, unke samne phone use nahi kar sakti. Chalti hoon, bye!",

    "Mujhe thoda college ka assignment complete karna hai, kal submit karna hai. Bye bye! 📚",

    "Bohot neend aa rahi hai abhi mujhe, thoda so jati hoon. Baad me baat karte hain, bye! 😴",

    "Arey yaar dost ka call aa raha hai kabse waiting me, attend karna padega. Bye tc! 💕",

    "Market jana hai abhi mummy ke sath, shopping ke liye. Chalo bye, phir milte hain! 🛍️"

];



// Sequential fallback system (API error ke case me automatic badal-badal kar reply jayenge)

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

        socket.isProcessing = false; // Prevents double messages

        socket.fallbackIndex = 0; // Tracks response chain in case of API failures



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

                   

                    // 👩 Custom avatar: Beautiful custom pink-theme avatar with initial

                    const letter = socket.botName.charAt(0);

                    const dynamicPic = `https://ui-avatars.com/api/?name=${letter}&background=db2777&color=fff&rounded=true&bold=true&size=128`;



                    socket.emit('match_found', {

                        name: socket.botName,

                        age: socket.botAge,

                        pic: dynamicPic,

                        gender: 'female' // Forces frontend to parse female styles

                    });

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



            // Show typing indicator after 500ms for responsiveness

            setTimeout(() => {

                if (socket.isBotConnected) socket.emit('partner_typing', true);

            }, 500);

           

            // ⏱️ Perfect 6 seconds total delay before sending reply

            setTimeout(() => {

                if (socket.isBotConnected) {

                    sendAiMessage(socket, msg).finally(() => {

                        socket.emit('partner_typing', false);

                        socket.isProcessing = false; // Release lock

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

   

    // 🛠️ FIX: Strict match check taaki "video" ya kisi normal baaki baaton par id excuses open na hon

    const asksForSocials =

        userLower.includes("insta") ||

        userLower.includes("instagram") ||

        userLower.includes("snap") ||

        userLower.includes("snapchat") ||

        userLower.includes("tele ") ||

        userLower.includes("telegram") ||

        (userLower.includes(" id") && !userLower.includes("adult")) || // "give id" check

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



    // 🚪 AUTOMATIC RANDOM LEAVE TRIGGERS (7 se 9 messages ke beech me automatic leave logic chalega)

    if (socket.chatHistory.length >= 8) {

        const finalExcuse = leaveExcuses[Math.floor(Math.random() * leaveExcuses.length)];

        socket.emit('receive_message', finalExcuse);

       

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



        // ⚡ Groq Cloud Client Call (Ultra-fast but chained behind the 6s UI buffer)

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



        // Backup safeguard check

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

