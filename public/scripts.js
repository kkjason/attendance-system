// Google Sheets 配置（待更新）
const GOOGLE_SHEETS_CONFIG = {
    CLIENT_ID: 'YOUR_CLIENT_ID', // 從 Google Cloud Console 獲取
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets'
};

let gapi_initialized = false;
let google_signed_in = false;
let attendanceRecords = JSON.parse(localStorage.getItem('attendanceRecords') || '[]');
const ADMIN_PASSWORD = 'admin123'; // 臨時密碼，後續應使用 Firebase Authentication

// 獲取設備指紋
function getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);

    return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: 'UTC+08:00'
    };
}

// 更新當前時間
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeString;
}

// 顯示狀態訊息
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

// 提交打卡（暫時儲存到 localStorage）
function submitAttendance(type) {
    const location = document.getElementById('location').value;
    const employeeName = document.getElementById('employeeName').value;

    if (!location || !employeeName) {
        showStatus('請填寫完整資訊！', 'error');
        return;
    }

    const deviceFingerprint = getDeviceFingerprint();
    const now = new Date();
    const today = now.toDateString();
    const recentRecord = attendanceRecords.find(record => 
        record.employeeName === employeeName && 
        record.date === today && 
        record.type === type &&
        (now - new Date(record.timestamp)) < 300000
    );

    if (recentRecord) {
        showStatus(`您已在5分鐘內完成${type}打卡！`, 'error');
        return;
    }

    const record = {
        id: Date.now() + Math.random(),
        employeeName,
        location,
        type,
        timestamp: now.toISOString(),
        date: today,
        ip: 'N/A', // 待後端提供真實 IP
        deviceFingerprint
    };

    attendanceRecords.push(record);
    localStorage.setItem('attendanceRecords', JSON.stringify(attendanceRecords));
    showStatus(`${employeeName} 於 ${location} ${type}打卡成功！(本地儲存)`, 'success');
    document.getElementById('attendanceForm').reset();
}

// 初始化 Google API（僅初始化，待後端整合）
async function initializeGoogleAPI() {
    if (!window.gapi) {
        showStatus('Google API 腳本載入失敗', 'error');
        return;
    }

    try {
        await new Promise((resolve, reject) => {
            gapi.load('client:auth2', {
                callback: resolve,
                onerror: () => reject(new Error('gapi.load 失敗'))
            });
        });

        await gapi.client.init({
            clientId: GOOGLE_SHEETS_CONFIG.CLIENT_ID,
            discoveryDocs: [GOOGLE_SHEETS_CONFIG.DISCOVERY_DOC],
            scope: GOOGLE_SHEETS_CONFIG.SCOPES
        });

        gapi_initialized = true;
        const authInstance = gapi.auth2.getAuthInstance();
        google_signed_in = authInstance.isSignedIn.get();
        updateGoogleStatus();
    } catch (error) {
        showStatus(`Google API 初始化失敗：${error.message || '未知錯誤'}`, 'error');
    }
}

// 更新 Google 連線狀態
function updateGoogleStatus() {
    const statusElement = document.getElementById('googleStatus');
    const signInBtn = document.getElementById('googleSignInBtn');
    const signOutBtn = document.getElementById('googleSignOutBtn');

    if (!gapi_initialized) {
        statusElement.textContent = '初始化中...';
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'none';
    } else if (google_signed_in) {
        statusElement.textContent = '已連線';
        signInBtn.style.display = 'none';
        signOutBtn.style.display = 'inline-block';
    } else {
        statusElement.textContent = '未連線';
        signInBtn.style.display = 'inline-block';
        signOutBtn.style.display = 'none';
    }
}

// Google 登入
async function handleGoogleSignIn() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signIn();
        google_signed_in = true;
        updateGoogleStatus();
        showStatus('Google Sheets 連線成功！', 'success');
    } catch (error) {
        showStatus('Google 登入失敗，請稍後再試', 'error');
    }
}

// Google 登出
async function handleGoogleSignOut() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        google_signed_in = false;
        updateGoogleStatus();
        showStatus('已中斷 Google 連線', 'success');
    } catch (error) {
        showStatus('Google 登出失敗，請稍後再試', 'error');
    }
}

// 管理員登入
function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    if (password === ADMIN_PASSWORD) {
        document.getElementById('adminPanel').style.display = 'none';
        document.getElementById('recordsPanel').style.display = 'block';
        displayRecords();
        showStatus('管理員登入成功！', 'success');
    } else {
        showStatus('密碼錯誤！', 'error');
    }
}

// 顯示記錄
function displayRecords(filteredRecords = null) {
    const records = filteredRecords || attendanceRecords;
    const recordsList = document.getElementById('recordsList');
    const recordsStats = document.getElementById('recordsStats');

    if (records.length === 0) {
        recordsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">目前沒有打卡記錄</p>';
        recordsStats.textContent = '總計：0 筆記錄';
        return;
    }

    const sortedRecords = records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    let html = '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
    html += '<thead><tr style="background: #e9ecef;">';
    html += '<th style="border: 1px solid #ddd; padding: 8px;">時間</th>';
    html += '<th style="border: 1px solid #ddd; padding: 8px;">姓名</th>';
    html += '<th style="border: 1px solid #ddd; padding: 8px;">地點</th>';
    html += '<th style="border: 1px solid #ddd; padding: 8px;">類型</th>';
    html += '<th style="border: 1px solid #ddd; padding: 8px;">IP</th>';
    html += '<th style="border: 1px solid #ddd; padding: 8px;">設備</th>';
    html += '</tr></thead><tbody>';

    sortedRecords.forEach(record => {
        const date = new Date(record.timestamp);
        const timeStr = date.toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const typeColor = record.type === '上班' ? '#28a745' : '#dc3545';
        html += `<tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${timeStr}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.employeeName}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.location}</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: ${typeColor};">${record.type}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.ip}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${record.deviceFingerprint.platform}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    recordsList.innerHTML = html;

    const checkInCount = records.filter(r => r.type === '上班').length;
    const checkOutCount = records.filter(r => r.type === '下班').length;
    const uniqueEmployees = new Set(records.map(r => r.employeeName)).size;
    recordsStats.innerHTML = `<strong>統計資訊:</strong> 總計 ${records.length} 筆記錄 | 上班 ${checkInCount} 次 | 下班 ${checkOutCount} 次 | 員工數 ${uniqueEmployees} 人`;
}

// 篩選記錄
function applyFilter() {
    const filterDate = document.getElementById('filterDate').value;
    const filterName = document.getElementById('filterName').value.toLowerCase();

    let filteredRecords = attendanceRecords;

    if (filterDate) {
        filteredRecords = filteredRecords.filter(record => {
            const recordDate = new Date(record.timestamp).toISOString().split('T')[0];
            return recordDate === filterDate;
        });
    }

    if (filterName) {
        filteredRecords = filteredRecords.filter(record => 
            record.employeeName.toLowerCase().includes(filterName)
        );
    }

    displayRecords(filteredRecords);
}

// 清除篩選
function clearFilter() {
    document.getElementById('filterDate').value = '';
    document.getElementById('filterName').value = '';
    displayRecords();
}

// 匯出記錄
function exportRecords() {
    if (attendanceRecords.length === 0) {
        showStatus('沒有記錄可匯出！', 'error');
        return;
    }

    let csvContent = '\uFEFF';
    csvContent += '時間,姓名,地點,類型,IP位址,設備平台\n';
    attendanceRecords.forEach(record => {
        const date = new Date(record.timestamp);
        const timeStr = date.toLocaleString('zh-TW');
        csvContent += `"${timeStr}","${record.employeeName}","${record.location}","${record.type}","${record.ip}","${record.deviceFingerprint.platform}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `打卡記錄_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showStatus('記錄已匯出為CSV檔案！', 'success');
}

// 清空記錄
function clearRecords() {
    if (!confirm('確定要清空所有打卡記錄嗎？此操作無法復原！')) {
        return;
    }

    attendanceRecords = [];
    localStorage.removeItem('attendanceRecords');
    displayRecords();
    showStatus('所有記錄已清空！', 'success');
}

// 管理員面板切換
function toggleAdminPanel() {
    const panel = document.getElementById('adminPanel');
    const recordsPanel = document.getElementById('recordsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    recordsPanel.style.display = 'none';
}

// 初始化頁面
async function initializePage() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    document.getElementById('userIP').textContent = 'N/A'; // 待後端提供
    const deviceInfo = getDeviceFingerprint();
    document.getElementById('deviceInfo').textContent = `${deviceInfo.platform} - ${deviceInfo.userAgent.split(' ')[0]}`;
    initializeGoogleAPI();
}

document.addEventListener('DOMContentLoaded', initializePage);
document.getElementById('attendanceForm').addEventListener('submit', e => e.preventDefault());
