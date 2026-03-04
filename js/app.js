// ------------------------------------------------------------------
// APP 邏輯核心
// ------------------------------------------------------------------

// State Management
const appState = {
    user: null,
    role: 'guest', // guest, user, moderator, admin
    currentRoute: '',
    params: {},
};

// DOM Elements
const appContainer = document.getElementById('app');
const navLinksContainer = document.getElementById('nav-links');
const authButtonsContainer = document.getElementById('auth-buttons');

// ------------------------------------------------------------------
// 1. 初始化與路由
// ------------------------------------------------------------------

function init() {
    if (!window.isConfigured) {
        renderConfigError();
        return;
    }

    // 監聽 Auth 狀態
    firebase.auth().onAuthStateChanged(async (user) => {
        appState.user = user;
        if (user) {
            // 獲取用戶角色
            const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                appState.role = userDoc.data().role || 'user';
            } else {
                // 首次登入，創建用戶資料
                await firebase.firestore().collection('users').doc(user.uid).set({
                    email: user.email,
                    role: 'user', // 預設角色
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                appState.role = 'user';
            }
        } else {
            appState.role = 'guest';
        }
        renderNav();
        handleRoute(); // 重新渲染當前頁面
    });

    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // 初始加載
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const [route, ...args] = hash.split('/');
    
    appState.currentRoute = route;
    appState.params = args;

    // 清空容器
    appContainer.innerHTML = '';
    appContainer.className = "flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full fade-in";

    switch (route) {
        case '':
        case '/':
            renderHome();
            break;
        case 'post':
            const postId = args[0];
            if (postId) renderPost(postId);
            else window.location.hash = '/';
            break;
        case 'login':
            renderLogin();
            break;
        case 'register':
            renderRegister(); // 這裡我們共用 Login 頁面，只是 UI 不同
            break;
        case 'create':
            if (!appState.user) {
                window.location.hash = '#login';
                return;
            }
            renderCreatePost();
            break;
        case 'admin':
            if (appState.role !== 'admin' && appState.role !== 'moderator') {
                window.location.hash = '/';
                alert('權限不足');
                return;
            }
            renderAdminDashboard();
            break;
        default:
            render404();
    }
}

// ------------------------------------------------------------------
// 2. 視圖渲染 (Views)
// ------------------------------------------------------------------

// --- 導航欄 ---
function renderNav() {
    let linksHtml = `
        <a href="#/" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">首頁</a>
    `;

    if (appState.user) {
        linksHtml += `
            <a href="#create" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">發布文章</a>
        `;
        if (appState.role === 'admin' || appState.role === 'moderator') {
            linksHtml += `
                <a href="#admin" class="border-transparent text-red-500 hover:border-red-700 hover:text-red-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">管理後台</a>
            `;
        }
    }

    navLinksContainer.innerHTML = linksHtml;

    if (appState.user) {
        authButtonsContainer.innerHTML = `
            <span class="text-sm text-gray-500 mr-2">嗨, ${appState.user.email} (${getRoleLabel(appState.role)})</span>
            <button onclick="logout()" class="text-sm text-gray-700 hover:text-black font-medium">登出</button>
        `;
    } else {
        authButtonsContainer.innerHTML = `
            <a href="#login" class="text-sm text-gray-700 hover:text-black font-medium mr-4">登入</a>
            <a href="#login" class="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition">註冊</a>
        `;
    }
}

// --- 首頁 (文章列表) ---
async function renderHome() {
    appContainer.innerHTML = `
        <div class="mb-8 flex justify-between items-center">
            <h1 class="text-3xl font-bold text-gray-900">最新文章</h1>
            ${appState.user ? `<a href="#create" class="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">撰寫新文章</a>` : ''}
        </div>
        <div id="posts-list" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div class="col-span-full text-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p class="mt-2 text-gray-500">載入文章中...</p>
            </div>
        </div>
    `;

    try {
        const snapshot = await firebase.firestore().collection('posts').orderBy('createdAt', 'desc').get();
        const listContainer = document.getElementById('posts-list');
        
        if (snapshot.empty) {
            listContainer.innerHTML = `<div class="col-span-full text-center text-gray-500 py-12">目前沒有文章。</div>`;
            return;
        }

        listContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const post = doc.data();
            const date = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : '剛剛';
            // 截斷內容作為摘要
            const summary = post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content;
            
            listContainer.innerHTML += `
                <article class="card flex flex-col h-full hover:shadow-lg transition-shadow duration-300 cursor-pointer" onclick="window.location.hash='#post/${doc.id}'">
                    <div class="flex-grow">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">${date}</span>
                            ${post.pinned ? '<span class="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">置頂</span>' : ''}
                        </div>
                        <h2 class="text-xl font-bold text-gray-900 mb-2 hover:text-gray-600 transition">${post.title}</h2>
                        <p class="text-gray-600 text-sm mb-4 line-clamp-3">${summary}</p>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div class="flex items-center">
                            <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                ${post.authorEmail ? post.authorEmail[0].toUpperCase() : 'U'}
                            </div>
                            <span class="ml-2 text-sm text-gray-600 truncate max-w-[100px]">${post.authorEmail.split('@')[0]}</span>
                        </div>
                        <span class="text-indigo-600 text-sm font-medium hover:text-indigo-500">閱讀更多 &rarr;</span>
                    </div>
                </article>
            `;
        });
    } catch (error) {
        console.error("Error fetching posts:", error);
        document.getElementById('posts-list').innerHTML = `<div class="col-span-full text-center text-red-500">載入失敗: ${error.message}</div>`;
    }
}

// --- 文章詳情 ---
async function renderPost(postId) {
    appContainer.innerHTML = `
        <div class="max-w-3xl mx-auto">
            <div id="post-content" class="bg-white shadow overflow-hidden sm:rounded-lg mb-8 p-6 min-h-[300px]">
                <div class="animate-pulse space-y-4">
                    <div class="h-8 bg-gray-200 rounded w-3/4"></div>
                    <div class="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div class="space-y-2 mt-8">
                        <div class="h-4 bg-gray-200 rounded"></div>
                        <div class="h-4 bg-gray-200 rounded"></div>
                        <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
            
            <div class="border-t border-gray-200 pt-8">
                <h3 class="text-lg font-medium text-gray-900 mb-4">留言區</h3>
                ${appState.user 
                    ? `<div class="mb-6">
                        <textarea id="comment-input" rows="3" class="shadow-sm focus:ring-black focus:border-black block w-full sm:text-sm border-gray-300 rounded-md p-2 border" placeholder="分享你的想法..."></textarea>
                        <div class="mt-2 flex justify-end">
                            <button onclick="submitComment('${postId}')" class="bg-black text-white px-4 py-2 rounded text-sm hover:bg-gray-800">發送留言</button>
                        </div>
                       </div>` 
                    : `<div class="bg-gray-50 p-4 rounded text-center text-gray-500 mb-6">請 <a href="#login" class="text-black underline">登入</a> 以參與討論</div>`
                }
                <div id="comments-list" class="space-y-4">
                    <!-- Comments injected here -->
                </div>
            </div>
        </div>
    `;

    try {
        const doc = await firebase.firestore().collection('posts').doc(postId).get();
        if (!doc.exists) {
            appContainer.innerHTML = `<div class="text-center py-12"><h2 class="text-2xl font-bold">文章不存在</h2><a href="#/" class="text-blue-500 mt-4 block">返回首頁</a></div>`;
            return;
        }

        const post = doc.data();
        const date = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : '未知時間';
        
        // Render Post
        const contentHtml = post.content.replace(/\n/g, '<br>'); // Simple formatting
        
        // Action buttons for author/admin
        let actionButtons = '';
        if (appState.user && (appState.user.uid === post.authorId || appState.role === 'admin' || appState.role === 'moderator')) {
            actionButtons = `
                <div class="flex space-x-2 mt-4 pt-4 border-t border-gray-100">
                    ${(appState.role === 'admin' || appState.role === 'moderator') ? `<button onclick="togglePin('${postId}', ${!post.pinned})" class="text-xs text-blue-600 hover:text-blue-800">${post.pinned ? '取消置頂' : '置頂文章'}</button>` : ''}
                    <button onclick="deletePost('${postId}')" class="text-xs text-red-600 hover:text-red-800">刪除文章</button>
                </div>
            `;
        }

        document.getElementById('post-content').innerHTML = `
            <div class="mb-6">
                <h1 class="text-3xl font-bold text-gray-900 mb-2">${post.title}</h1>
                <div class="flex items-center text-sm text-gray-500">
                    <span class="font-medium text-gray-900 mr-2">${post.authorEmail.split('@')[0]}</span>
                    <span>• ${date}</span>
                </div>
            </div>
            <div class="prose max-w-none text-gray-800 leading-relaxed">
                ${contentHtml}
            </div>
            ${actionButtons}
        `;

        // Load Comments
        loadComments(postId);

    } catch (error) {
        console.error(error);
        appContainer.innerHTML = `<div class="text-center text-red-500 py-12">載入錯誤</div>`;
    }
}

async function loadComments(postId) {
    const commentsList = document.getElementById('comments-list');
    const snapshot = await firebase.firestore().collection('posts').doc(postId).collection('comments').orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
        commentsList.innerHTML = `<p class="text-gray-400 text-sm text-center">暫無留言，成為第一個留言的人吧！</p>`;
        return;
    }

    commentsList.innerHTML = '';
    snapshot.forEach(doc => {
        const comment = doc.data();
        const date = comment.createdAt ? new Date(comment.createdAt.seconds * 1000).toLocaleString() : '剛剛';
        commentsList.innerHTML += `
            <div class="bg-gray-50 p-4 rounded-lg">
                <div class="flex justify-between items-start">
                    <span class="font-medium text-sm text-gray-900">${comment.authorEmail.split('@')[0]}</span>
                    <span class="text-xs text-gray-500">${date}</span>
                </div>
                <p class="text-gray-700 mt-1 text-sm">${comment.content}</p>
            </div>
        `;
    });
}

// --- 登入/註冊 ---
function renderLogin() {
    appContainer.innerHTML = `
        <div class="min-h-full flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md border border-gray-100">
                <div>
                    <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">登入帳戶</h2>
                    <p class="mt-2 text-center text-sm text-gray-600">
                        或 <a href="#" onclick="toggleAuthMode('register')" class="font-medium text-black hover:text-gray-700">註冊新帳號</a>
                    </p>
                </div>
                <form class="mt-8 space-y-6" id="auth-form" onsubmit="handleAuth(event, 'login')">
                    <div class="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label for="email-address" class="sr-only">Email address</label>
                            <input id="email-address" name="email" type="email" autocomplete="email" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm" placeholder="電子郵件地址">
                        </div>
                        <div>
                            <label for="password" class="sr-only">Password</label>
                            <input id="password" name="password" type="password" autocomplete="current-password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm" placeholder="密碼">
                        </div>
                    </div>

                    <div>
                        <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black">
                            登入
                        </button>
                    </div>
                </form>
                <div id="auth-message" class="text-center text-sm text-red-500 mt-2"></div>
            </div>
        </div>
    `;
}

function toggleAuthMode(mode) {
    if (mode === 'register') {
        const title = document.querySelector('h2');
        const link = document.querySelector('p a');
        const btn = document.querySelector('button[type="submit"]');
        const form = document.getElementById('auth-form');
        
        title.textContent = '註冊新帳戶';
        link.textContent = '已有帳號？登入';
        link.onclick = () => toggleAuthMode('login');
        btn.textContent = '註冊';
        form.onsubmit = (e) => handleAuth(e, 'register');
    } else {
        renderLogin(); // Reset to login
    }
}

// --- 發布文章 ---
function renderCreatePost() {
    appContainer.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow border border-gray-100">
            <h1 class="text-2xl font-bold mb-6 text-gray-900">發布新文章</h1>
            <form onsubmit="submitPost(event)">
                <div class="mb-4">
                    <label class="block text-gray-700 text-sm font-bold mb-2" for="title">標題</label>
                    <input class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-black" id="title" type="text" placeholder="輸入文章標題" required>
                </div>
                <div class="mb-6">
                    <label class="block text-gray-700 text-sm font-bold mb-2" for="content">內容</label>
                    <textarea class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline focus:border-black h-48" id="content" placeholder="輸入文章內容..." required></textarea>
                </div>
                <div class="flex items-center justify-between">
                    <button class="bg-black hover:bg-gray-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="button" onclick="window.history.back()">
                        取消
                    </button>
                    <button class="bg-black hover:bg-gray-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" type="submit">
                        發布
                    </button>
                </div>
            </form>
        </div>
    `;
}

// --- 管理後台 ---
async function renderAdminDashboard() {
    appContainer.innerHTML = `
        <h1 class="text-2xl font-bold mb-6">管理後台</h1>
        <div class="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
            <div class="px-4 py-5 sm:px-6 border-b border-gray-200">
                <h3 class="text-lg leading-6 font-medium text-gray-900">用戶管理</h3>
            </div>
            <ul id="user-list" class="divide-y divide-gray-200">
                <li class="px-4 py-4 text-center text-gray-500">載入中...</li>
            </ul>
        </div>
    `;

    try {
        const snapshot = await firebase.firestore().collection('users').get();
        const list = document.getElementById('user-list');
        list.innerHTML = '';
        
        snapshot.forEach(doc => {
            const user = doc.data();
            list.innerHTML += `
                <li class="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div>
                        <p class="text-sm font-medium text-black truncate">${user.email}</p>
                        <p class="text-xs text-gray-500">ID: ${doc.id}</p>
                    </div>
                    <div class="flex items-center space-x-2">
                        <select onchange="updateRole('${doc.id}', this.value)" class="text-sm border-gray-300 rounded shadow-sm focus:ring-black focus:border-black p-1">
                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>一般會員</option>
                            <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>壇主</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>系統管理員</option>
                        </select>
                    </div>
                </li>
            `;
        });
    } catch (error) {
        console.error(error);
        document.getElementById('user-list').innerHTML = `<li class="px-4 py-4 text-red-500">無法載入用戶列表 (權限不足或錯誤)</li>`;
    }
}

// --- 配置錯誤提示 ---
function renderConfigError() {
    appContainer.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg border-l-4 border-yellow-400">
            <h1 class="text-2xl font-bold mb-4 text-gray-900">尚未設定 Firebase</h1>
            <p class="mb-4 text-gray-700">請按照以下步驟完成設定：</p>
            <ol class="list-decimal list-inside space-y-2 text-gray-600 mb-6">
                <li>前往 <a href="https://console.firebase.google.com/" target="_blank" class="text-blue-600 underline">Firebase Console</a></li>
                <li>建立一個新專案</li>
                <li>啟用 <strong>Authentication</strong> (Email/Password)</li>
                <li>啟用 <strong>Firestore Database</strong> (以測試模式開始)</li>
                <li>新增 Web 應用程式，複製設定內容</li>
                <li>開啟專案目錄下的 <code class="bg-gray-100 p-1 rounded">js/firebase-config.js</code></li>
                <li>貼上您的 Firebase Config</li>
            </ol>
            <div class="bg-gray-50 p-4 rounded text-sm text-gray-500">
                完成後重新整理此頁面即可開始使用。
            </div>
        </div>
    `;
}

function render404() {
    appContainer.innerHTML = `<div class="text-center py-20"><h1 class="text-4xl font-bold text-gray-900">404</h1><p class="text-gray-500 mt-2">找不到此頁面</p></div>`;
}

// ------------------------------------------------------------------
// 3. 動作處理 (Actions)
// ------------------------------------------------------------------

async function handleAuth(e, mode) {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const msg = document.getElementById('auth-message');
    
    try {
        if (mode === 'login') {
            await firebase.auth().signInWithEmailAndPassword(email, password);
        } else {
            await firebase.auth().createUserWithEmailAndPassword(email, password);
        }
        window.location.hash = '/'; // Redirect home
    } catch (error) {
        msg.textContent = error.message;
    }
}

async function logout() {
    await firebase.auth().signOut();
    window.location.reload();
}

async function submitPost(e) {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;

    try {
        await firebase.firestore().collection('posts').add({
            title,
            content,
            authorId: appState.user.uid,
            authorEmail: appState.user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            pinned: false
        });
        window.location.hash = '/';
    } catch (error) {
        alert('發布失敗: ' + error.message);
    }
}

async function submitComment(postId) {
    const input = document.getElementById('comment-input');
    const content = input.value.trim();
    if (!content) return;

    try {
        await firebase.firestore().collection('posts').doc(postId).collection('comments').add({
            content,
            authorId: appState.user.uid,
            authorEmail: appState.user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        loadComments(postId); // Refresh comments
    } catch (error) {
        alert('留言失敗: ' + error.message);
    }
}

async function deletePost(postId) {
    if (!confirm('確定要刪除這篇文章嗎？')) return;
    try {
        await firebase.firestore().collection('posts').doc(postId).delete();
        window.location.hash = '/';
    } catch (error) {
        alert('刪除失敗');
    }
}

async function togglePin(postId, status) {
    try {
        await firebase.firestore().collection('posts').doc(postId).update({
            pinned: status
        });
        renderPost(postId); // Refresh view
    } catch (error) {
        alert('操作失敗');
    }
}

async function updateRole(userId, newRole) {
    try {
        await firebase.firestore().collection('users').doc(userId).update({
            role: newRole
        });
        alert('角色已更新');
    } catch (error) {
        alert('更新失敗: ' + error.message);
    }
}

// Helpers
function getRoleLabel(role) {
    switch(role) {
        case 'admin': return '系統管理員';
        case 'moderator': return '壇主';
        default: return '會員';
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
