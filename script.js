// Firebase SDK import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==================================================================
// 중요: Netlify 환경 변수에 설정한 VAPID 공개 키를 여기에 붙여넣으세요.
// ==================================================================
const VAPID_PUBLIC_KEY = "BD-EpP_7KB44ze4fi3gjugtwm0WOU67v8jYJgLXQCzRip_mVKB4k7yuu28Xb_XATwBcVFwBzZapbRwMICet-8Xo";

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
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

// 전역 변수
let db, auth;
let userId, userName;
let isSaving = false;
let lastSaveTime = 0;
const SAVE_INTERVAL = 30000; // 30초
let currentState = {
    level: 1,
    lifeForce: 0,
    ghgReduced: 0,
};
const levelThresholds = {
    2: 100, 3: 300, 4: 700, 5: 1500, 6: 3100, 7: 6300, 8: 12700, 9: 25500, 10: 51100,
};

// ========================================================
// ## 여기에 모든 핵심 함수들이 포함되어 있습니다. ##
// ========================================================

// 모달창 관련 함수
function showModal(title, message) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-overlay").style.display = 'flex';
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = 'none';
}

// 사이드 패널 관련 함수
function openSidePanel() {
    document.getElementById("side-panel-overlay").classList.add('active');
    document.getElementById("side-panel").classList.add('active');
}

function closeSidePanel() {
    document.getElementById("side-panel-overlay").classList.remove('active');
    document.getElementById("side-panel").classList.remove('active');
}

// 화면 UI 업데이트 함수
function updateDisplay() {
    document.getElementById('level-value').textContent = currentState.level;
    document.getElementById('life-force-value').textContent = currentState.lifeForce;
    document.getElementById('ghg-reduced-value').textContent = `${currentState.ghgReduced}g`;
    document.getElementById("panel-level-value").textContent = currentState.level;
    document.getElementById("panel-ghg-reduced-value").textContent = `${currentState.ghgReduced}g`;
    const oreumElement = document.getElementById('oreum');
    // 시각적 변화는 최대 5레벨까지만 표현 (CSS에 정의된 부분)
    oreumElement.className = `oreum level-${Math.min(currentState.level, 5)}`; 
}

// 레벨업 체크 함수
function checkLevelUp() {
    const nextLevel = currentState.level + 1;
    if (levelThresholds[nextLevel] && currentState.lifeForce >= levelThresholds[nextLevel]) {
        currentState.level = nextLevel;
        showModal("🎉 레벨 업!", `축하합니다! 오름이 Level ${currentState.level}(으)로 성장했습니다!`);
    }
}

// 게임 상태 업데이트 및 DB 저장 함수
async function updateGameAndTransport(speed) {
    if (!userId) return;

    let transport = "정지 상태";
    const speed_kph = speed * 3.6;

    if (speed_kph >= 30) transport = "차량";
    else if (speed_kph >= 10) transport = "자전거";
    else if (speed_kph >= 1) transport = "도보";
    
    document.getElementById("transport-display").textContent = transport;

    let lifeForceChange = 0;
    let ghgChange = 0;

    // 실시간으로 조금씩 점수를 얻도록 값을 조정
    switch (transport) {
        case "도보": lifeForceChange = 2; ghgChange = 10; break;
        case "자전거": lifeForceChange = 1; ghgChange = 5; break;
        case "차량": lifeForceChange = -5; ghgChange = -20; break; // 차량 이용 시 감소
    }
    currentState.lifeForce += lifeForceChange;
    currentState.ghgReduced += ghgChange;

    checkLevelUp();
    updateDisplay();

    const currentTime = Date.now();
    if (!isSaving && (currentTime - lastSaveTime > SAVE_INTERVAL)) {
        isSaving = true;
        document.getElementById("db-status").textContent = "데이터 저장 중...";
        try {
            // Firebase DB 경로를 users/{userId}/gameState로 명확히 함
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

// 센서 활성화 함수
function startSensorsAndGame() {
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                const speed = pos.coords.speed || 0;
                document.getElementById("speed-display").textContent = `${speed.toFixed(2)} m/s`;
                updateGameAndTransport(speed);
            },
            (err) => {
                console.error("Geolocation Error:", err);
                showModal("위치 정보 오류", "위치 정보 접근에 실패했습니다. 브라우저 설정을 확인해주세요.");
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        showModal("오류", "이 브라우저는 위치 정보를 지원하지 않습니다.");
    }

    if (window.DeviceMotionEvent) {
        window.addEventListener("devicemotion", (event) => {
            const acc = event.accelerationIncludingGravity;
            if (acc.x) {
                const accMagnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
                document.getElementById("acc-display").textContent = `${accMagnitude.toFixed(2)} m/s²`;
            }
        });
    }
}

// 구글 로그인 함수
async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        closeSidePanel();
    } catch (error) {
        console.error("Google 로그인 오류:", error);
        showModal("로그인 오류", `Google 로그인에 실패했습니다: ${error.message}`);
    }
}

// DB에서 게임 상태 불러오는 함수
function loadGameStateFromDB(currentUserId) {
    const stateRef = ref(db, `users/${currentUserId}/gameState`);
    onValue(stateRef, (snapshot) => {
        if (snapshot.exists()) {
            currentState = snapshot.val();
            document.getElementById("db-status").textContent = "데이터 불러오기 성공!";
        } else {
            // 새 사용자일 경우 초기값 설정
            currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
            document.getElementById("db-status").textContent = "새 게임 시작!";
        }
        updateDisplay();
    }, { onlyOnce: true }); // 최초 한 번만 불러오기
}


// ========================================================
// ## DOM이 로드된 후 모든 코드를 실행합니다. ##
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
    // 서비스 워커 등록
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('Service Worker 등록 성공:', registration))
            .catch(error => console.error('Service Worker 등록 실패:', error));
    }

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    // UI 요소 가져오기
    const googleSignInBtn = document.getElementById("google-sign-in-btn");
    const signOutBtn = document.getElementById("sign-out-btn");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const profileIcon = document.getElementById('profile-icon-wrapper');
    const sidePanelCloseBtn = document.getElementById("side-panel-close-btn");
    const sidePanelOverlay = document.getElementById("side-panel-overlay");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    // 로그인 상태 변화 감지
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            userName = user.displayName || "사용자";
            document.getElementById("user-info-display").textContent = `환영합니다, ${userName}님!`;
            document.getElementById("panel-user-info").textContent = `${userName}님, 환영합니다!`;
            document.getElementById("logged-out-view").classList.add('hidden');
            document.getElementById("logged-in-view").classList.remove('hidden');
            loadGameStateFromDB(userId);
            startSensorsAndGame();
        } else {
            userId = null;
            userName = null;
            document.getElementById("user-info-display").textContent = "로그인하고 오름을 키워보세요!";
            document.getElementById("logged-in-view").classList.add('hidden');
            document.getElementById("logged-out-view").classList.remove('hidden');
            currentState = { level: 1, lifeForce: 0, ghgReduced: 0 };
            updateDisplay();
        }
    });

    // 이벤트 리스너 할당
    googleSignInBtn.addEventListener('click', signInWithGoogle);
    signOutBtn.addEventListener('click', () => signOut(auth));
    profileIcon.addEventListener('click', openSidePanel);
    sidePanelCloseBtn.addEventListener('click', closeSidePanel);
    sidePanelOverlay.addEventListener('click', (e) => {
        if (e.target === sidePanelOverlay) closeSidePanel();
    });
    modalCloseBtn.addEventListener('click', closeModal);

    // 푸시 알림 구독 버튼 이벤트
    subscribeBtn.addEventListener('click', async () => {
        if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === "YOUR_VAPID_PUBLIC_KEY") {
            showModal("설정 오류", "VAPID 공개 키가 설정되지 않았습니다. script.js 파일을 확인해주세요.");
            return;
        }
        if (!('PushManager' in window)) {
            showModal("오류", "이 브라우저는 푸시 알림을 지원하지 않습니다.");
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                throw new Error('알림 권한이 거부되었습니다.');
            }
            
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            
            await fetch('/api/save-subscription', {
                method: 'POST',
                body: JSON.stringify(subscription),
                headers: { 'Content-Type': 'application/json' },
            });

            showModal("알림 구독 완료", "성공적으로 알림을 구독했습니다.");

        } catch (error) {
            console.error("구독 실패: ", error);
            showModal("오류", `알림 구독에 실패했습니다: ${error.message}`);
        }
    });
});

