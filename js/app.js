// ------------------------------------------------------------------
// APP 邏輯核心
// ------------------------------------------------------------------

// State Management
const appState = {
    user: null,
    userProfile: null,
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
        try {
            if (user) {
                const db = firebase.firestore();
                const userRef = db.collection('users').doc(user.uid);
                const userDoc = await userRef.get();
                if (userDoc.exists) {
                    appState.role = userDoc.data().role || 'user';
                    appState.userProfile = userDoc.data();
                } else {
                    const role = user.email === 'istage.eason@gmail.com' ? 'admin' : 'user';
                    const profile = {
                        email: user.email,
                        role,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (user.displayName) profile.nickname = user.displayName;
                    await userRef.set(profile, { merge: true });
                    appState.role = role;
                    appState.userProfile = profile;
                }
            } else {
                appState.role = 'guest';
                appState.userProfile = null;
            }
        } catch (error) {
            console.error(error);
            if (user) {
                appState.role = 'user';
                appState.userProfile = {
                    email: user.email,
                    nickname: user.displayName || null
                };
            } else {
                appState.role = 'guest';
                appState.userProfile = null;
            }
        } finally {
            renderNav();
            handleRoute(); // 重新渲染當前頁面
        }
    });

    window.addEventListener('hashchange', handleRoute);
    handleRoute(); // 初始加載
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const [route, ...args] = hash.split('/');
    
    appState.currentRoute = route;
    appState.params = args;

    renderNav(); // Update navigation active state

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
    const current = appState.currentRoute || '';
    // Home route can be '' or '/' depending on how hash is parsed
    const isHome = current === '' || current === '/' || current === '#/';
    const isCreate = current === 'create';
    const isAdmin = current === 'admin';

    // Styles
    const baseClass = "inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border transition-colors duration-200";
    // Active: Bold text, rectangular dark gray border
    const activeClass = "border-gray-600 text-gray-900 font-bold bg-gray-50"; 
    // Inactive: Transparent border, gray text
    const inactiveClass = "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50";
    const adminInactiveClass = "border-transparent text-red-500 hover:text-red-700 hover:bg-red-50";

    let linksHtml = `
        <a href="#/" class="${baseClass} ${isHome ? activeClass : inactiveClass}">首頁</a>
    `;

    if (appState.user) {
        if (appState.userProfile?.canPost !== false) {
            linksHtml += `
                <a href="#create" class="${baseClass} ${isCreate ? activeClass : inactiveClass}">發布文章</a>
            `;
        }
        if (appState.role === 'admin' || appState.role === 'moderator') {
            linksHtml += `
                <a href="#admin" class="${baseClass} ${isAdmin ? activeClass : adminInactiveClass}">管理後台</a>
            `;
        }
    }

    navLinksContainer.innerHTML = linksHtml;

    if (appState.user) {
        ensureProfileModal();
        const nickname = getCurrentNickname();
        const avatarSrc = getCurrentAvatarSrc();
        const avatarInner = avatarSrc
            ? `<img src="${avatarSrc}" alt="avatar" class="h-9 w-9 rounded-full object-cover">`
            : `<div class="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">${nickname ? nickname[0].toUpperCase() : 'U'}</div>`;
        authButtonsContainer.innerHTML = `
            <span class="text-sm text-gray-500 mr-1">嗨, ${nickname}</span>
            <button onclick="openProfileModal()" class="flex items-center" aria-label="大頭照">${avatarInner}</button>
            <button onclick="logout()" class="text-sm text-gray-700 hover:text-black font-medium">登出</button>
        `;
    } else {
        authButtonsContainer.innerHTML = `
            <a href="#login" class="text-sm text-gray-700 hover:text-black font-medium mr-4">登入</a>
            <a href="#register" class="bg-black text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition">註冊</a>
        `;
    }
}

// --- 首頁 (文章列表) ---
async function renderHome() {
    appContainer.innerHTML = `
        <div class="mb-8 flex justify-between items-center">
            <h1 class="text-3xl font-bold text-gray-900">最新文章</h1>
            ${(appState.user && appState.userProfile?.canPost !== false) ? `<a href="#create" class="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">撰寫新文章</a>` : ''}
        </div>
        <div class="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-100">
            <div class="overflow-x-auto">
                <table class="min-w-[1100px] w-full text-xs">
                    <thead class="bg-gray-50 text-gray-600 text-xs">
                        <tr>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">序號</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">暱稱</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">標題圖片</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">日期時間</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">標題</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">說明</th>
                            <th class="text-right font-medium px-4 py-3 whitespace-nowrap">點擊數</th>
                            <th class="text-right font-medium px-4 py-3 whitespace-nowrap">留言數</th>
                            <th class="text-right font-medium px-4 py-3 whitespace-nowrap">評分</th>
                            <th class="text-left font-medium px-4 py-3 whitespace-nowrap">連結</th>
                        </tr>
                    </thead>
                    <tbody id="posts-list" class="divide-y divide-gray-100">
                        <tr>
                            <td class="px-4 py-8 text-center text-gray-500" colspan="10">
                                <div class="flex items-center justify-center space-x-3">
                                    <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                                    <span>載入文章中...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    try {
        const snapshot = await firebase.firestore().collection('posts').orderBy('createdAt', 'desc').get();
        const listContainer = document.getElementById('posts-list');
        
        if (snapshot.empty) {
            listContainer.innerHTML = `<tr><td class="px-4 py-10 text-center text-gray-500" colspan="10">目前沒有文章。</td></tr>`;
            return;
        }

        listContainer.innerHTML = '';
        const posts = [];
        snapshot.forEach(doc => posts.push({ id: doc.id, ...doc.data() }));

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const dateTime = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleString() : '剛剛';
            const summaryRaw = (post.content || '').toString();
            const summary = summaryRaw.length > 60 ? summaryRaw.substring(0, 60) + '...' : summaryRaw;
            const viewCount = Number.isFinite(post.viewCount) ? post.viewCount : 0;
            const rating = Number.isFinite(post.ratingAvg) && post.ratingAvg > 0 ? post.ratingAvg.toFixed(1) : '-';
            
            // Author Avatar Logic
            const authorName = (post.authorName || '未知').toString();
            const authorAvatarRaw = (post.authorAvatarDataUrl || '').toString();
            const authorInitial = authorName[0] ? authorName[0].toUpperCase() : 'U';
            const authorAvatarHtml = authorAvatarRaw
                ? `<img src="${authorAvatarRaw}" alt="${authorName}" class="h-8 w-8 rounded-full object-cover border border-gray-200 mr-2 flex-shrink-0">`
                : `<div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 mr-2 flex-shrink-0">${authorInitial}</div>`;

            const authorLabel = (post.authorName || post.authorEmail || 'U').toString();
            const fallback = authorLabel[0] ? authorLabel[0].toUpperCase() : 'U';
            const imgSrc = (post.imageDataUrl || post.authorAvatarDataUrl || '').toString();
            const imgContent = imgSrc
                ? `<img src="${imgSrc}" alt="img" class="h-10 w-[60px] rounded object-cover border border-gray-200">`
                : `<div class="h-10 w-[60px] rounded bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">${fallback}</div>`;
            const imgHtml = `<a href="#post/${post.id}" class="block hover:opacity-80 transition">${imgContent}</a>`;
            listContainer.innerHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-gray-700">${i + 1}</td>
                    <td class="px-4 py-3">
                        <div class="flex items-center">
                            ${authorAvatarHtml}
                            <span class="text-gray-900 font-medium truncate max-w-[120px]" title="${authorName}">${authorName}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3">${imgHtml}</td>
                    <td class="px-4 py-3 text-gray-700 whitespace-nowrap">${dateTime}</td>
                    <td class="px-4 py-3">
                        <a href="#post/${post.id}" class="block hover:underline">
                            <div class="font-medium text-gray-900 truncate max-w-[220px]">${post.title || ''}</div>
                        </a>
                    </td>
                    <td class="px-4 py-3 text-gray-600">
                        <div class="truncate max-w-[420px]">${summary}</div>
                    </td>
                    <td class="px-4 py-3 text-right text-gray-700 tabular-nums">${viewCount}</td>
                    <td class="px-4 py-3 text-right text-gray-700 tabular-nums" id="post-comment-count-${post.id}">-</td>
                    <td class="px-4 py-3 text-right text-gray-700 tabular-nums">${rating}</td>
                    <td class="px-4 py-3">
                        <div class="flex items-center space-x-3">
                            <a class="text-indigo-600 hover:text-indigo-500 font-medium" href="#post/${post.id}">開啟</a>
                            ${(appState.role === 'admin' || appState.role === 'moderator' || (appState.user && appState.user.uid === post.authorId)) ? 
                                `<button onclick="deletePost('${post.id}')" class="text-red-600 hover:text-red-800 font-medium text-xs">刪除</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }
        loadPostCommentCounts(posts.map(p => p.id));
    } catch (error) {
        console.error("Error fetching posts:", error);
        document.getElementById('posts-list').innerHTML = `<tr><td class="px-4 py-10 text-center text-red-500" colspan="10">載入失敗: ${error.message}</td></tr>`;
    }
}

async function loadPostCommentCounts(ids) {
    try {
        const db = firebase.firestore();
        for (const postId of ids) {
            const snap = await db.collection('posts').doc(postId).collection('comments').get();
            let count = 0;
            snap.forEach(d => {
                const c = d.data();
                const deletedByRole = c.deletedByRole || null;
                const excluded = c.deletedAt && (deletedByRole === 'admin' || deletedByRole === 'moderator');
                if (!excluded) count += 1;
            });
            const cell = document.getElementById(`post-comment-count-${postId}`);
            if (cell) cell.textContent = String(count);
        }
    } catch (e) {
        // ignore
    }
}

async function incrementPostViewCount(postId) {
    try {
        const now = Date.now();
        if (appState.lastViewedPostId === postId && now - (appState.lastViewedPostAt || 0) < 30000) return;
        appState.lastViewedPostId = postId;
        appState.lastViewedPostAt = now;
        const db = firebase.firestore();
        await db.runTransaction(async (tx) => {
            const ref = db.collection('posts').doc(postId);
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const data = snap.data() || {};
            const current = Number.isFinite(data.viewCount) ? data.viewCount : 0;
            tx.update(ref, { viewCount: current + 1 });
        });
    } catch (e) {
        // ignore
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
                    ? (appState.userProfile?.canComment !== false
                        ? `<div class="mb-6">
                            <textarea id="comment-input" rows="3" class="shadow-sm focus:ring-black focus:border-black block w-full sm:text-sm border-gray-300 rounded-md p-2 border" placeholder="分享你的想法..."></textarea>
                            <div class="mt-2 flex justify-end">
                                <button onclick="submitComment('${postId}')" class="bg-black text-white px-4 py-2 rounded text-sm hover:bg-gray-800">發送留言</button>
                            </div>
                           </div>`
                        : `<div class="bg-gray-50 p-4 rounded text-center text-gray-500 mb-6">您沒有留言權限</div>`)
                    : `<div class="bg-gray-50 p-4 rounded text-center text-gray-500 mb-6">請 <a href="#login" class="text-black underline">登入</a> 以參與討論</div>`
                }
                <div id="comments-list" class="space-y-4">
                    <!-- Comments injected here -->
                </div>
            </div>
        </div>
    `;

    try {
        const postRef = firebase.firestore().collection('posts').doc(postId);
        const doc = await postRef.get();
        if (!doc.exists) {
            appContainer.innerHTML = `<div class="text-center py-12"><h2 class="text-2xl font-bold">文章不存在</h2><a href="#/" class="text-blue-500 mt-4 block">返回首頁</a></div>`;
            return;
        }

        const post = doc.data();
        incrementPostViewCount(postId);
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
                    <span class="font-medium text-gray-900 mr-2">${post.authorName || post.authorEmail.split('@')[0]}</span>
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
        const canDelete = appState.user && !comment.deletedAt && (appState.user.uid === comment.authorId || appState.role === 'admin' || appState.role === 'moderator');
        const deletedLabel = comment.deletedAt ? '此留言已被刪除' : '';
        commentsList.innerHTML += `
            <div class="bg-gray-50 p-4 rounded-lg">
                <div class="flex justify-between items-start">
                    <span class="font-medium text-sm text-gray-900">${comment.authorName || comment.authorEmail.split('@')[0]}</span>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-500">${date}</span>
                        ${canDelete ? `<button onclick="deleteComment('${postId}', '${doc.id}')" class="text-xs text-red-600 hover:text-red-800">刪除</button>` : ''}
                    </div>
                </div>
                ${comment.deletedAt ? `<p class="text-gray-400 mt-1 text-sm">${deletedLabel}</p>` : `<p class="text-gray-700 mt-1 text-sm">${comment.content}</p>`}
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
                        <div id="nickname-field" class="hidden">
                            <label for="nickname" class="sr-only">暱稱</label>
                            <input id="nickname" name="nickname" type="text" class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm" placeholder="暱稱 (不可重複)">
                        </div>
                        <div>
                            <label for="email-address" class="sr-only">Email address</label>
                            <input id="email-address" name="email" type="email" autocomplete="email" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm" placeholder="電子郵件地址">
                        </div>
                        <div class="relative">
                            <label for="password" class="sr-only">Password</label>
                            <input id="password" name="password" type="password" autocomplete="current-password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-black focus:border-black focus:z-10 sm:text-sm pr-16" placeholder="密碼">
                            <button type="button" id="toggle-password" onclick="togglePasswordVisibility()" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">顯示</button>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <label class="flex items-center space-x-2 text-sm text-gray-700">
                            <input id="remember" name="remember" type="checkbox" class="h-4 w-4 text-black border-gray-300 rounded">
                            <span>記住我</span>
                        </label>
                        <span></span>
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

function renderRegister() {
    renderLogin();
    toggleAuthMode('register');
}

function toggleAuthMode(mode) {
    if (mode === 'register') {
        const title = document.querySelector('h2');
        const link = document.querySelector('p a');
        const btn = document.querySelector('button[type="submit"]');
        const form = document.getElementById('auth-form');
        const nicknameField = document.getElementById('nickname-field');
        const emailInput = document.getElementById('email-address');
        const passwordInput = document.getElementById('password');
        
        title.textContent = '註冊新帳戶';
        link.textContent = '已有帳號？登入';
        link.onclick = () => toggleAuthMode('login');
        btn.textContent = '註冊';
        form.onsubmit = (e) => handleAuth(e, 'register');
        
        // 顯示暱稱欄位並調整樣式
        nicknameField.classList.remove('hidden');
        nicknameField.querySelector('input').required = true;
        emailInput.classList.remove('rounded-t-md');
        passwordInput.classList.add('rounded-b-md');
    } else {
        renderLogin(); // Reset to login
    }
}

// --- 發布文章 ---
function previewPostImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_WIDTH = 360;
            const MAX_HEIGHT = 240;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            
            const preview = document.getElementById('image-preview');
            preview.src = dataUrl;
            preview.classList.remove('hidden');
            document.getElementById('post-image-data').value = dataUrl;
            document.getElementById('preview-placeholder').classList.add('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderCreatePost() {
    if (appState.userProfile?.canPost === false) {
        alert('您已被禁止發文');
        window.location.hash = '/';
        return;
    }
    appContainer.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow border border-gray-100">
            <h1 class="text-2xl font-bold mb-6 text-gray-900">發布新文章</h1>
            <form onsubmit="submitPost(event)">
                <div class="mb-6">
                    <label class="block text-gray-700 text-sm font-bold mb-2">標題圖片 (建議 360x240)</label>
                    <div class="flex flex-col sm:flex-row gap-4 items-start">
                        <div class="w-[360px] h-[240px] bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden relative shrink-0">
                            <span id="preview-placeholder" class="text-gray-400 text-sm pointer-events-none">圖片預覽</span>
                            <img id="image-preview" class="absolute inset-0 w-full h-full object-contain hidden bg-white">
                        </div>
                        <div class="flex-1 space-y-2">
                            <input type="file" accept="image/*" class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 cursor-pointer" onchange="previewPostImage(event)">
                            <p class="text-xs text-gray-500">支援 JPG, PNG 格式。圖片將自動調整為適合大小。</p>
                            <input type="hidden" id="post-image-data">
                        </div>
                    </div>
                </div>
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
                ${appState.role === 'admin' ? '' : '<p class="mt-1 text-sm text-gray-500">只有系統管理員可以修改角色</p>'}
            </div>
            <ul id="user-list" class="divide-y divide-gray-200">
                <li class="px-4 py-4 text-center text-gray-500">載入中...</li>
            </ul>
        </div>
        <div id="user-edit-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white w-full max-w-sm rounded-lg shadow-lg p-6">
                <h3 class="text-lg font-medium text-gray-900 mb-4">編輯用戶</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">大頭照</label>
                        <div class="flex items-center space-x-3">
                            <div class="h-12 w-12 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center" id="user-edit-avatar-preview-wrap">
                                <img id="user-edit-avatar-preview" class="h-full w-full object-cover hidden">
                                <span id="user-edit-avatar-fallback" class="text-sm text-gray-600">?</span>
                            </div>
                            <input id="user-edit-avatar" type="file" accept="image/*" onchange="onUserAvatarChange(event)">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">暱稱</label>
                        <input id="user-edit-nickname" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="輸入暱稱">
                    </div>
                    <div class="flex justify-end space-x-2">
                        <button onclick="closeUserEditModal()" class="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100">取消</button>
                        <button onclick="saveUserEdit()" class="px-4 py-2 rounded bg-black text-white hover:bg-gray-800">儲存</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    try {
        const snapshot = await firebase.firestore().collection('users').get();
        const list = document.getElementById('user-list');
        const roleOrder = { admin: 0, moderator: 1, user: 2 };
        const users = [];
        snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        users.sort((a, b) => {
            const ra = roleOrder[a.role] ?? 99;
            const rb = roleOrder[b.role] ?? 99;
            if (ra !== rb) return ra - rb;
            const na = (a.nickname || a.email || '').toLowerCase();
            const nb = (b.nickname || b.email || '').toLowerCase();
            return na.localeCompare(nb);
        });
        list.innerHTML = '';
        for (const user of users) {
            const isAdmin = user.role === 'admin';
            const canPost = user.canPost !== false;
            const canComment = user.canComment !== false;
            
            list.innerHTML += `
                <li class="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div class="flex items-center space-x-3">
                        <div class="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                            ${(user.avatarDataUrl || user.photoURL) ? `<img src="${user.avatarDataUrl || user.photoURL}" alt="avatar" class="h-full w-full object-cover rounded-full">` : (user.nickname || user.email || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                            <p class="text-sm font-medium text-black truncate">${user.nickname || '未設定暱稱'}</p>
                            <p class="text-xs text-gray-500 truncate max-w-[220px]">${user.email || ''}</p>
                            <p class="text-xs text-gray-400">ID: ${user.id}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        ${!isAdmin ? `
                            <label class="inline-flex items-center space-x-1 mr-2 text-xs text-gray-700">
                                <input type="checkbox" ${canPost ? 'checked' : ''} onchange="updateUserPermission('${user.id}', 'canPost', this.checked)" class="rounded border-gray-300 text-black focus:ring-black">
                                <span>發表文章</span>
                            </label>
                            <label class="inline-flex items-center space-x-1 mr-2 text-xs text-gray-700">
                                <input type="checkbox" ${canComment ? 'checked' : ''} onchange="updateUserPermission('${user.id}', 'canComment', this.checked)" class="rounded border-gray-300 text-black focus:ring-black">
                                <span>文章留言</span>
                            </label>
                        ` : ''}
                        <select onchange="updateRole('${user.id}', this.value)" class="text-sm border-gray-300 rounded shadow-sm focus:ring-black focus:border-black p-1 ${appState.role === 'admin' ? '' : 'opacity-60 cursor-not-allowed'}" ${appState.role === 'admin' ? '' : 'disabled'}>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>系統管理員</option>
                            <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>壇主</option>
                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>訪客</option>
                        </select>
                        <button onclick="editUser('${user.id}')" class="text-sm px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 ${appState.role === 'admin' ? '' : 'opacity-60 cursor-not-allowed'}" ${appState.role === 'admin' ? '' : 'disabled'}>編輯</button>
                        ${user.role === 'admin' ? '' : `<button onclick="deleteUser('${user.id}')" class="text-sm px-2 py-1 rounded border border-gray-300 text-red-600 hover:bg-red-50 ${appState.role === 'admin' ? '' : 'opacity-60 cursor-not-allowed'}" ${appState.role === 'admin' ? '' : 'disabled'}>刪除</button>`}
                    </div>
                </li>
            `;
        }
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
    const remember = !!(e.target.remember && e.target.remember.checked);
    
    try {
        await firebase.auth().setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        if (mode === 'login') {
            await firebase.auth().signInWithEmailAndPassword(email, password);
        } else {
            // 註冊邏輯
            const nickname = document.getElementById('nickname').value.trim();
            if (!nickname) {
                throw new Error('請輸入暱稱');
            }
            if (/(管理員|壇主)/i.test(nickname)) {
                throw new Error('暱稱不可包含「管理員」或「壇主」');
            }
            
            // 檢查暱稱唯一性
            const db = firebase.firestore();
            const nicknameSnapshot = await db.collection('users').where('nickname', '==', nickname).get();
            if (!nicknameSnapshot.empty) {
                throw new Error('此暱稱已被使用，請更換一個');
            }

            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // 更新 Auth Profile
            await user.updateProfile({
                displayName: nickname
            });

            // 建立用戶資料
            try {
                await db.collection('users').doc(user.uid).set({
                    email: user.email,
                    nickname: nickname,
                    role: 'user',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error(error);
            }
        }
        window.location.hash = '/'; // Redirect home
    } catch (error) {
        msg.textContent = formatAuthError(error, mode);
    }
}

function formatAuthError(error, mode) {
    const code = error?.code || '';
    if (code === 'permission-denied') return '權限不足：請確認 Firestore 規則已發布。';
    if (code === 'auth/invalid-login-credentials') {
        return mode === 'login'
            ? '帳號或密碼錯誤，或該帳號尚未註冊。'
            : '註冊失敗：請確認 Email 格式正確，且此 Email 尚未被註冊。';
    }
    if (code === 'auth/email-already-in-use') return '此 Email 已被註冊，請改用登入。';
    if (code === 'auth/weak-password') return '密碼強度不足，請使用至少 6 個字元。';
    if (code === 'auth/invalid-email') return 'Email 格式不正確。';
    if (code === 'auth/operation-not-allowed') return 'Firebase 尚未啟用 Email/Password 登入，請至 Firebase Console 開啟。';
    if (code === 'auth/network-request-failed') return '網路連線失敗，請檢查網路或防火牆設定。';
    return error?.message || '發生未知錯誤，請稍後再試。';
}

async function logout() {
    await firebase.auth().signOut();
    window.location.reload();
}

async function submitPost(e) {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const content = document.getElementById('content').value;
    const imageDataUrl = document.getElementById('post-image-data').value || null;

    try {
        await firebase.firestore().collection('posts').add({
            title,
            content,
            imageDataUrl,
            authorId: appState.user.uid,
            authorEmail: appState.user.email,
            authorName: appState.userProfile?.nickname || appState.user.displayName || appState.user.email.split('@')[0],
            authorAvatarDataUrl: appState.userProfile?.avatarDataUrl || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            pinned: false,
            viewCount: 0,
            ratingAvg: 0,
            ratingCount: 0
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
            authorName: appState.userProfile?.nickname || appState.user.displayName || appState.user.email.split('@')[0],
            deletedAt: null,
            deletedByRole: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        loadComments(postId); // Refresh comments
    } catch (error) {
        alert('留言失敗: ' + error.message);
    }
}

async function deleteComment(postId, commentId) {
    try {
        if (!appState.user) return;
        const ref = firebase.firestore().collection('posts').doc(postId).collection('comments').doc(commentId);
        const snap = await ref.get();
        if (!snap.exists) return;
        const data = snap.data();
        const isStaff = appState.role === 'admin' || appState.role === 'moderator';
        const isAuthor = data.authorId === appState.user.uid;
        if (!isStaff && !isAuthor) {
            alert('權限不足');
            return;
        }
        if (!confirm('確定要刪除這則留言嗎？')) return;
        const deletedByRole = isStaff ? appState.role : 'self';
        await ref.set({
            content: '',
            deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deletedById: appState.user.uid,
            deletedByRole
        }, { merge: true });
        loadComments(postId);
    } catch (error) {
        alert('刪除失敗: ' + error.message);
    }
}

async function deletePost(postId) {
    if (!confirm('確定要刪除這篇文章嗎？')) return;
    try {
        await firebase.firestore().collection('posts').doc(postId).delete();
        // 如果是在文章詳情頁，刪除後跳轉回首頁；如果在列表頁，重新渲染列表
        if (appState.currentRoute === 'post') {
            window.location.hash = '/';
        } else {
            renderHome(); // 重新渲染列表以移除已刪除的文章
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('刪除失敗: ' + error.message);
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
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以修改角色');
            return;
        }
        await firebase.firestore().collection('users').doc(userId).set({ role: newRole }, { merge: true });
        // Refresh admin dashboard to update checkboxes visibility (if role changes to/from admin)
        renderAdminDashboard();
        alert('角色已更新');
    } catch (error) {
        alert('更新失敗: ' + error.message);
    }
}

async function updateUserPermission(userId, field, value) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以修改權限');
            // Revert checkbox state
            renderAdminDashboard();
            return;
        }
        await firebase.firestore().collection('users').doc(userId).set({ [field]: value }, { merge: true });
    } catch (error) {
        alert('權限更新失敗: ' + error.message);
        renderAdminDashboard(); // Revert on error
    }
}

async function editUser(userId) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以編輯用戶');
            return;
        }
        const db = firebase.firestore();
        const ref = db.collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) {
            alert('找不到用戶資料');
            return;
        }
        const modal = document.getElementById('user-edit-modal');
        modal.dataset.userId = userId;
        const data = snap.data();
        document.getElementById('user-edit-nickname').value = data.nickname || '';
        const img = document.getElementById('user-edit-avatar-preview');
        const fb = document.getElementById('user-edit-avatar-fallback');
        const avatar = data.avatarDataUrl || data.photoURL || '';
        if (avatar) {
            img.src = avatar;
            img.classList.remove('hidden');
            fb.classList.add('hidden');
        } else {
            img.src = '';
            img.classList.add('hidden');
            fb.textContent = (data.nickname || data.email || 'U')[0].toUpperCase();
            fb.classList.remove('hidden');
        }
        const fileInput = document.getElementById('user-edit-avatar');
        if (fileInput) fileInput.value = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        alert('編輯失敗: ' + error.message);
    }
}

function closeUserEditModal() {
    const modal = document.getElementById('user-edit-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    delete modal.dataset.userId;
}

function onUserAvatarChange(e) {
    const file = e.target.files && e.target.files[0];
    const img = document.getElementById('user-edit-avatar-preview');
    const fb = document.getElementById('user-edit-avatar-fallback');
    if (file) {
        img.src = URL.createObjectURL(file);
        img.classList.remove('hidden');
        fb.classList.add('hidden');
    }
}

async function fileToAvatarDataUrl(file) {
    const raw = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('讀取圖片失敗'));
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('載入圖片失敗'));
        image.src = raw;
    });

    const maxSize = 128;
    const scale = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
}

async function saveUserEdit() {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以編輯用戶');
            return;
        }
        const modal = document.getElementById('user-edit-modal');
        const userId = modal.dataset.userId;
        const nickname = document.getElementById('user-edit-nickname').value.trim();
        if (!nickname) {
            alert('暱稱不可為空');
            return;
        }
        if (/(管理員|壇主)/i.test(nickname)) {
            alert('暱稱不可包含「管理員」或「壇主」');
            return;
        }
        const db = firebase.firestore();
        const dup = await db.collection('users').where('nickname', '==', nickname).get();
        let occupied = false;
        dup.forEach(d => {
            if (d.id !== userId) occupied = true;
        });
        if (occupied) {
            alert('此暱稱已被使用，請更換');
            return;
        }
        let avatarDataUrl;
        const fileInput = document.getElementById('user-edit-avatar');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (file) {
            avatarDataUrl = await fileToAvatarDataUrl(file);
            if (avatarDataUrl && avatarDataUrl.length > 900000) {
                alert('圖片過大，請換小一點的圖片');
                return;
            }
        }
        const payload = avatarDataUrl ? { nickname, avatarDataUrl } : { nickname };
        await db.collection('users').doc(userId).set(payload, { merge: true });
        if (userId === appState.user?.uid) {
            try { await appState.user.updateProfile({ displayName: nickname }); } catch (e) {}
        }
        closeUserEditModal();
        renderAdminDashboard();
    } catch (error) {
        alert('儲存失敗: ' + error.message);
    }
}
async function deleteUser(userId) {
    try {
        if (appState.role !== 'admin') {
            alert('只有系統管理員可以刪除用戶');
            return;
        }
        if (userId === appState.user?.uid) {
            alert('不能刪除自己');
            return;
        }
        if (!confirm('確定刪除此用戶資料？此操作無法復原')) return;
        const ref = firebase.firestore().collection('users').doc(userId);
        const snap = await ref.get();
        if (!snap.exists) {
            alert('找不到用戶資料');
            return;
        }
        const data = snap.data();
        if (data.role === 'admin') {
            alert('無法刪除系統管理員');
            return;
        }
        await ref.delete();
        renderAdminDashboard();
    } catch (error) {
        alert('刪除失敗: ' + error.message);
    }
}

function getCurrentNickname() {
    if (!appState.user) return '';
    const raw = appState.userProfile?.nickname || appState.user.displayName || appState.user.email || '';
    return raw.includes('@') ? raw.split('@')[0] : raw;
}

function getCurrentAvatarSrc() {
    if (!appState.user) return '';
    return appState.userProfile?.avatarDataUrl || appState.userProfile?.photoURL || '';
}

function ensureProfileModal() {
    if (document.getElementById('profile-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'profile-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white w-full max-w-md rounded-lg shadow-lg p-6">
            <div class="flex items-start justify-between">
                <h3 class="text-lg font-medium text-gray-900">個人資料</h3>
                <button onclick="closeProfileModal()" class="text-gray-500 hover:text-black">✕</button>
            </div>
            <div class="mt-4 space-y-4">
                <div class="flex items-center space-x-3">
                    <div class="h-14 w-14 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center" id="profile-avatar-preview-wrap">
                        <img id="profile-avatar-preview" class="h-full w-full object-cover hidden">
                        <span id="profile-avatar-fallback" class="text-sm text-gray-600">?</span>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm text-gray-700 mb-1">大頭照</div>
                        <input id="profile-avatar" type="file" accept="image/*" onchange="onProfileAvatarChange(event)">
                    </div>
                </div>

                <div>
                    <label class="block text-sm text-gray-700 mb-1">暱稱</label>
                    <input id="profile-nickname" type="text" class="w-full border rounded px-3 py-2 focus:ring-black focus:border-black" placeholder="輸入暱稱">
                </div>

                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-700">級別</div>
                    <div class="flex items-center space-x-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 2l2.2 4.7 5.1.7-3.7 3.6.9 5.1L12 13.9 7.5 16.1l.9-5.1L4.7 7.4l5.1-.7L12 2z" fill="#cd7f32"/>
                            <path d="M7 21h10" stroke="#cd7f32" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <span class="text-sm font-medium text-gray-900">銅牌</span>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="text-sm text-gray-700">留言次數</div>
                    <div id="profile-comment-count" class="text-sm font-medium text-gray-900">載入中...</div>
                </div>

                <div class="flex items-center justify-between pt-2">
                    <button onclick="resetMyPassword()" class="text-sm px-3 py-2 rounded border border-gray-300 hover:bg-gray-100">重設密碼</button>
                    <button onclick="saveMyProfile()" class="text-sm px-4 py-2 rounded bg-black text-white hover:bg-gray-800">儲存</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function openProfileModal() {
    if (!appState.user) return;
    ensureProfileModal();
    const modal = document.getElementById('profile-modal');
    const nicknameInput = document.getElementById('profile-nickname');
    const fileInput = document.getElementById('profile-avatar');
    const img = document.getElementById('profile-avatar-preview');
    const fb = document.getElementById('profile-avatar-fallback');
    const avatar = getCurrentAvatarSrc();
    nicknameInput.value = appState.userProfile?.nickname || appState.user.displayName || '';
    if (fileInput) fileInput.value = '';
    if (avatar) {
        img.src = avatar;
        img.classList.remove('hidden');
        fb.classList.add('hidden');
    } else {
        img.src = '';
        img.classList.add('hidden');
        fb.textContent = (getCurrentNickname() || 'U')[0].toUpperCase();
        fb.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadMyCommentCount(appState.user.uid);
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function onProfileAvatarChange(e) {
    const file = e.target.files && e.target.files[0];
    const img = document.getElementById('profile-avatar-preview');
    const fb = document.getElementById('profile-avatar-fallback');
    if (file) {
        img.src = URL.createObjectURL(file);
        img.classList.remove('hidden');
        fb.classList.add('hidden');
    }
}

async function validateNickname(nickname, excludeUserId) {
    const trimmed = (nickname || '').trim();
    if (!trimmed) return { ok: false, message: '暱稱不可為空' };
    if (/(管理員|壇主)/i.test(trimmed)) return { ok: false, message: '暱稱不可包含「管理員」或「壇主」' };
    const snap = await firebase.firestore().collection('users').where('nickname', '==', trimmed).get();
    let occupied = false;
    snap.forEach(d => {
        if (d.id !== excludeUserId) occupied = true;
    });
    if (occupied) return { ok: false, message: '此暱稱已被使用，請更換' };
    return { ok: true, nickname: trimmed };
}

async function saveMyProfile() {
    try {
        if (!appState.user) return;
        const nicknameRaw = document.getElementById('profile-nickname').value;
        const result = await validateNickname(nicknameRaw, appState.user.uid);
        if (!result.ok) {
            alert(result.message);
            return;
        }
        let avatarDataUrl;
        const fileInput = document.getElementById('profile-avatar');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (file) {
            avatarDataUrl = await fileToAvatarDataUrl(file);
            if (avatarDataUrl && avatarDataUrl.length > 900000) {
                alert('圖片過大，請換小一點的圖片');
                return;
            }
        }
        const payload = avatarDataUrl ? { nickname: result.nickname, avatarDataUrl } : { nickname: result.nickname };
        await firebase.firestore().collection('users').doc(appState.user.uid).set(payload, { merge: true });
        try { await appState.user.updateProfile({ displayName: result.nickname }); } catch (e) {}
        appState.userProfile = { ...(appState.userProfile || {}), ...payload, email: appState.user.email };
        renderNav();
        closeProfileModal();
    } catch (error) {
        alert('儲存失敗: ' + error.message);
    }
}

async function resetMyPassword() {
    try {
        if (!appState.user?.email) return;
        await firebase.auth().sendPasswordResetEmail(appState.user.email);
        alert('已寄出重設密碼信件，請至信箱查看');
    } catch (error) {
        alert('重設密碼失敗: ' + (error?.message || '未知錯誤'));
    }
}

async function loadMyCommentCount(userId) {
    const el = document.getElementById('profile-comment-count');
    if (!el) return;
    try {
        el.textContent = '載入中...';
        const snap = await firebase.firestore().collectionGroup('comments').where('authorId', '==', userId).get();
        let count = 0;
        snap.forEach(d => {
            const c = d.data();
            const deletedByRole = c.deletedByRole || null;
            const excluded = c.deletedAt && (deletedByRole === 'admin' || deletedByRole === 'moderator');
            if (!excluded) count += 1;
        });
        el.textContent = String(count);
    } catch (error) {
        el.textContent = '-';
    }
}

// Helpers
function getRoleLabel(role) {
    switch(role) {
        case 'admin': return '系統管理員';
        case 'moderator': return '壇主';
        case 'user': return '訪客';
        default: return '訪客';
    }
}

function togglePasswordVisibility() {
    const input = document.getElementById('password');
    const btn = document.getElementById('toggle-password');
    if (!input || !btn) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '隱藏';
    } else {
        input.type = 'password';
        btn.textContent = '顯示';
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
