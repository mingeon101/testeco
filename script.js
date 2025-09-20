// Firebase SDK import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, push, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==================================================================
// 중요: Netlify 환경 변수에 설정한 VAPID 공개 키를 여기에 붙여넣으세요.
// ==================================================================
const VAPID_PUBLIC_KEY = "YOUR_VAPID_PUBLIC_KEY";

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

// ... (이전에 제공된 모든 전역 변수 및 함수 코드를 여기에 복사하세요) ...

document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('Service Worker 등록 성공:', registration))
            .catch(error => console.error('Service Worker 등록 실패:', error));
    }

    const app = initializeApp(firebaseConfig);
    // ... (이전에 제공된 DOMContentLoaded 내부의 모든 코드를 여기에 복사하세요) ...
    // 단, subscribeBtn 이벤트 리스너는 아래 코드로 대체합니다.
    
    const subscribeBtn = document.getElementById("subscribe-btn");
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
// ... (이전에 제공된 나머지 모든 함수 코드를 여기에 복사하세요) ...
