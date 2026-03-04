// ------------------------------------------------------------------
// FIREBASE 配置檔案
// ------------------------------------------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyAJ4MwckWTl9dyKnSJnFJV2q7_U2tTw-7M",
    authDomain: "prestige-forum.firebaseapp.com",
    projectId: "prestige-forum",
    storageBucket: "prestige-forum.firebasestorage.app",
    messagingSenderId: "152041201129",
    appId: "1:152041201129:web:0ed5eceeac3ad1dc26ff78",
    measurementId: "G-0XPHF5C9M5"
};

// 初始化檢查
try {
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("Firebase 尚未設定！請編輯 js/firebase-config.js");
        window.isConfigured = false;
    } else {
        window.isConfigured = true;
        
        // 初始化 Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        // 初始化 Firestore
        const db = firebase.firestore();
        const auth = firebase.auth();
        
        // 如果有 analytics SDK，則初始化
        if (typeof firebase.analytics === 'function') {
            firebase.analytics();
        }
    }
} catch (error) {
    console.error("Firebase Config Error:", error);
    window.isConfigured = false;
    document.body.innerHTML += `<div style="color: red; padding: 20px;">Firebase 配置錯誤: ${error.message}</div>`;
}
