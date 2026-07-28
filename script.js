const GOOGLE_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxH_D_ifKnXfDQJvWCGOBUKgm8FD8WniwIg8470d2UXR3WmBEUuUiBp0M3mwiK8zRQcTA/exec";

// ================= CLOUDINARY CONFIGURATION =================
// अपने Cloudinary Dashboard से प्राप्त Cloud Name और Unsigned Upload Preset यहाँ बदलें
const CLOUDINARY_CLOUD_NAME = "ut7h5mjh";
const CLOUDINARY_UPLOAD_PRESET = "calcu_app_preset";

// Elo Rating Status Helper
function getPlayerStatus(rating) {
    if (rating >= 1000) return "Grandmaster";
    if (rating >= 650)  return "Master";
    if (rating >= 500)  return "Elite Heroic";
    if (rating >= 400)  return "Heroic";
    if (rating >= 325)  return "Platinum";
    if (rating >= 275)  return "Dimand";
    if (rating >= 225)  return "Gold";
    if (rating >= 140)  return "Silver";
    return "Learner";
}

// Tier key used purely for QUESTION GENERATION difficulty rules (Elo Rating based).
function getEloQuestionTier(rating) {
    if (rating >= 400) return "heroic";   // Heroic / Grandmaster (400+ to 1000+)
    if (rating >= 275) return "diamond";
    if (rating >= 225) return "gold";
    if (rating >= 140) return "silver";
    return "learner";
}

// ---- Random helpers ----
function randInt(min, max) { // inclusive
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function unitDigit(n) { return Math.abs(n) % 10; }

let categoryDifficulty = JSON.parse(localStorage.getItem('categoryDifficulty')) || {
    "Addition (1 Digit)": 2, "Addition": 2, "Addition (2 Digit)": 2, "Addition (3 Digit)": 2,
    "Subtraction (1 Digit)": 2, "Subtraction": 2, "Subtraction (2 Digit)": 2, "Subtraction (3 Digit)": 2,
    "Multiplication (1 Digit)": 2, "Multiplication": 2, "Multiplication (2 Digit)": 2,
    "Division": 2, "Division (Perfect)": 2,
    "Square Root (1-20)": 2, "Square Root (21-100)": 2,
    "Cube Root (1-10)": 2, "Cube Root (11-50)": 2,
    "Fractions": 2, "Percentage": 2, "Decimals": 2, "BODMAS Rules": 2
};

let studentRating = parseFloat(localStorage.getItem('auth_rating')) || 120;
let currentStreak = 0;        
let wasLastWrong = false;     

let studentName = localStorage.getItem('auth_name') || "";
let playerId = localStorage.getItem('auth_userid') || "";

// ---- Daily Practice Solved Count (resets automatically every midnight 00:00) ----
function getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function initTodayCount() {
    const savedDate = localStorage.getItem('lastDate');
    const todayStr = getTodayDateString();
    let savedCount = parseInt(localStorage.getItem('todayCount'), 10);
    if (savedDate !== todayStr || isNaN(savedCount)) {
        savedCount = 0;
        localStorage.setItem('lastDate', todayStr);
        localStorage.setItem('todayCount', "0");
    }
    return savedCount;
}

let todaySolvedCount = initTodayCount();

setInterval(() => {
    const todayStr = getTodayDateString();
    if (localStorage.getItem('lastDate') !== todayStr) {
        todaySolvedCount = 0;
        localStorage.setItem('lastDate', todayStr);
        localStorage.setItem('todayCount', "0");
    }
}, 30000);

function incrementTodaySolvedCount() {
    const todayStr = getTodayDateString();
    if (localStorage.getItem('lastDate') !== todayStr) {
        todaySolvedCount = 0;
        localStorage.setItem('lastDate', todayStr);
    }
    todaySolvedCount++;
    localStorage.setItem('todayCount', String(todaySolvedCount));
    localStorage.setItem('lastDate', todayStr);
}

const categories = [
    { id: "dd_add", name: "Addition (2 Digit)", desc: "Double digit + double digit addition", defaultCount: 5 },
    { id: "tt_add", name: "Addition (3 Digit)", desc: "Triple digit + triple digit addition", defaultCount: 0 },
    { id: "mix_add", name: "Mix Addition", desc: "Random 3 to 5 double/triple numbers", defaultCount: 0 },
    { id: "num_sum", name: "Number Sum", desc: "Sum up all single digits of a generated number", defaultCount: 0 },
    { id: "ds_mult", name: "Tables (11-30)", desc: "Multiplications of factors from 11 to 30", defaultCount: 0 },
    { id: "dd_mult", name: "Multiplication (2 Digit)", desc: "Double digit × Double digit multiplication", defaultCount: 0 },
    { id: "ts_mult", name: "T × S", desc: "Triple digit × Single digit multiplication", defaultCount: 0 },
    { id: "square", name: "Square", desc: "Find square of numbers between 11 to 99", defaultCount: 0 },
    { id: "square_root", name: "Square Root (21-100)", desc: "Find the square root of perfect squares between 21 to 100", defaultCount: 0 },
    { id: "cube_root", name: "Cube Root (11-50)", desc: "Find the cube root of perfect cubes between 11 to 50", defaultCount: 0 },
    { id: "lcm", name: "LCM", desc: "Least Common Multiple of two integers", defaultCount: 0 },
    { id: "hcf", name: "HCF", desc: "Highest Common Factor of two integers", defaultCount: 0 },
    { id: "percentage", name: "Percentage", desc: "Percent value calculations (e.g., 20% of 150)", defaultCount: 0 },
    { id: "decimal", name: "Decimal Arithmetic", desc: "Addition / subtraction with decimals", defaultCount: 0 },
    { id: "bodmas", name: "BODMAS Rules", desc: "Evaluate basic parenthetical equations", defaultCount: 0 }
];

let appSettings = {
    categoryTimes: {},     
    countdownEnabled: {},  
    globalTimer: true     
};

let selectedCounts = {};    
let activeTestState = {
    questions: [],
    currentIndex: 0,
    correctCount: 0,
    scoresBreakdown: {}, 
    currentQuestionTimer: null,
    timeSpentSec: 0,
    secondsUsed: 0,
    activeListening: false,
    recognitionEngine: null,
    isProcessingAnswer: false
};

const defaultMarkdown = `# Calculation Scores History\n\n| Date & Time | Total Questions | Score | Accuracy | Breakdown |\n|---|---|---|---|---|\n`;

window.onload = function() {
    initSettings();
    resetCustomization();
    renderCustomizationControls();
    renderSettingsPage();
    initSpeechEngine();
    loadScoresHistory();

    let savedUser = localStorage.getItem('auth_userid');
    let savedName = localStorage.getItem('auth_name');
    let savedRating = localStorage.getItem('auth_rating');

    if (savedUser && savedName) {
        playerId = savedUser;
        studentName = savedName;
        studentRating = savedRating ? parseFloat(savedRating) : 120;
        
        document.getElementById('view-auth').classList.add('hidden');
        document.getElementById('main-app-content').classList.remove('hidden');
        
        if (playerId.toLowerCase() === "shivam@123") {
            document.getElementById('nav-btn-admin').classList.remove('hidden');
            document.getElementById('nav-btn-admin').classList.add('flex');
        } else {
            document.getElementById('nav-btn-admin').classList.add('hidden');
        }

        document.getElementById('home-rating-display').innerText = studentRating;
        document.getElementById('setting-display-id').innerText = playerId;
        document.getElementById('setting-display-name').innerText = studentName;
        
        loadSavedProfileImage();
        loadTop3Podium();
    } else {
        document.getElementById('view-auth').classList.remove('hidden');
        document.getElementById('main-app-content').classList.add('hidden');
        toggleAuthMode(true); 
    }
};

function callCloudAPI(payload) {
    return fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        body: JSON.stringify(payload)
    }).then(res => res.json());
}

function toggleAuthMode(toSignup) {
    if (toSignup) {
        document.getElementById('auth-title').innerText = "Create Account 🚀";
        document.getElementById('auth-subtitle').innerText = "कैलकुलेशन प्रतियोगिता में शामिल होने के लिए साइन-अप करें।";
        document.getElementById('form-signup').classList.remove('hidden');
        document.getElementById('form-login').classList.add('hidden');
    } else {
        document.getElementById('auth-title').innerText = "Welcome Back 🔑";
        document.getElementById('auth-subtitle').innerText = "आगे खेलने के लिए अपने क्रेडेंशियल्स से लॉग-इन करें।";
        document.getElementById('form-signup').classList.add('hidden');
        document.getElementById('form-login').classList.remove('hidden');
    }
}

function handleSignupSubmit() {
    const name = document.getElementById('reg-name').value.trim();
    const sClass = document.getElementById('reg-class').value.trim();
    const age = document.getElementById('reg-age').value.trim();
    const uId = document.getElementById('reg-userid').value.trim().toLowerCase();
    const pass = document.getElementById('reg-password').value.trim();

    if (!name || !sClass || !age || !uId || !pass) {
        showToast("⚠️", "कृपया सभी बॉक्स भरें!"); 
        return;
    }

    showToast("⏳", "Registering account into cloud...");
    
    callCloudAPI({ 
        action: "signup", 
        name: name, 
        studentClass: sClass, 
        age: age, 
        userId: uId, 
        password: pass 
    })
    .then(resData => {
        if (resData.status === "success") {
            localStorage.setItem('auth_class', sClass);
            localStorage.setItem('auth_age', age);
            showToast("🎉", "Registration complete! Logging in...");
            executeAutoLogin(uId, pass);
        } else {
            showToast("❌", "User ID already taken!");
        }
    })
    .catch((err) => {
        console.error(err);
        showToast("❌", "Cloud network connection error.");
    });
}

function handleLoginSubmit() {
    const uId = document.getElementById('log-userid').value.trim().toLowerCase();
    const pass = document.getElementById('log-password').value.trim();
    
    if(!uId || !pass) {
        showToast("⚠️", "User ID और Password दर्ज करें!"); 
        return;
    }
    executeAutoLogin(uId, pass);
}

function executeAutoLogin(uId, pass) {
    showToast("⏳", "Authenticating credentials...");
    
    callCloudAPI({ action: "login", userId: uId, password: pass })
    .then(resData => {
        if(resData.status === "success") {
            localStorage.setItem('auth_userid', uId);
            localStorage.setItem('auth_name', resData.name);
            localStorage.setItem('auth_rating', resData.rating);
            
            if (resData.studentClass) localStorage.setItem('auth_class', resData.studentClass);
            if (resData.age) localStorage.setItem('auth_age', resData.age);
            if (resData.profilePicUrl) localStorage.setItem(`profile_img_${uId}`, resData.profilePicUrl);
            
            playerId = uId;
            studentName = resData.name;
            studentRating = resData.rating;

            const todayStr = getTodayDateString();
            if (resData.lastDate === todayStr && !isNaN(parseInt(resData.todayCount, 10))) {
                todaySolvedCount = parseInt(resData.todayCount, 10);
            } else {
                todaySolvedCount = 0;
            }
            localStorage.setItem('todayCount', String(todaySolvedCount));
            localStorage.setItem('lastDate', todayStr);

            document.getElementById('view-auth').classList.add('hidden');
            document.getElementById('main-app-content').classList.remove('hidden');
            document.getElementById('home-rating-display').innerText = studentRating;
            document.getElementById('setting-display-id').innerText = playerId;
            document.getElementById('setting-display-name').innerText = studentName;
            
            loadSavedProfileImage();
            loadTop3Podium();
            resetCustomization();
            showToast("🔓", "Login successful.");
            navigateTo('home');
        } else {
            showToast("❌", "Invalid User ID or Password!");
        }
    })
    .catch((err) => {
        console.error(err);
        showToast("❌", "Authentication request failed.");
    });
}

function handleLogout() {
    if(confirm("क्या आप सचमुच लॉग आउट करना चाहते हैं?")) {
        localStorage.clear();
        location.reload();
    }
}

function showToast(icon, text) {
    const toast = document.getElementById('app-toast');
    document.getElementById('toast-icon').innerText = icon;
    document.getElementById('toast-message').innerText = text;
    
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
    
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

function navigateTo(viewId) {
    const views = ['home', 'customize', 'overview', 'test', 'report', 'settings', 'scores', 'leaderboard', 'profile', 'admin'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if(el) el.classList.add('hidden');
    });

    const currentView = document.getElementById(`view-${viewId}`);
    if(currentView) currentView.classList.remove('hidden');

    if (viewId !== 'test') {
        stopSpeechRecognition();
        if(activeTestState.currentQuestionTimer) clearInterval(activeTestState.currentQuestionTimer);
    }

    if (viewId === 'home') loadTop3Podium();
    if (viewId === 'scores') loadScoresHistory();
    if (viewId === 'leaderboard') renderLeaderboard();
    if (viewId === 'profile') {
        document.getElementById('profile-card-name').innerText = studentName;
        document.getElementById('profile-display-id').innerText = playerId;
        document.getElementById('profile-display-rating').innerText = studentRating;
        document.getElementById('profile-display-class').innerText = localStorage.getItem('auth_class') || "Not Set";
        document.getElementById('profile-display-age').innerText = localStorage.getItem('auth_age') || "Not Set";
        document.getElementById('profile-card-status').innerText = getPlayerStatus(studentRating);
        loadSavedProfileImage();
    }
}

function triggerProfileUpload() {
    document.getElementById('profile-file-input').click();
}

// Cloudinary Direct Unsigned Upload + Auto Sync to Google Sheets
function handleProfileImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5000000) {
        showToast("⚠️", "Image बहुत बड़ी है! (Max 5MB allowed)");
        return;
    }

    showToast("⏳", "Cloudinary पर फोटो अपलोड हो रही है...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData
    })
    .then(res => res.json())
    .then(cloudinaryRes => {
        if (cloudinaryRes.secure_url) {
            const uploadedUrl = cloudinaryRes.secure_url;

            localStorage.setItem(`profile_img_${playerId}`, uploadedUrl);
            loadSavedProfileImage();

            showToast("⏳", "गूगल शीट में सेव हो रही है...");
            return callCloudAPI({
                action: "updateProfilePic",
                userId: playerId,
                imageUrl: uploadedUrl
            });
        } else {
            throw new Error("Cloudinary upload failed");
        }
    })
    .then(() => {
        showToast("📸", "प्रोफाइल फोटो सफलतापूर्वक सेव हो गई!");
        loadTop3Podium();
    })
    .catch(err => {
        console.error("Upload Error:", err);
        showToast("❌", "फोटो अपलोड या सेव करने में त्रुटि!");
    });
}

function loadSavedProfileImage() {
    const imgData = localStorage.getItem(`profile_img_${playerId}`);
    const container = document.getElementById('profile-image-container');
    const bottomNavContainer = document.getElementById('bottom-nav-avatar-container');

    if (imgData) {
        if (container) {
            container.innerHTML = `<img src="${imgData}" class="w-full h-full object-cover rounded-full" />`;
        }
        if (bottomNavContainer) {
            bottomNavContainer.innerHTML = `<img src="${imgData}" class="w-full h-full object-cover rounded-full border border-indigo-400/50" />`;
        }
    } else {
        if (container) {
            container.innerHTML = `
                <svg class="w-12 h-12 text-indigo-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
            `;
        }
        if (bottomNavContainer) {
            bottomNavContainer.innerHTML = `
                <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                </svg>
            `;
        }
    }
}

// Home Page Top-3 Podium Fetch & Render Function
function loadTop3Podium() {
    callCloudAPI({ action: "fetch" })
    .then(players => {
        if (!players || players.length === 0) return;

        players.sort((a, b) => b.rating - a.rating);

        const ranks = [
            { pos: '1st', player: players[0] },
            { pos: '2nd', player: players[1] },
            { pos: '3rd', player: players[2] }
        ];

        ranks.forEach(r => {
            const imgEl = document.getElementById(`top-${r.pos}-img`);
            const fallbackEl = document.getElementById(`top-${r.pos}-fallback`);
            const nameEl = document.getElementById(`top-${r.pos}-name`);

            if (r.player) {
                if (nameEl) nameEl.textContent = r.player.name;

                const photoUrl = r.player.profilePicUrl || localStorage.getItem(`profile_img_${r.player.id}`);

                if (photoUrl && imgEl) {
                    imgEl.src = photoUrl;
                    imgEl.classList.remove('hidden');
                    if (fallbackEl) fallbackEl.classList.add('hidden');
                }
            }
        });
    })
    .catch(err => console.error("Podium Fetch Error:", err));
}

function initSettings() {
    categories.forEach(cat => {
        appSettings.categoryTimes[cat.name] = 15; 
        appSettings.countdownEnabled[cat.name] = true;
    });

    const savedSettings = localStorage.getItem('calcu_voice_settings');
    if (savedSettings) {
        appSettings = JSON.parse(savedSettings);
    }
}

function uploadRatingToCloud() {
    fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            action: "update",
            id: playerId,       
            name: studentName,   
            rating: studentRating,
            todayCount: todaySolvedCount,
            lastDate: getTodayDateString(),
            profilePicUrl: localStorage.getItem(`profile_img_${playerId}`) || ""
        })
    }).catch(err => console.log("Cloud update error:", err));
    localStorage.setItem('auth_rating', studentRating);
}

function resetCustomization() {
    categories.forEach(cat => {
        selectedCounts[cat.name] = cat.defaultCount;
    });
    renderCustomizationControls();
}

function presetQuickStart() {
    categories.forEach(cat => {
        selectedCounts[cat.name] = 5;
    });
    renderCustomizationControls();
    showToast("🎮", "All categories set to 5 questions!");
}

function renderCustomizationControls() {
    const grid = document.getElementById('customization-grid');
    grid.innerHTML = '';

    categories.forEach(cat => {
        const count = selectedCounts[cat.name] || 0;
        const card = document.createElement('div');
        card.className = "p-4 bg-slate-900/30 border border-slate-800/80 rounded-2xl flex items-center justify-between transition hover:border-slate-700/80";
        card.innerHTML = `
            <div class="space-y-1">
                <h3 class="text-sm font-extrabold text-slate-100">${cat.name}</h3>
                <p class="text-[11px] text-slate-400 leading-tight">${cat.desc}</p>
            </div>
            <div class="flex items-center space-x-3 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <button onclick="decrementCount('${cat.name}')" class="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition">-</button>
                <span class="w-6 text-center font-bold text-xs text-indigo-400 font-mono" id="count-display-${cat.id}">${count}</span>
                <button onclick="incrementCount('${cat.name}')" class="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition">+</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function incrementCount(catName) {
    if (selectedCounts[catName] < 50) {
        selectedCounts[catName]++;
        updateCardDisplay(catName);
    }
}

function decrementCount(catName) {
    if (selectedCounts[catName] > 0) {
        selectedCounts[catName]--;
        updateCardDisplay(catName);
    }
}

function updateCardDisplay(catName) {
    const cat = categories.find(c => c.name === catName);
    if (cat) {
        const element = document.getElementById(`count-display-${cat.id}`);
        if (element) {
            element.innerText = selectedCounts[catName];
        }
    }
}

function proceedToOverview() {
    let totalSelected = 0;
    categories.forEach(cat => {
        totalSelected += selectedCounts[cat.name] || 0;
    });

    if (totalSelected === 0) {
        showToast("⚠️", "Please select at least 1 question to start the test.");
        return;
    }

    const listContainer = document.getElementById('overview-items-list');
    listContainer.innerHTML = '';
    
    let calculatedTotalTime = 0;

    categories.forEach(cat => {
        const count = selectedCounts[cat.name] || 0;
        if (count > 0) {
            const timePerQ = appSettings.categoryTimes[cat.name] || 15;
            const catTime = appSettings.countdownEnabled[cat.name] && appSettings.globalTimer ? (timePerQ * count) : 0;
            calculatedTotalTime += catTime;

            const row = document.createElement('div');
            row.className = "py-3 flex justify-between text-xs text-slate-300";
            row.innerHTML = `
                <span>${cat.name} <span class="text-slate-500">(${count} questions)</span></span>
                <span class="font-semibold text-slate-400">${catTime > 0 ? catTime + 's limit' : 'Unlimited'}</span>
            `;
            listContainer.appendChild(row);
        }
    });

    document.getElementById('overview-total-count').innerText = `${totalSelected} Questions`;
    document.getElementById('overview-total-duration').innerText = calculatedTotalTime > 0 ? `${calculatedTotalTime} Seconds` : 'No limits applied';

    navigateTo('overview');
}

function renderSettingsPage() {
    const list = document.getElementById('settings-categories-list');
    list.innerHTML = '';

    document.getElementById('global-timer-toggle').checked = appSettings.globalTimer;

    categories.forEach(cat => {
        const time = appSettings.categoryTimes[cat.name] || 15;
        const active = appSettings.countdownEnabled[cat.name];

        const row = document.createElement('div');
        row.className = "py-4 flex flex-col md:flex-row md:items-center justify-between gap-4";
        row.innerHTML = `
            <div>
                <h4 class="text-xs font-bold text-slate-200">${cat.name} Timer</h4>
                <p class="text-[10px] text-slate-500">${cat.desc}</p>
            </div>
            <div class="flex items-center space-x-4">
                <div class="flex items-center space-x-2">
                    <span class="text-[10px] text-slate-400">Time per Q:</span>
                    <input type="number" id="setting-time-${cat.id}" value="${time}" min="5" max="120" class="w-16 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-center text-xs text-indigo-400 font-mono">
                    <span class="text-[10px] text-slate-400">sec</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="setting-active-${cat.id}" class="sr-only peer" ${active ? 'checked' : ''}>
                    <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
            </div>
        `;
        list.appendChild(row);
    });
}

function toggleGlobalTimerSetting() {
    appSettings.globalTimer = document.getElementById('global-timer-toggle').checked;
}

function saveAllSettings() {
    categories.forEach(cat => {
        const timeInput = document.getElementById(`setting-time-${cat.id}`);
        const activeInput = document.getElementById(`setting-active-${cat.id}`);

        if (timeInput) {
            appSettings.categoryTimes[cat.name] = parseInt(timeInput.value) || 15;
        }
        if (activeInput) {
            appSettings.countdownEnabled[cat.name] = activeInput.checked;
        }
    });

    localStorage.setItem('calcu_voice_settings', JSON.stringify(appSettings));
    showToast("⚙️", "Settings updated successfully!");
    navigateTo('home');
}

function resetAIDifficulty() {
    if (confirm("क्या आप सभी कैटेगोरीज के AI डिफिकल्टी लेवल को रीसेट करके फिर से मीडियम (Level 2) करना चाहते हैं?")) {
        categoryDifficulty = {
            "Addition (1 Digit)": 2, "Addition": 2, "Addition (2 Digit)": 2, "Addition (3 Digit)": 2,
            "Subtraction (1 Digit)": 2, "Subtraction": 2, "Subtraction (2 Digit)": 2, "Subtraction (3 Digit)": 2,
            "Multiplication (1 Digit)": 2, "Multiplication": 2, "Multiplication (2 Digit)": 2,
            "Division": 2, "Division (Perfect)": 2,
            "Square Root (1-20)": 2, "Square Root (21-100)": 2,
            "Cube Root (1-10)": 2, "Cube Root (11-50)": 2,
            "Fractions": 2, "Percentage": 2, "Decimals": 2, "BODMAS Rules": 2
        };
        localStorage.setItem('categoryDifficulty', JSON.stringify(categoryDifficulty));
        studentRating = 120; 
        localStorage.setItem('auth_rating', studentRating);
        uploadRatingToCloud();
        showToast("🔄", "AI डिफिकल्टी और रेटिंग को रीसेट कर दिया गया है!");
        document.getElementById('home-rating-display').innerText = studentRating;
        navigateTo('home');
    }
}

function getGCD(a, b) {
    while (b) {
        let t = b;
        b = a % b;
        a = t;
    }
    return a;
}

function getLCM(a, b) {
    return (a * b) / getGCD(a, b);
}

const EASY_SQUEEZE_CATEGORIES = [
    "Addition (1 Digit)", "Addition", "Addition (2 Digit)",
    "Subtraction (1 Digit)", "Subtraction", "Subtraction (2 Digit)"
];

function isSqueezeEligible(currentRating, categoryName) {
    return currentRating > 500 && EASY_SQUEEZE_CATEGORIES.includes(categoryName);
}

function calculateNewRating(currentRating, isCorrect, questionLevel, isTimerActive, secondsUsed, maxDuration, streak, lastWrong, squeezeApplies) {
    let questionRating = 100 + (questionLevel * 30);
    let K = 2.0;
    
    if (isTimerActive && maxDuration > 0) {
        if (isCorrect) {
            let speedBonus = 1 + ((maxDuration - secondsUsed) / maxDuration) * 0.3;
            K = K * speedBonus;
        } else {
            let speedPenalty = 1 + ((maxDuration - secondsUsed) / maxDuration) * 0.2;
            K = K * speedPenalty;
        }
    }
    
    if (isCorrect && streak >= 3) K = K + 0.3; 
    if (isCorrect && lastWrong) K = K + 0.2;
    
    let expectedScore = 1 / (1 + Math.pow(10, (questionRating - currentRating) / 400));
    let actualScore = isCorrect ? 1 : 0;
    
    let change = K * (actualScore - expectedScore);
    if (change > 5.0) change = 5.0;
    if (change < -5.0) change = -5.0;

    if (squeezeApplies && isCorrect && change > 0.1) {
        change = 0.1;
    }
    
    let newRating = currentRating + change;
    return parseFloat(newRating.toFixed(1));
}

function generateTieredAddition(tier) {
    let num1, num2;
    if (tier === "diamond") {
        do {
            num1 = randInt(61, 99);
            num2 = randInt(61, 99);
        } while ((unitDigit(num1) + unitDigit(num2)) < 10);
    } else if (tier === "gold") {
        do {
            num1 = randInt(51, 99);
            num2 = randInt(51, 99);
        } while (unitDigit(num1) === 0 || unitDigit(num2) === 0);
    } else { 
        num1 = randInt(51, 99);
        num2 = randInt(51, 99);
    }
    return { questionText: `${num1} + ${num2}`, correctAnswer: num1 + num2 };
}

function generateTieredHCF(tier) {
    let min, forbiddenMax;
    if (tier === "diamond") { min = 71; forbiddenMax = 20; }      
    else if (tier === "gold") { min = 51; forbiddenMax = 10; }    
    else { min = 51; forbiddenMax = 1; }                          

    let a, b, gcd;
    let attempts = 0;
    do {
        a = randInt(min, min + 80);
        b = randInt(min, min + 80);
        gcd = getGCD(a, b);
        attempts++;
    } while (gcd >= 1 && gcd <= forbiddenMax && attempts < 200);

    return { questionText: `HCF of (${a}, ${b})`, correctAnswer: gcd };
}

function generateTieredSquare(tier) {
    let base;
    if (tier === "heroic") {
        base = 100 + (randInt(0, 2) * 10) + 5; 
    } else if (tier === "diamond") {
        do {
            base = randInt(30, 80);
        } while (unitDigit(base) === 0 || unitDigit(base) === 5);
    } else if (tier === "gold") {
        do {
            base = randInt(30, 80);
        } while (unitDigit(base) === 0);
    } else {
        base = randInt(30, 60);
    }
    return { questionText: `${base}²`, correctAnswer: base * base };
}

function generateTieredCubeRoot(tier) {
    let min, max;
    if (tier === "diamond" || tier === "heroic") { min = 20; max = 50; }
    else { min = 1; max = 30; } 
    const base = randInt(min, max);
    return { questionText: `∛${base * base * base}`, correctAnswer: base };
}

function generateTieredPercentage(tier) {
    let pct, finalNum;
    if (tier === "gold" || tier === "diamond" || tier === "heroic") {
        pct = randInt(0, 9) * 10 + 2.5;
        finalNum = randInt(2, 40) * 20;
    } else {
        pct = randInt(1, 9) * 10;
        finalNum = randInt(2, 40) * 10;
    }
    const correctAnswer = parseFloat(((pct / 100) * finalNum).toFixed(2));
    return { questionText: `${pct}% of ${finalNum}`, correctAnswer };
}

function getDivisors(n) {
    n = Math.abs(Math.round(n));
    const divs = [];
    for (let d = 2; d <= n; d++) {
        if (n % d === 0) divs.push(d);
    }
    return divs;
}

function generateTieredBODMAS(tier) {
    let termCount, digitMin, digitMax;
    if (tier === "gold" || tier === "diamond" || tier === "heroic") {
        termCount = 4; digitMin = 10; digitMax = 999; 
    } else if (tier === "silver") {
        termCount = 3; digitMin = 10; digitMax = 99; 
    } else {
        termCount = 3; digitMin = 1; digitMax = 9;
    }

    const ops = ['+', '-', '×', '÷'];
    let expressionParts = [];

    let firstTerm = randInt(digitMin, digitMax);
    expressionParts.push(String(firstTerm));
    let chainValue = firstTerm; 

    for (let i = 1; i < termCount; i++) {
        let op = ops[randInt(0, ops.length - 1)];
        let nextTerm;

        if (op === '÷') {
            const divisors = getDivisors(chainValue).filter(d => d <= 12);
            if (divisors.length === 0) {
                op = '+'; 
                nextTerm = randInt(digitMin, digitMax);
                chainValue = nextTerm;
            } else {
                nextTerm = divisors[randInt(0, divisors.length - 1)];
                chainValue = chainValue / nextTerm;
            }
        } else if (op === '×') {
            nextTerm = randInt(2, 12); 
            chainValue = chainValue * nextTerm;
        } else {
            nextTerm = randInt(digitMin, digitMax);
            chainValue = nextTerm; 
        }

        expressionParts.push(op, String(nextTerm));
    }

    const questionText = expressionParts.join(' ');
    const evalExpr = questionText.replace(/×/g, '*').replace(/÷/g, '/');
    let correctAnswer;
    try {
        correctAnswer = Function(`"use strict"; return (${evalExpr});`)();
        correctAnswer = parseFloat(correctAnswer.toFixed(2));
    } catch (e) {
        correctAnswer = 0;
    }
    return { questionText, correctAnswer };
}

function generateArithmeticExpression(categoryName) {
    let questionText = '';
    let correctAnswer = 0;
    const level = categoryDifficulty[categoryName] || 2;

    switch(categoryName) {
        case "Addition (1 Digit)": {
            let max = (level === 1) ? 4 : (level === 2) ? 7 : 9;
            const num1 = Math.floor(Math.random() * max) + 1;
            const num2 = Math.floor(Math.random() * max) + 1;
            questionText = `${num1} + ${num2}`;
            correctAnswer = num1 + num2;
            break;
        }
        case "Addition":
        case "Addition (2 Digit)": {
            const tier = getEloQuestionTier(studentRating);
            if (tier !== "learner") {
                const result = generateTieredAddition(tier);
                questionText = result.questionText;
                correctAnswer = result.correctAnswer;
            } else {
                let min1 = 10, max1 = 99, min2 = 10, max2 = 99;
                if (level === 1) { max1 = 40; max2 = 40; } 
                else if (level === 3) { min1 = 60; min2 = 60; } 
                const num1 = Math.floor(Math.random() * (max1 - min1 + 1)) + min1;
                const num2 = Math.floor(Math.random() * (max2 - min2 + 1)) + min2;
                questionText = `${num1} + ${num2}`;
                correctAnswer = num1 + num2;
            }
            break;
        }
        case "Addition (3 Digit)": {
            let min = 100, max = 999;
            if (level === 1) max = 400;
            else if (level === 3) min = 600;
            const num1 = Math.floor(Math.random() * (max - min + 1)) + min;
            const num2 = Math.floor(Math.random() * (max - min + 1)) + min;
            questionText = `${num1} + ${num2}`;
            correctAnswer = num1 + num2;
            break;
        }
        case "Mix Addition": {
            const termsCount = (level === 1) ? 3 : (level === 2) ? 4 : 5;
            const terms = [];
            for(let i=0; i<termsCount; i++) {
                terms.push(Math.floor(Math.random() * 90) + 10);
            }
            questionText = terms.join(" + ");
            correctAnswer = terms.reduce((acc, curr) => acc + curr, 0);
            break;
        }
        case "Number Sum": {
            const digitsCount = (level === 1) ? 5 : (level === 2) ? 7 : 9;
            let strNum = "";
            let sum = 0;
            for (let i = 0; i < digitsCount; i++) {
                const digit = Math.floor(Math.random() * 9) + 1;
                strNum += digit;
                sum += digit;
            }
            questionText = `Sum digits of: ${strNum}`;
            correctAnswer = sum;
            break;
        }
        case "Subtraction (1 Digit)": {
            const num1 = (level === 1) ? Math.floor(Math.random() * 5) + 5 : Math.floor(Math.random() * 6) + 4;
            const num2 = Math.floor(Math.random() * num1) + 1;
            questionText = `${num1} - ${num2}`;
            correctAnswer = num1 - num2;
            break;
        }
        case "Subtraction":
        case "Subtraction (2 Digit)": {
            let min = 10, max = 99;
            if (level === 1) max = 50; 
            else if (level === 3) min = 50;
            let num1 = Math.floor(Math.random() * (max - min + 1)) + min;
            let num2 = Math.floor(Math.random() * (num1 - min + 1)) + min;
            if (level === 1 && (num1 % 10) < (num2 % 10)) {
                let temp = num1; num1 = num2; num2 = temp; 
            }
            const maxNum = Math.max(num1, num2);
            const minNum = Math.min(num1, num2);
            questionText = `${maxNum} - ${minNum}`;
            correctAnswer = maxNum - minNum;
            break;
        }
        case "Subtraction (3 Digit)": {
            let min = 100, max = 999;
            if (level === 1) max = 500;
            else if (level === 3) min = 500;
            const num1 = Math.floor(Math.random() * (max - min + 1)) + min;
            const num2 = Math.floor(Math.random() * (num1 - min + 1)) + min;
            const maxNum = Math.max(num1, num2);
            const minNum = Math.min(num1, num2);
            questionText = `${maxNum} - ${minNum}`;
            correctAnswer = maxNum - minNum;
            break;
        }
        case "Multiplication (1 Digit)": {
            let max = (level === 1) ? 5 : 9;
            const num1 = Math.floor(Math.random() * max) + 1;
            const num2 = Math.floor(Math.random() * max) + 1;
            questionText = `${num1} × ${num2}`;
            correctAnswer = num1 * num2;
            break;
        }
        case "Tables (11-30)": {
            let n1_min = 11, n1_max = 30;
            let n2_max = (level === 1) ? 5 : (level === 2) ? 7 : 9;
            const num1 = Math.floor(Math.random() * (n1_max - n1_min + 1)) + n1_min;
            const num2 = Math.floor(Math.random() * (n2_max - 2 + 1)) + 2;
            questionText = `${num1} × ${num2}`;
            correctAnswer = num1 * num2;
            break;
        }
        case "Multiplication":
        case "Multiplication (2 Digit)": {
            let n1_min = 11, n1_max = 19, n2_min = 2, n2_max = 9; 
            if (level === 1) { n1_max = 12; n2_max = 5; } 
            else if (level === 3) { n1_min = 12; n1_max = 50; n2_min = 11; n2_max = 19; } 
            const num1 = Math.floor(Math.random() * (n1_max - n1_min + 1)) + n1_min;
            const num2 = Math.floor(Math.random() * (n2_max - n2_min + 1)) + n2_min;
            questionText = `${num1} × ${num2}`;
            correctAnswer = num1 * num2;
            break;
        }
        case "T × S": {
            let min = 100, max = 500;
            if (level === 3) max = 999;
            const num1 = Math.floor(Math.random() * (max - min + 1)) + min;
            const num2 = Math.floor(Math.random() * 8) + 2;
            questionText = `${num1} × ${num2}`;
            correctAnswer = num1 * num2;
            break;
        }
        case "Square": {
            const tier = getEloQuestionTier(studentRating);
            if (tier !== "learner") {
                const result = generateTieredSquare(tier);
                questionText = result.questionText;
                correctAnswer = result.correctAnswer;
            } else {
                let min = 11, max = 30;
                if (level === 2) max = 60;
                if (level === 3) max = 99;
                const a = Math.floor(Math.random() * (max - min + 1)) + min; 
                questionText = `${a}²`;
                correctAnswer = a * a;
            }
            break;
        }
        case "Division":
        case "Division (Perfect)": {
            let base_min = 2, base_max = 10, mult_min = 2, mult_max = 10;
            if (level === 1) { base_max = 5; mult_max = 5; }
            else if (level === 3) { base_min = 11; base_max = 20; mult_min = 5; mult_max = 12; }
            const divisor = Math.floor(Math.random() * (base_max - base_min + 1)) + base_min;
            const quotient = Math.floor(Math.random() * (mult_max - mult_min + 1)) + mult_min;
            const dividend = divisor * quotient;
            questionText = `${dividend} ÷ ${divisor}`;
            correctAnswer = quotient;
            break;
        }
        case "Square Root (1-20)": {
            let min = 1, max = 20;
            if (level === 1) max = 10;
            else if (level === 3) min = 11;
            const base = Math.floor(Math.random() * (max - min + 1)) + min;
            questionText = `√${base * base}`;
            correctAnswer = base;
            break;
        }
        case "Square Root (21-100)": {
            let min = 21, max = 100;
            if (level === 1) max = 50; 
            else if (level === 3) min = 70; 
            const base = Math.floor(Math.random() * (max - min + 1)) + min;
            questionText = `√${base * base}`;
            correctAnswer = base;
            break;
        }
        case "Cube Root (1-10)": {
            let min = 1, max = 10;
            if (level === 1) max = 5;
            else if (level === 3) min = 6;
            const base = Math.floor(Math.random() * (max - min + 1)) + min;
            questionText = `∛${base * base * base}`;
            correctAnswer = base;
            break;
        }
        case "Cube Root (11-50)": {
            const tier = getEloQuestionTier(studentRating);
            if (tier !== "learner") {
                const result = generateTieredCubeRoot(tier);
                questionText = result.questionText;
                correctAnswer = result.correctAnswer;
            } else {
                let min = 11, max = 50;
                if (level === 1) max = 25; 
                else if (level === 3) min = 35; 
                const base = Math.floor(Math.random() * (max - min + 1)) + min;
                questionText = `∛${base * base * base}`;
                correctAnswer = base;
            }
            break;
        }
        case "LCM": {
            let max = (level === 1) ? 10 : (level === 2) ? 16 : 25;
            const a = Math.floor(Math.random() * (max - 4 + 1)) + 4; 
            const b = Math.floor(Math.random() * (max - 4 + 1)) + 4; 
            questionText = `LCM of (${a}, ${b})`;
            correctAnswer = getLCM(a, b);
            break;
        }
        case "HCF": {
            const tier = getEloQuestionTier(studentRating);
            if (tier !== "learner") {
                const result = generateTieredHCF(tier);
                questionText = result.questionText;
                correctAnswer = result.correctAnswer;
            } else {
                let max = (level === 1) ? 40 : (level === 2) ? 80 : 120;
                const a = Math.floor(Math.random() * (max - 12 + 1)) + 12; 
                const b = Math.floor(Math.random() * (max - 12 + 1)) + 12; 
                questionText = `HCF of (${a}, ${b})`;
                correctAnswer = getGCD(a, b);
            }
            break;
        }
        case "Fractions": {
            if (level === 1) {
                const den = Math.floor(Math.random() * 4) + 2; 
                const num1 = Math.floor(Math.random() * 3) + 1;
                const num2 = Math.floor(Math.random() * 3) + 1;
                questionText = `${num1}/${den} + ${num2}/${den}`;
                correctAnswer = parseFloat(((num1 + num2) / den).toFixed(2));
            } else {
                const den1 = Math.floor(Math.random() * 4) + 2;
                const den2 = Math.floor(Math.random() * 4) + 2;
                const num1 = Math.floor(Math.random() * 3) + 1;
                const num2 = Math.floor(Math.random() * 3) + 1;
                questionText = `${num1}/${den1} + ${num2}/${den2}`;
                correctAnswer = parseFloat(((num1 / den1) + (num2 / den2)).toFixed(2));
            }
            break;
        }
        case "Percentage": {
            const tier = getEloQuestionTier(studentRating);
            if (tier !== "learner") {
                const result = generateTieredPercentage(tier);
                questionText = result.questionText;
                correctAnswer = result.correctAnswer;
            } else {
                let base = (level === 1) ? 100 : (level === 2) ? 50 : 25;
                let pct = (level === 1) ? 10 : (level === 2) ? 20 : 15;
                let num = Math.floor(Math.random() * 5) + 1;
                let finalNum = base * num; 
                questionText = `${pct}% of ${finalNum}`;
                correctAnswer = parseFloat(((pct / 100) * finalNum).toFixed(2));
            }
            break;
        }
        case "Decimal Arithmetic":
        case "Decimals": {
            let num1 = parseFloat((Math.random() * 9 + 1).toFixed(level === 1 ? 1 : 2));
            let num2 = parseFloat((Math.random() * 9 + 1).toFixed(level === 1 ? 1 : 2));
            questionText = `${num1} + ${num2}`;
            correctAnswer = parseFloat((num1 + num2).toFixed(2));
            break;
        }
        case "BODMAS Rules": 
        default: {
            const tier = getEloQuestionTier(studentRating);
            if (tier !== "learner") {
                const result = generateTieredBODMAS(tier);
                questionText = result.questionText;
                correctAnswer = result.correctAnswer;
            } else if (level === 1) {
                questionText = "2 × 3 + 4";
                correctAnswer = 10;
            } else if (level === 2) {
                questionText = "12 ÷ 3 + 5 × 2";
                correctAnswer = 14;
            } else {
                questionText = "(15 + 5) ÷ 4 × 9";
                correctAnswer = 45;
            }
            break;
        }
    }
    return { questionText, correctAnswer };
}

function startTestProcess() {
    activeTestState.questions = [];
    activeTestState.currentIndex = 0;
    activeTestState.correctCount = 0;
    activeTestState.scoresBreakdown = {};
    activeTestState.isProcessingAnswer = false;

    categories.forEach(cat => {
        const count = selectedCounts[cat.name] || 0;
        if (count > 0) {
            activeTestState.scoresBreakdown[cat.name] = {
                correct: 0,
                total: count
            };
            for (let i = 0; i < count; i++) {
                const { questionText, correctAnswer } = generateArithmeticExpression(cat.name);
                activeTestState.questions.push({
                    category: cat.name,
                    question: questionText,
                    correctAnswer: correctAnswer
                });
            }
        }
    });

    activeTestState.questions.sort(() => Math.random() - 0.5);
    navigateTo('test');
    loadCurrentQuestion();
}

function loadCurrentQuestion() {
    clearInterval(activeTestState.currentQuestionTimer);
    stopSpeechRecognition();

    if (activeTestState.currentIndex >= activeTestState.questions.length) {
        finishTestRun();
        return;
    }

    activeTestState.isProcessingAnswer = false;
    document.getElementById('validation-overlay').classList.add('hidden');
    document.getElementById('manual-answer-input').value = "";
    document.getElementById('test-spoken-transcript').innerText = "अपनी आवाज़ में साफ जवाब बोलें...";
    document.getElementById('test-spoken-transcript').className = "text-indigo-300 font-medium italic";

    const curQ = activeTestState.questions[activeTestState.currentIndex];
    
    document.getElementById('test-category-label').innerText = curQ.category;
    document.getElementById('test-progress-counter').innerText = `Question ${activeTestState.currentIndex + 1} of ${activeTestState.questions.length}`;
    document.getElementById('test-question-string').innerText = curQ.question;

    const isTimerActive = appSettings.globalTimer && appSettings.countdownEnabled[curQ.category];
    const maxDuration = appSettings.categoryTimes[curQ.category] || 15;

    if (isTimerActive) {
        document.getElementById('timer-box').classList.remove('hidden');
        let countRemaining = maxDuration;
        activeTestState.secondsUsed = 0; 
        document.getElementById('test-timer-display').innerText = `${countRemaining}s Left`;

        activeTestState.currentQuestionTimer = setInterval(() => {
            countRemaining--;
            activeTestState.secondsUsed++; 
            document.getElementById('test-timer-display').innerText = `${countRemaining}s Left`;
            if (countRemaining <= 0) {
                clearInterval(activeTestState.currentQuestionTimer);
                handleAnswerValidation(false, "समय समाप्त!");
            }
        }, 1000);
    } else {
        document.getElementById('timer-box').classList.add('hidden');
        activeTestState.secondsUsed = 0; 
    }

    setTimeout(() => {
        if(!activeTestState.isProcessingAnswer) {
            startSpeechRecognition();
        }
    }, 300);
}

function playFeedbackBeep(success) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (success) {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); 
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); 
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
        } else {
            osc.frequency.setValueAtTime(220, ctx.currentTime); 
            osc.frequency.setValueAtTime(146.83, ctx.currentTime + 0.1); 
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        }
    } catch(e) {
        console.log("Audio failed to load safely", e);
    }
}

function handleAnswerValidation(isCorrect, debugMsg) {
    if (activeTestState.isProcessingAnswer) return;
    activeTestState.isProcessingAnswer = true;

    clearInterval(activeTestState.currentQuestionTimer);
    stopSpeechRecognition();
    
    const curQ = activeTestState.questions[activeTestState.currentIndex];
    const currentCategory = curQ.category; 
    const currentQuestionLevel = categoryDifficulty[currentCategory] || 2;

    const isTimerActive = appSettings.globalTimer && appSettings.countdownEnabled[currentCategory];
    const maxDuration = appSettings.categoryTimes[currentCategory] || 15;
    const secondsUsed = activeTestState.secondsUsed || 0;

    if (isCorrect) {
        currentStreak++; 
    } else {
        currentStreak = 0; 
    }

    const squeezeApplies = isSqueezeEligible(studentRating, currentCategory);

    studentRating = calculateNewRating(
        studentRating, 
        isCorrect, 
        currentQuestionLevel, 
        isTimerActive, 
        secondsUsed, 
        maxDuration,
        currentStreak,
        wasLastWrong,
        squeezeApplies
    );
    document.getElementById('home-rating-display').innerText = studentRating;

    incrementTodaySolvedCount();
    uploadRatingToCloud();

    wasLastWrong = !isCorrect;

    if (isCorrect) {
        activeTestState.correctCount++;
        if (activeTestState.scoresBreakdown[currentCategory]) {
            activeTestState.scoresBreakdown[currentCategory].correct++;
        }
        if (categoryDifficulty[currentCategory] < 3) {
            categoryDifficulty[currentCategory] += 1;
        }
    } else {
        if (categoryDifficulty[currentCategory] > 1) {
            categoryDifficulty[currentCategory] -= 1;
        }
    }

    localStorage.setItem('categoryDifficulty', JSON.stringify(categoryDifficulty));
    playFeedbackBeep(isCorrect);

    const overlay = document.getElementById('validation-overlay');
    const titleEl = document.getElementById('validation-title');
    const subEl = document.getElementById('validation-subtitle');
    const iconBox = document.getElementById('validation-icon-box');

    if (isCorrect) {
        overlay.className = "absolute inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 animate-fade-in";
        iconBox.className = "w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-2xl font-bold";
        iconBox.innerHTML = `✓`;
        titleEl.className = "text-2xl font-black text-emerald-400";
        
        if (currentStreak >= 3) {
            titleEl.innerText = `🔥 ${currentStreak} की स्ट्रीक! सही जवाब`;
        } else {
            titleEl.innerText = "सही जवाब!";
        }
        subEl.innerText = debugMsg || "सफलतापूर्वक वेरिफाई हुआ";
    } else {
        overlay.className = "absolute inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col items-center justify-center space-y-3 animate-fade-in";
        iconBox.className = "w-16 h-16 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center text-2xl font-bold";
        iconBox.innerHTML = `✗`;
        titleEl.className = "text-2xl font-black text-rose-400";
        titleEl.innerText = debugMsg === "समय समाप्त!" ? "समय समाप्त!" : "गलत जवाब";
        subEl.innerHTML = `सही जवाब था: <span class="font-bold text-white font-mono">${curQ.correctAnswer}</span>`;
    }

    overlay.classList.remove('hidden');

    setTimeout(() => {
        activeTestState.currentIndex++;
        loadCurrentQuestion();
    }, 1200);
}

function submitManualAnswer() {
    if (activeTestState.isProcessingAnswer) return;
    const val = document.getElementById('manual-answer-input').value.trim();
    if (val === "") return;

    const curQ = activeTestState.questions[activeTestState.currentIndex];
    const parsedInput = parseFloat(val);
    const isCorrect = Math.abs(parsedInput - curQ.correctAnswer) < 0.01;

    handleAnswerValidation(isCorrect, isCorrect ? "टेक्स्ट इनपुट से वेरिफाई हुआ" : "वेरिफिकेशन पूर्ण");
}

function forceSubmitTest() {
    clearInterval(activeTestState.currentQuestionTimer);
    stopSpeechRecognition();
    finishTestRun();
}

function finishTestRun() {
    navigateTo('report');

    const total = activeTestState.questions.length;
    const correct = activeTestState.correctCount;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    if (percentage >= 90 && total >= 5) {
        studentRating = parseFloat((studentRating + 0.5).toFixed(1));
        showToast("🏆", "शानदार एक्यूरेसी! आपको +0.5 रेटिंग बोनस मिला।");
    }
    
    uploadRatingToCloud();

    currentStreak = 0;
    wasLastWrong = false;

    document.getElementById('report-rating-display').innerText = studentRating;
    document.getElementById('home-rating-display').innerText = studentRating;
    document.getElementById('report-accuracy-percentage').innerText = `${percentage}%`;
    document.getElementById('report-fraction-score').innerText = `${correct} / ${total} Questions Correct`;

    const titleEl = document.getElementById('report-feedback-title');
    if (percentage === 100) titleEl.innerText = "🌟 शत-प्रतिशत परफेक्ट!";
    else if (percentage >= 80) titleEl.innerText = "🔥 बेमिसाल स्पीड और एक्यूरेसी!";
    else if (percentage >= 50) titleEl.innerText = "📈 बहुत बढ़िया, अभ्यास जारी रखें!";
    else titleEl.innerText = "💪 ध्यान दें और दोबारा प्रयास करें!";

    const breakdownContainer = document.getElementById('report-category-breakdown');
    breakdownContainer.innerHTML = '';

    Object.keys(activeTestState.scoresBreakdown).forEach(catName => {
        const metric = activeTestState.scoresBreakdown[catName];
        const catPercentage = metric.total > 0 ? Math.round((metric.correct / metric.total) * 100) : 0;

        const card = document.createElement('div');
        card.className = "space-y-1.5";
        card.innerHTML = `
            <div class="flex justify-between text-xs font-semibold">
                <span class="text-slate-300">${catName}</span>
                <span class="text-slate-400 font-mono">${metric.correct} / ${metric.total} correct (${catPercentage}%)</span>
            </div>
            <div class="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
                <div class="bg-indigo-500 h-full rounded-full" style="width: ${catPercentage}%"></div>
            </div>
        `;
        breakdownContainer.appendChild(card);
    });
}

function parseWordToDigit(word) {
    const units = {
        'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
        'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
        'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
        'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10
    };
    const tens = {
        'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
        'बीस': 20, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90
    };
    const scales = {
        'hundred': 100, 'thousand': 1000, 'सौ': 100, 'हजार': 1000
    };

    const cleanWord = word.toLowerCase().trim();
    if (units[cleanWord] !== undefined) return { val: units[cleanWord], type: 'unit' };
    if (tens[cleanWord] !== undefined) return { val: tens[cleanWord], type: 'ten' };
    if (scales[cleanWord] !== undefined) return { val: scales[cleanWord], type: 'scale' };
    return null;
}

function reconstructSpokenNumber(text) {
    let clean = text.toLowerCase().trim()
        .replace(/[^a-zA-Z0-9\s.\u0900-\u097F]/g, '') 
        .replace(/\bto\b/g, 'two')
        .replace(/\btoo\b/g, 'two')
        .replace(/\bfor\b/g, 'four')
        .replace(/\bpoint\b/g, '.')
        .replace(/\bदशमलव\b/g, '.')
        .replace(/\broot\b/g, '')
        .replace(/\bरूट\b/g, '')
        .replace(/\bcube\b/g, '')
        .replace(/\bक्यूब\b/g, '')
        .replace(/\band\b/g, ''); 

    const words = clean.split(/\s+/);
    
    const directMatch = clean.match(/[\d.]+/);
    if (directMatch) {
        const val = parseFloat(directMatch[0]);
        if (!isNaN(val)) return val;
    }

    let isConsecutiveSequence = true;
    let digitSequenceStr = "";
    for (let i = 0; i < words.length; i++) {
        const parsed = parseWordToDigit(words[i]);
        if (parsed && parsed.type === 'unit') {
            digitSequenceStr += parsed.val;
        } else if (words[i] === '.') {
            digitSequenceStr += '.';
        } else {
            isConsecutiveSequence = false;
            break;
        }
    }
    if (isConsecutiveSequence && digitSequenceStr !== "") {
        const val = parseFloat(digitSequenceStr);
        if (!isNaN(val)) return val;
    }

    let compoundList = [];
    let activeSegment = 0;
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const parsed = parseWordToDigit(w);
        if (parsed) {
            if (parsed.type === 'ten' || parsed.type === 'unit') {
                activeSegment += parsed.val;
            } else if (parsed.type === 'scale') {
                activeSegment = (activeSegment === 0 ? 1 : activeSegment) * parsed.val;
                compoundList.push(activeSegment);
                activeSegment = 0;
            }
        }
    }
    if (activeSegment > 0) {
        compoundList.push(activeSegment);
    }

    if (compoundList.length > 0) {
        const sum = compoundList.reduce((acc, c) => acc + c, 0);
        const concatStr = compoundList.map(v => String(v)).join('');
        const concatVal = parseFloat(concatStr);
        return { sum, concatVal };
    }
    return null;
}

function verifyVerbalResponse(transcript, actualAns) {
    const parsedObj = reconstructSpokenNumber(transcript);
    if (parsedObj === null) return false;

    const actualNum = parseFloat(actualAns);
    if (typeof parsedObj === 'number') {
        return Math.abs(parsedObj - actualNum) < 0.01;
    }
    if (parsedObj.sum !== undefined) {
        if (Math.abs(parsedObj.sum - actualNum) < 0.01) return true;
        if (parsedObj.concatVal !== undefined && Math.abs(parsedObj.concatVal - actualNum) < 0.01) return true;
    }
    return false;
}

function initSpeechEngine() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        document.getElementById('microphone-wave').innerHTML = `
            <span class="text-xs text-rose-400 font-bold">⚠️ Speech Recognition is not supported on this browser. Please use manual fallback.</span>
        `;
        return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'hi-IN'; 

    rec.onstart = function() {
        activeTestState.activeListening = true;
        document.getElementById('mic-status-label').innerText = "वॉयस इंजन सक्रिय है: बोलिए (Hindi/English Support)...";
        document.getElementById('mic-status-label').className = "text-xs font-bold text-emerald-400";
    };

    rec.onresult = function(event) {
        if(activeTestState.isProcessingAnswer) return;

        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript !== '') {
            document.getElementById('test-spoken-transcript').innerText = `"${finalTranscript.trim()}"`;
            document.getElementById('test-spoken-transcript').className = "text-indigo-400 font-bold";

            const curQ = activeTestState.questions[activeTestState.currentIndex];
            const matched = verifyVerbalResponse(finalTranscript, curQ.correctAnswer);

            if (matched) {
                handleAnswerValidation(true, `Verified speech match: "${finalTranscript.trim()}"`);
            } else {
                const parsedValue = reconstructSpokenNumber(finalTranscript);
                if (parsedValue !== null) {
                    handleAnswerValidation(false);
                }
            }
        }
    };

    rec.onerror = function(event) {
        console.log("Speech Engine Error:", event.error);
    };

    rec.onend = function() {
        activeTestState.activeListening = false;
        const testView = document.getElementById('view-test');
        
        if (testView && !testView.classList.contains('hidden') && !activeTestState.isProcessingAnswer) {
            try {
                rec.start();
                activeTestState.activeListening = true;
            } catch(e) {
                console.log("Mic auto-restart bypassed");
            }
        }
    };
    activeTestState.recognitionEngine = rec;
}

function startSpeechRecognition() {
    if (activeTestState.recognitionEngine && !activeTestState.activeListening && !activeTestState.isProcessingAnswer) {
        try {
            activeTestState.recognitionEngine.start();
        } catch(e) {
            console.log("Recognition start overlap bypassed");
        }
    }
}

function stopSpeechRecognition() {
    if (activeTestState.recognitionEngine) {
        try {
            activeTestState.recognitionEngine.stop();
        } catch(e) {}
        activeTestState.activeListening = false;
    }
}

function saveTestScoreMarkdown() {
    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    
    const total = activeTestState.questions.length;
    const correct = activeTestState.correctCount;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    const breakdowns = [];
    Object.keys(activeTestState.scoresBreakdown).forEach(cat => {
        const metric = activeTestState.scoresBreakdown[cat];
        const catPct = metric.total > 0 ? Math.round((metric.correct / metric.total) * 100) : 0;
        breakdowns.push(`${cat}: ${catPct}%`);
    });
    const breakdownStr = breakdowns.join(", ");

    const newRow = `| ${formattedDate} | ${total} | ${correct}/${total} | ${percentage}% | ${breakdownStr} |\n`;

    let fileContent = localStorage.getItem('calculation_score_md') || defaultMarkdown;
    fileContent += newRow;

    localStorage.setItem('calculation_score_md', fileContent);
    showToast("💾", "Score successfully appended to calculation_score.md!");
    navigateTo('scores');
}

function loadScoresHistory() {
    const fileContent = localStorage.getItem('calculation_score_md') || defaultMarkdown;
    const parsedRecords = parseMarkdownTable(fileContent);

    const tbody = document.getElementById('scores-table-body');
    tbody.innerHTML = '';

    if (parsedRecords.length === 0) {
        document.getElementById('no-scores-indicator').className = "p-8 text-center text-slate-500 text-sm italic";
        document.getElementById('score-table-container').classList.add('border-slate-800/20');
        renderGraphView([]); 
        return;
    }

    document.getElementById('no-scores-indicator').className = "hidden";
    document.getElementById('score-table-container').classList.remove('border-slate-800/20');

    parsedRecords.reverse().forEach(rec => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/30 transition border-b border-slate-800/40";
        tr.innerHTML = `
            <td class="p-4 font-semibold text-slate-100">${rec.dateTime}</td>
            <td class="p-4 font-mono">${rec.total}</td>
            <td class="p-4 font-mono font-bold text-slate-200">${rec.score}</td>
            <td class="p-4 font-mono font-extrabold text-indigo-400">${rec.accuracy}</td>
            <td class="p-4 text-slate-400 leading-normal max-w-xs truncate" title="${rec.breakdown}">${rec.breakdown}</td>
        `;
        tbody.appendChild(tr);
    });
    renderGraphView(parsedRecords.reverse()); 
}

function parseMarkdownTable(md) {
    const records = [];
    const lines = md.split('\n');
    for (let line of lines) {
        if (line.trim().startsWith('|') && !line.includes('Date & Time') && !line.includes('---')) {
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 6) {
                records.push({
                    dateTime: parts[1],
                    total: parts[2],
                    score: parts[3],
                    accuracy: parts[4],
                    breakdown: parts[5]
                });
            }
        }
    }
    return records;
}

function toggleScoreViewMode() {
    const table = document.getElementById('score-table-container');
    const graph = document.getElementById('score-graph-container');
    const label = document.getElementById('score-toggle-label');

    if (table.classList.contains('hidden')) {
        table.classList.remove('hidden');
        graph.classList.add('hidden');
        label.innerText = "Graph View";
    } else {
        table.classList.add('hidden');
        graph.classList.remove('hidden');
        label.innerText = "Table View";
    }
}

function renderGraphView(records) {
    const wrapper = document.getElementById('svg-chart-wrapper');
    if(!wrapper) return;
    wrapper.innerHTML = '';

    if (records.length === 0) {
        wrapper.innerHTML = `<p class="text-xs text-slate-500 italic">Play some tests to render tracking curves!</p>`;
        return;
    }

    const dataPoints = records.map(r => parseFloat(r.accuracy.replace('%', '')) || 0);
    const width = wrapper.clientWidth || 600;
    const height = 220;
    const padding = 35;
    const xStep = (width - padding * 2) / (Math.max(dataPoints.length - 1, 1));
    
    let pointsPath = "";
    let areaPath = `M ${padding} ${height - padding} `;

    dataPoints.forEach((val, index) => {
        const x = padding + index * xStep;
        const y = padding + ((100 - val) / 100) * (height - padding * 2);
        if (index === 0) pointsPath += `M ${x} ${y} `;
        else pointsPath += `L ${x} ${y} `;
        areaPath += `L ${x} ${y} `;
    });

    areaPath += `L ${padding + (dataPoints.length - 1) * xStep} ${height - padding} Z`;
    let circles = "";
    let gridLines = "";

    for (let grid = 0; grid <= 4; grid++) {
        const pct = grid * 25;
        const y = padding + ((100 - pct) / 100) * (height - padding * 2);
        gridLines += `
            <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#1e293b" stroke-width="1" stroke-dasharray="4,4" />
            <text x="${padding - 8}" y="${y + 4}" fill="#64748b" font-size="10" font-family="Plus Jakarta Sans" text-anchor="end">${pct}%</text>
        `;
    }

    dataPoints.forEach((val, index) => {
        const x = padding + index * xStep;
        const y = padding + ((100 - val) / 100) * (height - padding * 2);
        circles += `
            <circle cx="${x}" cy="${y}" r="4" fill="#6366f1" stroke="#ffffff" stroke-width="1.5" />
            <text x="${x}" y="${y - 10}" fill="#a5b4fc" font-size="9" font-family="Plus Jakarta Sans" text-anchor="middle" font-weight="bold">${val}%</text>
        `;
    });

    const svgElement = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" class="overflow-visible">
            <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="#4f46e5" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
            ${gridLines}
            <path d="${areaPath}" fill="url(#chartGrad)" />
            <path d="${pointsPath}" fill="none" stroke="#6366f1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            ${circles}
        </svg>
    `;
    wrapper.innerHTML = svgElement;
}

function downloadRawMarkdown() {
    const mdContent = localStorage.getItem('calculation_score_md') || defaultMarkdown;
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "calculation_score.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("📥", "calculation_score.md file downloaded!");
}

function clearScoreHistory() {
    if (confirm("Are you sure you want to clear your database?")) {
        localStorage.setItem('calculation_score_md', defaultMarkdown);
        loadScoresHistory();
        showToast("🗑️", "Scores database cleared!");
    }
}

function renderLeaderboard() {
    document.getElementById('lb-user-name').innerText = studentName;
    document.getElementById('lb-user-rating').innerText = studentRating;

    const tbody = document.getElementById('leaderboard-table-body');
    const chartContainer = document.getElementById('lb-bar-chart-container');
    
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500 italic">गूगल क्लाउड से लाइव रैंकिंग लोड हो रही है...</td></tr>';
    if(chartContainer) chartContainer.innerHTML = '<p class="text-xs text-slate-500 italic text-center py-4">ग्राफ़ लोड हो रहा है...</p>';

    callCloudAPI({ action: "fetch" })
    .then(globalPlayers => {
        if (!globalPlayers || globalPlayers.length === 0) {
            globalPlayers = [{ name: studentName, rating: studentRating, id: playerId }];
        }

        globalPlayers.sort((a, b) => b.rating - a.rating);

        tbody.innerHTML = '';
        globalPlayers.forEach((player, index) => {
            const rank = index + 1;
            let rankBadge = rank;
            
            if (rank === 1) rankBadge = "🥇";
            else if (rank === 2) rankBadge = "🥈";
            else if (rank === 3) rankBadge = "🥉";

            const isSelf = player.id === playerId;
            const rowClass = isSelf ? "bg-indigo-500/10 font-bold border-l-2 border-indigo-500" : "hover:bg-slate-900/30 transition";
            
            let playerStatus = getPlayerStatus(player.rating);

            const tr = document.createElement('tr');
            tr.className = `${rowClass} border-b border-slate-800/40`;
            tr.innerHTML = `
                <td class="p-4 text-center font-mono text-sm">${rankBadge}</td>
                <td class="p-4 text-slate-150">${player.name} ${isSelf ? '(You) 👤' : ''}</td>
                <td class="p-4 text-center font-mono font-extrabold text-indigo-400">${player.rating}</td>
                <td class="p-4 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        playerStatus === 'Grandmaster' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        playerStatus === 'Master' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                        playerStatus === 'Elite Heroic' || playerStatus === 'Heroic' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        playerStatus === 'Platinum' || playerStatus === 'Dimand' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                        playerStatus === 'Gold' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                        playerStatus === 'Silver' ? 'bg-slate-500/10 text-slate-300 border border-slate-500/20' :
                        'bg-slate-800 text-slate-400'
                    }">${playerStatus}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if(chartContainer) {
            chartContainer.innerHTML = '';

            const todayStr = getTodayDateString();
            const playersWithTodayCount = globalPlayers.map(p => {
                const isSelf = p.id === playerId;
                let count = isSelf ? todaySolvedCount : (p.lastDate === todayStr ? (parseInt(p.todayCount, 10) || 0) : 0);
                return Object.assign({}, p, { todayDisplayCount: count });
            });

            let maxCountInList = Math.max(...playersWithTodayCount.map(p => p.todayDisplayCount), 1);

            playersWithTodayCount.forEach(player => {
                const isSelf = player.id === playerId;
                let playerStatus = getPlayerStatus(player.rating);

                let barWidth = Math.min(100, Math.max(player.todayDisplayCount > 0 ? 8 : 2, (player.todayDisplayCount / maxCountInList) * 100));

                let barColor = "from-slate-600 to-slate-500";
                if (playerStatus === 'Grandmaster') barColor = "from-amber-500 to-orange-500";
                else if (playerStatus === 'Master') barColor = "from-rose-500 to-red-500";
                else if (playerStatus === 'Elite Heroic' || playerStatus === 'Heroic') barColor = "from-purple-500 to-pink-500";
                else if (playerStatus === 'Platinum' || playerStatus === 'Dimand') barColor = "from-cyan-500 to-blue-500";
                else if (playerStatus === 'Gold') barColor = "from-yellow-500 to-amber-500";
                else if (playerStatus === 'Silver') barColor = "from-slate-400 to-slate-500";

                const barRow = document.createElement('div');
                barRow.className = "space-y-1";
                barRow.innerHTML = `
                    <div class="flex justify-between text-[11px] font-medium px-1">
                        <span class="${isSelf ? 'text-indigo-400 font-bold' : 'text-slate-300'}">${player.name} ${isSelf ? '(You)' : ''}</span>
                        <span class="text-slate-400 font-mono font-bold">${player.todayDisplayCount} Solved Today</span>
                    </div>
                    <div class="w-full bg-slate-900 h-4 rounded-lg overflow-hidden border border-slate-800/60 flex items-center">
                        <div class="bg-gradient-to-r ${barColor} h-full rounded-lg bar-fill flex items-center justify-end px-2" style="width: ${barWidth}%">
                            <span class="text-[9px] text-white font-black font-mono tracking-tighter opacity-80">${player.todayDisplayCount}</span>
                        </div>
                    </div>
                `;
                chartContainer.appendChild(barRow);
            });
        }
    })
    .catch(err => {
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-400">क्लाउड डेटाबेस से कनेक्ट करने में एरर आया।</td></tr>';
        if(chartContainer) chartContainer.innerHTML = '';
        console.error(err);
    });
}

// ================= ADMIN CONTROL SYSTEM =================
const ADMIN_SECRET_PIN = "7368"; 
let globalPlayersData = [];

function getDynamicTimePin() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();

    hours = hours % 12;
    if (hours === 0) hours = 12;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');

    return `${hh}${mm}`;
}

function checkAdminAuth() {
    const enteredPin = document.getElementById('admin-pin').value.trim();
    const currentExpectedPin = getDynamicTimePin();

    if (enteredPin === currentExpectedPin) {
        document.getElementById('admin-auth').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        showToast("🔓", "Access Granted! Time PIN Verified.");
        fetchAdminCloudData();
    } else {
        showToast("❌", "गलत पिन! वर्तमान समय (hhmm) दर्ज करें।");
    }
}

function lockAdminPanel() {
    document.getElementById('admin-pin').value = "";
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('admin-auth').classList.remove('hidden');
    showToast("🔒", "Panel locked successfully.");
}

function fetchAdminCloudData() {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-500 italic">क्लाउड से छात्र सूची लोड हो रही है...</td></tr>';

    fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "fetch" })
    })
    .then(res => res.json())
    .then(data => {
        globalPlayersData = data;
        renderAdminTable(data);
    })
    .catch(err => {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-rose-400">डेटा लोड करने में विफल।</td></tr>';
        console.error(err);
    });
}

function renderAdminTable(players) {
    const tbody = document.getElementById('admin-table-body');
    tbody.innerHTML = '';
    
    if(!players || players.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-500 italic">डेटाबेस में कोई छात्र नहीं मिला।</td></tr>';
        document.getElementById('total-students-count').innerText = "0";
        return;
    }

    document.getElementById('total-students-count').innerText = players.length;

    players.forEach((player) => {
        const safeId = player.id ? player.id.replace(/'/g, "\\'") : '';
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-900/30 transition border-b border-slate-800/40";
        tr.innerHTML = `
            <td class="p-4 font-mono text-slate-400 select-all">${player.id}</td>
            <td class="p-4 font-bold text-slate-200">${player.name}</td>
            <td class="p-4 font-mono text-slate-400">${player.password || '***'}</td>
            <td class="p-4 text-center font-bold text-slate-300">${player.studentClass || '-'}</td>
            <td class="p-4 text-center font-bold text-slate-300">${player.age || '-'}</td>
            <td class="p-4 text-center font-mono font-extrabold text-indigo-400 text-sm">${player.rating}</td>
            <td class="p-4 text-center flex items-center justify-center space-x-2">
                <button onclick="openEditModal('${safeId}')" class="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-lg transition font-bold text-[11px]">Edit ✏️</button>
                <button onclick="deleteStudent('${safeId}', '${player.name.replace(/'/g, "\\'")}')" class="px-2 py-1 bg-red-600/25 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition font-bold text-[11px]">Delete 🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openEditModal(userId) {
    const user = globalPlayersData.find(p => p.id === userId);
    if (!user) return;

    document.getElementById('edit-userid').value = user.id;
    document.getElementById('edit-name').value = user.name || '';
    document.getElementById('edit-password').value = user.password || '';
    document.getElementById('edit-class').value = user.studentClass || '';
    document.getElementById('edit-age').value = user.age || '';
    document.getElementById('edit-rating').value = user.rating;

    document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

function saveUserEdits() {
    const uId = document.getElementById('edit-userid').value;
    const name = document.getElementById('edit-name').value.trim();
    const pass = document.getElementById('edit-password').value.trim();
    const sClass = document.getElementById('edit-class').value.trim();
    const age = document.getElementById('edit-age').value.trim();
    const rating = parseFloat(document.getElementById('edit-rating').value);

    if (!name || isNaN(rating)) {
        showToast("⚠️", "कृपया वैध नाम और रेटिंग दर्ज करें!");
        return;
    }

    closeEditModal();
    showToast("⏳", `Updating ${name}'s account...`);

    fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
            action: "update",
            id: uId,
            name: name,
            password: pass,
            studentClass: sClass,
            age: age,
            rating: rating
        })
    })
    .then(() => {
        showToast("✅", "Account details successfully updated!");
        fetchAdminCloudData();
    })
    .catch(err => {
        showToast("❌", "Failed to update account.");
        console.error(err);
    });
}

function handleAdminSignup() {
    const name = document.getElementById('new-reg-name').value.trim();
    const sClass = document.getElementById('new-reg-class').value.trim();
    const age = document.getElementById('new-reg-age').value.trim();
    const uId = document.getElementById('new-reg-userid').value.trim().toLowerCase();
    const pass = document.getElementById('new-reg-password').value.trim();

    if (!name || !sClass || !age || !uId || !pass) {
        showToast("⚠️", "कृपया छात्र पंजीकरण के सभी बॉक्स भरें!");
        return;
    }

    showToast("⏳", "Creating account on cloud...");

    fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ 
            action: "signup", 
            name: name, 
            studentClass: sClass, 
            age: age, 
            userId: uId, 
            password: pass 
        })
    })
    .then(res => res.json())
    .then(resData => {
        if (resData.status === "success") {
            showToast("🎉", `Account created successfully for ${name}!`);
            document.getElementById('new-reg-name').value = "";
            document.getElementById('new-reg-class').value = "";
            document.getElementById('new-reg-age').value = "";
            document.getElementById('new-reg-userid').value = "";
            document.getElementById('new-reg-password').value = "";
            fetchAdminCloudData();
        } else {
            showToast("❌", "User ID already taken!");
        }
    })
    .catch((err) => {
        console.error(err);
        showToast("❌", "Cloud connection error.");
    });
}

function deleteStudent(userId, studentName) {
    if (confirm(`क्या आप सचमुच ${studentName} (${userId}) का रिकॉर्ड दोनों शीट से डिलीट करना चाहते हैं?`)) {
        showToast("⏳", `Deleting ${studentName} from cloud...`);
        
        fetch(GOOGLE_SHEET_API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
                action: "delete",
                id: userId
            })
        })
        .then(() => {
            showToast("🗑️", `${studentName} removed successfully!`);
            fetchAdminCloudData();
        })
        .catch(err => {
            showToast("❌", "Failed to delete student.");
            console.error(err);
        });
    }
}