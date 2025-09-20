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

