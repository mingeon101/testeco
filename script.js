// Firebase SDK import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 중요: Netlify 환경 변수에 설정한 VAPID 공개 키를 여기에 붙여넣으세요.
const VAPID_PUBLIC_KEY = "BD-EpP_7KB44ze4fi3gjugtwm0WOU67v8jYJgLXQCzRip_mVKB4k7yuu28Xb_XATwBcVFwBzZapbRwMICet-8Xo";

// VAPID 키를 서버 전송 형식으로 변환하는 헬퍼 함수
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
    return outputArray;
}

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyBwr1j5-SokeoEdaBL0uGejzZLLYW4IHLg",
    authDomain: "eco-vision-db.firebaseapp.com",
    databaseURL: "https://eco-vision-db-default-rtdb.firebaseio.com",
    projectId: "eco-vision-db",
    storageBucket: "eco-vision-db.firebasestorage.app",
    messagingSenderId: "340035289683",
    appId: "1:340035289683:web:dd65ba6bab22e91029fca6",
    measurementId: "G-8ZN69L0H1C"
};

// 전역 변수 선언
let db, auth;
let userId, userName;
let isSaving = false;
let lastSaveTime = 0;
const SAVE_INTERVAL = 30000; // 30초마다 저장
let currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
const levelThresholds = { 2: 100, 3: 300, 4: 700, 5: 1500, 6: 3100, 7: 6300, 8: 12700, 9: 25500, 10: 51100 };

const rewardsList = [
    { id: 'walk_50g', description: '탄소 50g 감축 달성', completed: false, requiredGhg: 50 },
    { id: 'walk_150g', description: '탄소 150g 감축 달성', completed: false, requiredGhg: 150 },
    { id: 'walk_300g', description: '탄소 300g 감축 달성', completed: false, requiredGhg: 300 },
    { id: 'walk_500g', description: '탄소 500g 감축 달성', completed: false, requiredGhg: 500 },
];

// AI 미션 관련 상수 및 상태
const AI_MISSION_REWARD = 500; // AI 인증 성공 시 부여할 GHGs

let aiMissionState = {
    base64Image: null,
    isSubmitting: false,
    currentMission: { // 예시: 텀블러 사용 인증 미션
        prompt: "제공된 이미지는 재사용 가능한 텀블러를 들고 있는 사진인가요? '네' 또는 '아니오'로만 답하고 다른 설명은 하지 마세요.",
        successKeyword: "네"
    }
};

// UI 제어 함수
function showModal(title, message) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-overlay").style.display = 'flex';
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = 'none';
}

function openSidePanel() {
    document.getElementById("side-panel-overlay").classList.add('active');
    document.getElementById("side-panel").classList.add('active');
}

function closeSidePanel() {
    document.getElementById("side-panel-overlay").classList.remove('active');
    document.getElementById("side-panel").classList.remove('active');
}

function openMissionModal() {
    document.getElementById('mission-modal-overlay').style.display = 'flex';
}
function closeMissionModal() {
    document.getElementById('mission-modal-overlay').style.display = 'none';
}
function openRewardsModal() {
    checkRewardsStatus();
    document.getElementById('rewards-modal-overlay').style.display = 'flex';
}
function closeRewardsModal() {
    document.getElementById('rewards-modal-overlay').style.display = 'none';
}

// **AI 미션 모달 제어 함수**
function openAIMissionModal() {
    document.getElementById('mission-modal-overlay').style.display = 'none'; // 메인 미션 모달 닫기
    document.getElementById('ai-mission-modal-overlay').style.display = 'flex'; // AI 미션 모달 열기
}

function closeAIMissionModal() {
    document.getElementById('ai-mission-modal-overlay').style.display = 'none';
    // AI 상태 초기화
    document.getElementById("ai-image-preview").src = "https://placehold.co/150x150/f0f0f0/888?text=Image+Preview";
    document.getElementById("ai-image-input").value = "";
    document.getElementById("ai-status-message").textContent = "텀블러를 들고 있는 사진을 선택해 주세요.";
    document.getElementById("ai-submit-mission-btn").disabled = true;
    aiMissionState.base64Image = null;
    aiMissionState.isSubmitting = false;
}


// 보상 관련 함수
function checkRewardsStatus() {
    rewardsList.forEach(reward => {
        reward.completed = currentState.ghgReduced >= reward.requiredGhg;
    });
    renderRewards();
}

function renderRewards() {
    const rewardListContainer = document.getElementById('reward-list-container');
    rewardListContainer.innerHTML = '';
    rewardsList.forEach(reward => {
        const rewardItem = document.createElement('div');
        const isCompleted = reward.completed;
        rewardItem.className = `reward-item ${isCompleted ? 'completed' : ''}`;
        
        rewardItem.innerHTML = `
            <div class="reward-icon-container">
                ${isCompleted ? 
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' :
                    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>'
                }
            </div>
            <p>${reward.description}</p>
        `;
        rewardListContainer.appendChild(rewardItem);
    });
}

// 게임 상태 업데이트 함수
function updateDisplay() {
    document.getElementById('level-value').textContent = currentState.level;
    document.getElementById('life-force-value').textContent = currentState.lifeForce;
    document.getElementById('ghg-reduced-value').textContent = `${currentState.ghgReduced}g`;
    document.getElementById("panel-level-value").textContent = currentState.level;
    document.getElementById("panel-ghg-reduced-value").textContent = `${currentState.ghgReduced}g`;
    const oreumElement = document.getElementById('oreum');
    oreumElement.className = `oreum level-${Math.min(currentState.level, 5)}`;
}

function checkLevelUp() {
    const nextLevel = currentState.level + 1;
    if (levelThresholds[nextLevel] && currentState.lifeForce >= levelThresholds[nextLevel]) {
        currentState.level = nextLevel;
        showModal("🎉 레벨 업!", `축하합니다! 오름이 Level ${currentState.level}(으)로 성장했습니다!`);
    }
}

// 센서 및 데이터 처리 함수
async function updateGameAndTransport(speed) {
    if (!userId) return;

    let transport = "정지 상태";
    const speed_kph = speed * 3.6;

    if (speed_kph >= 30) transport = "차량";
    else if (speed_kph >= 10) transport = "자전거";
    else if (speed_kph >= 1) transport = "도보";
    
    document.getElementById("transport-display").textContent = transport;
    document.getElementById("speed-display").textContent = `${speed.toFixed(2)} m/s`;
    
    let lifeForceChange = 0;
    let ghgChange = 0;

    // 이동수단에 따라 생명력과 탄소 감축량 변화 (초당 값으로 가정)
    switch (transport) {
        case "도보": lifeForceChange = 1; ghgChange = 2; break;
        case "자전거": lifeForceChange = 1; ghgChange = 4; break;
        case "차량": lifeForceChange = -2; ghgChange = -10; break;
    }

    if(lifeForceChange !== 0 || ghgChange !== 0) {
        currentState.lifeForce += lifeForceChange;
        currentState.ghgReduced += ghgChange;
        if(currentState.ghgReduced < 0) currentState.ghgReduced = 0;
    
        checkLevelUp();
        updateDisplay();
        checkRewardsStatus();
    }

    const currentTime = Date.now();
    if (!isSaving && (currentTime - lastSaveTime > SAVE_INTERVAL)) {
        isSaving = true;
        document.getElementById("db-status").textContent = "데이터 저장 중...";
        try {
            const userPath = `users/${userId}`;
            await set(ref(db, `${userPath}/gameState`), currentState);
            lastSaveTime = currentTime;
            document.getElementById("db-status").textContent = "데이터 저장 완료!";
        } catch (e) {
            console.error("DB 저장 오류: ", e);
            document.getElementById("db-status").textContent = "데이터 저장 오류";
        } finally {
            isSaving = false;
        }
    }
}

function startSensors() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                const speed = pos.coords.speed || 0;
                updateGameAndTransport(speed);
            },
            (err) => {
                console.error("Geolocation Error:", err);
                showModal("위치 정보 오류", "위치 정보 접근이 거부되었거나 오류가 발생했습니다.");
            },
            { enableHighAccuracy: true, maximumAge: 500, timeout: 5000 }
        );
    } else {
        showModal("오류", "이 브라우저는 위치 정보(GPS)를 지원하지 않습니다.");
    }
}

// **AI 미션 관련 신규 함수**

// 파일(Blob)을 Base64 문자열로 변환하는 헬퍼 함수
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// AI (Gemini API) 호출 함수 (이미지 분석)
async function callGeminiAPI(base64Image, missionPrompt) {
    const apiKey = ""; // Canvas 환경에서 자동으로 제공될 예정
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: missionPrompt },
                    {
                        inlineData: {
                            // 실제 이미지 mimeType을 사용하는 것이 좋으나, 예제에서는 jpeg/png 허용
                            mimeType: "image/jpeg", 
                            data: base64Image
                        }
                    }
                ]
            }
        ],
    };
    
    // 지연 및 재시도 로직 구현
    let response;
    let success = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    while (retryCount < MAX_RETRIES && !success) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 429) { // Rate limit
                    console.warn(`Rate Limit Exceeded. Retrying in ${Math.pow(2, retryCount)}s...`);
                    // Throw to trigger catch and retry logic
                    throw new Error('Rate Limit'); 
                }
                throw new Error(`API call failed with status: ${response.status}`);
            }

            success = true;
        } catch (error) {
            // Note: Do not log retry attempts as errors in the console as per instructions
            retryCount++;
            if (retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff (1s, 2s, 4s)
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw new Error("AI 인증 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
            }
        }
    }

    if (!response || !response.ok) {
        throw new Error("AI 인증 결과를 가져오는 데 실패했습니다.");
    }
    
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
}

// AI 미션 인증 처리 함수
async function submitAIMission() {
    if (!userId) {
        showModal("인증 오류", "AI 미션 인증을 위해서는 로그인이 필요합니다.");
        return;
    }
    if (aiMissionState.isSubmitting || !aiMissionState.base64Image) {
        showModal("오류", "인증할 이미지를 먼저 선택하거나, 이전 인증이 진행 중입니다.");
        return;
    }

    aiMissionState.isSubmitting = true;
    document.getElementById("ai-submit-mission-btn").disabled = true;
    document.getElementById("ai-status-message").textContent = "AI가 이미지를 분석 중입니다... (최대 10초 소요)";

    try {
        const resultText = await callGeminiAPI(aiMissionState.base64Image, aiMissionState.currentMission.prompt);
        
        console.log("AI 분석 결과:", resultText);

        // 결과 텍스트가 성공 키워드를 포함하는지 확인
        if (resultText.includes(aiMissionState.currentMission.successKeyword)) {
            // 보상 부여
            currentState.lifeForce += AI_MISSION_REWARD;
            currentState.ghgReduced += AI_MISSION_REWARD;
            
            // Firebase에 즉시 저장
            const userPath = `users/${userId}/gameState`;
            await set(ref(db, userPath), currentState);
            
            updateDisplay();
            checkLevelUp();
            checkRewardsStatus();
            
            document.getElementById("ai-status-message").textContent = `✅ 미션 성공! 생명력과 탄소 감축량 ${AI_MISSION_REWARD}g이 추가되었습니다!`;
            showModal("미션 성공!", `축하합니다! 텀블러 사용이 인증되어 오름의 생명력과 탄소 감축량 ${AI_MISSION_REWARD}g을 획득했습니다.`);
            
            // UI/상태 초기화
            document.getElementById("ai-submit-mission-btn").disabled = false;
            closeAIMissionModal();

        } else {
            document.getElementById("ai-status-message").textContent = "❌ 미션 실패: 이미지에서 텀블러 사용을 확인할 수 없습니다. 다시 시도해 주세요.";
            showModal("미션 실패", "AI가 이미지에서 텀블러 사용을 확인하지 못했습니다. 명확한 사진으로 다시 시도해 주세요.");
        }

    } catch (error) {
        console.error("AI 인증 처리 중 오류:", error);
        document.getElementById("ai-status-message").textContent = `❌ 오류: ${error.message}`;
        showModal("인증 오류", error.message);
    } finally {
        aiMissionState.isSubmitting = false;
        document.getElementById("ai-submit-mission-btn").disabled = false;
    }
}

// AI 미션 이미지 선택 핸들러
function handleImageSelection(event) {
    const file = event.target.files[0];
    const preview = document.getElementById("ai-image-preview");
    const status = document.getElementById("ai-status-message");

    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            preview.src = e.target.result;
            // Base64 변환 시 이미지 형식 지정 (jpeg로 가정)
            aiMissionState.base64Image = await fileToBase64(file); 
            status.textContent = "이미지가 준비되었습니다. 인증 버튼을 눌러주세요.";
            document.getElementById("ai-submit-mission-btn").disabled = false;
        };
        reader.readAsDataURL(file);
    } else {
        preview.src = "https://placehold.co/150x150/f0f0f0/888?text=Image+Preview";
        aiMissionState.base64Image = null;
        status.textContent = "유효한 이미지 파일(JPEG 또는 PNG)을 선택해주세요.";
        document.getElementById("ai-submit-mission-btn").disabled = true;
    }
}


// Firebase 인증 및 데이터 로드 함수
async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        closeSidePanel();
    } catch (error) {
        console.error("Google 로그인 오류:", error);
        showModal("로그인 오류", `로그인에 실패했습니다: ${error.message}`);
    }
}

function loadGameStateFromDB(currentUserId) {
    const userPath = `users/${currentUserId}/gameState`;
    const stateRef = ref(db, userPath);

    onValue(stateRef, (snapshot) => {
        if (snapshot.exists()) {
            currentState = snapshot.val();
        } else {
            currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
        }
        updateDisplay();
        checkRewardsStatus();
        document.getElementById("db-status").textContent = "데이터 동기화 완료!";
    });
}

// 앱 초기화 및 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(reg => console.log('Service Worker 등록 성공:', reg))
            .catch(err => console.error('Service Worker 등록 실패:', err));
    }

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    const googleSignInBtn = document.getElementById("google-sign-in-btn");
    const signOutBtn = document.getElementById("sign-out-btn");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const profileIcon = document.getElementById('profile-icon-wrapper');
    const sidePanelCloseBtn = document.getElementById("side-panel-close-btn");
    const sidePanelOverlay = document.getElementById("side-panel-overlay");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    
    const missionIcon = document.getElementById('mission-icon-wrapper');
    const rewardsIcon = document.getElementById('rewards-icon-wrapper');
    const missionModalOverlay = document.getElementById('mission-modal-overlay');
    const rewardsModalOverlay = document.getElementById('rewards-modal-overlay');
    const missionCloseBtn = document.getElementById('mission-close-btn');
    const rewardsCloseBtn = document.getElementById('rewards-close-btn');

    // **AI 미션 관련 신규 DOM 요소**
    const aiMissionBtn = document.getElementById('ai-mission-btn');
    const aiMissionModalOverlay = document.getElementById('ai-mission-modal-overlay');
    const aiMissionCloseBtn = document.getElementById('ai-mission-close-btn');
    const aiImageInput = document.getElementById('ai-image-input');
    const aiSubmitMissionBtn = document.getElementById('ai-submit-mission-btn');


    onAuthStateChanged(auth, (user) => {
        const loggedOutView = document.getElementById("logged-out-view");
        const loggedInView = document.getElementById("logged-in-view");
        const userInfoDisplay = document.getElementById("user-info-display");
        const panelUserInfo = document.getElementById("panel-user-info");

        if (user) {
            userId = user.uid;
            userName = user.displayName || '사용자';
            
            userInfoDisplay.textContent = `환영합니다, ${userName}님!`;
            panelUserInfo.textContent = `${userName}님, 환영합니다!`;
            loggedOutView.classList.add('hidden');
            loggedInView.classList.remove('hidden');

            loadGameStateFromDB(userId);
            startSensors();
        } else {
            userId = null;
            userName = null;
            
            userInfoDisplay.textContent = "로그인하고 오름을 키워보세요!";
            loggedOutView.classList.remove('hidden');
            loggedInView.classList.add('hidden');
            
            currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
            updateDisplay();
            document.getElementById("db-status").textContent = "로그인 대기 중...";
        }
    });

    googleSignInBtn.addEventListener('click', signInWithGoogle);
    signOutBtn.addEventListener('click', () => signOut(auth));
    profileIcon.addEventListener('click', openSidePanel);
    sidePanelCloseBtn.addEventListener('click', closeSidePanel);
    sidePanelOverlay.addEventListener('click', e => { if (e.target === sidePanelOverlay) closeSidePanel(); });
    modalCloseBtn.addEventListener('click', closeModal);
    
    missionIcon.addEventListener('click', openMissionModal);
    rewardsIcon.addEventListener('click', openRewardsModal);
    missionCloseBtn.addEventListener('click', closeMissionModal);
    rewardsCloseBtn.addEventListener('click', closeRewardsModal);
    missionModalOverlay.addEventListener('click', e => { if (e.target === missionModalOverlay) closeMissionModal(); });
    rewardsModalOverlay.addEventListener('click', e => { if (e.target === rewardsModalOverlay) closeRewardsModal(); });
    
    // **AI 미션 이벤트 리스너 추가**
    aiMissionBtn.addEventListener('click', openAIMissionModal);
    aiMissionCloseBtn.addEventListener('click', closeAIMissionModal);
    aiMissionModalOverlay.addEventListener('click', e => { if (e.target === aiMissionModalOverlay) closeAIMissionModal(); });
    aiImageInput.addEventListener('change', handleImageSelection);
    aiSubmitMissionBtn.addEventListener('click', submitAIMission);
    
    subscribeBtn.addEventListener('click', async () => {
        if (!('PushManager' in window) || !auth.currentUser) {
            showModal("오류", "푸시 알림을 구독하려면 로그인이 필요합니다.");
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') throw new Error('알림 권한이 거부되었습니다.');
            
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            
            const body = { subscription, userId: auth.currentUser.uid };
            await fetch('/api/save-subscription', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: { 'Content-Type': 'application/json' },
            });
            showModal("알림 구독 완료", "성공적으로 알림을 구독했습니다.");
        } catch (error) {
            console.error("구독 실패: ", error);
            showModal("오류", `알림 구독에 실패했습니다: ${error.message}`);
        }
    });
});
