const admin = require('firebase-admin');
const webpush = require('web-push');

// Netlify 환경 변수에서 Firebase 설정 정보 가져오기
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// Firebase Admin 초기화
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://eco-vision-db-default-rtdb.firebaseio.com" // 본인 DB 주소 확인
    });
}

const db = admin.database();

exports.handler = async () => {
    try {
        // Netlify 환경 변수에서 VAPID 키 설정
        webpush.setVapidDetails(
            'mailto:your-email@example.com', // 본인 이메일로 변경
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );

        // Firebase 'users' 경로에서 모든 사용자 정보 가져오기
        const snapshot = await db.ref('users').once('value');
        const users = snapshot.val();

        if (!users) {
            return { statusCode: 200, body: '알림을 보낼 사용자가 없습니다.' };
        }

        const notificationPromises = [];

        // 각 사용자에 대해 반복 작업 수행
        for (const userId in users) {
            const user = users[userId];
            const gameState = user.gameState;
            const subscription = user.subscription;

            // 게임 상태와 구독 정보가 모두 있는 사용자에게만 알림 발송
            if (gameState && subscription) {
                // 개인화된 알림 내용 생성
                const notificationPayload = {
                    title: '나의 탄소 오름 현황 🌱',
                    body: `현재 레벨: ${gameState.level}, 생명력: ${gameState.lifeForce}`
                };
                
                notificationPromises.push(
                    webpush.sendNotification(subscription, JSON.stringify(notificationPayload))
                );
            }
        }

        // 모든 알림 발송 작업이 끝날 때까지 기다림
        await Promise.all(notificationPromises);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `${notificationPromises.length}명의 사용자에게 알림을 보냈습니다.` })
        };
    } catch (error) {
        console.error("알림 발송 실패:", error);
        return { statusCode: 500, body: '알림 발송에 실패했습니다.' };
    }
};

