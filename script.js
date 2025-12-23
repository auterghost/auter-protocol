// ✅ V6.1 最終完整版：整合自動帳號切換、選號矩陣與開獎修正
// 合約地址 (已驗證 V6.0)
const CONTRACT_ADDRESS = "0xD4991248BdBCE99b04Ef4111cDf1e7f90ed904F7";

const abi = [
    "function ticketPrice() view returns (uint256)",
    "function buyTicket(bytes _encryptedChoices) external payable",
    "function pendingWinnings(address) view returns (uint256)", // 查詢獎金
    "function claimPrize() external", // 領獎
    "function performUpkeep(string) external", // 管理員開獎
    "function isMarketOpen() view returns (bool)" // 查詢市場狀態
];

let provider, signer, contract;
let price = 0;
let userAddress = "";
let selectedNumbers = []; // 儲存玩家選的號碼

// 🔥 關鍵功能：監聽錢包切換事件
// 只要你在 MetaMask 切換帳號，網頁就會自動重新整理，抓取新身分
if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
        window.location.reload(); // 🔄 強制重整
    });
}

// 初始化：網頁載入時產生 7x7 矩陣按鈕
window.onload = function() {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const container = document.getElementById('gridContainer');
    
    // 產生 A1 ~ G7 共 49 個按鈕
    rows.forEach(r => {
        for (let c = 1; c <= 7; c++) {
            const coord = r + c;
            const btn = document.createElement('div');
            btn.className = 'grid-btn';
            btn.innerText = coord;
            btn.onclick = () => toggleSelection(btn, coord);
            container.appendChild(btn);
        }
    });
};

// 處理選號邏輯 (點擊按鈕時觸發)
function toggleSelection(btn, coord) {
    if (selectedNumbers.includes(coord)) {
        // 如果已經選過，則取消選擇
        selectedNumbers = selectedNumbers.filter(n => n !== coord);
        btn.classList.remove('selected');
    } else {
        // 如果還沒選過，檢查是否超過 6 個
        if (selectedNumbers.length >= 6) {
            alert("最多只能選擇 6 個號碼！");
            return;
        }
        selectedNumbers.push(coord);
        btn.classList.add('selected');
    }
    updateSelectionUI();
}

// 更新介面文字與按鈕狀態
function updateSelectionUI() {
    document.getElementById('selectedCount').innerText = selectedNumbers.length;
    document.getElementById('selectedCoords').innerText = selectedNumbers.length > 0 ? selectedNumbers.join(", ") : "(尚未選擇)";
    
    const buyBtn = document.getElementById('btnBuy');
    // 只有當「已連線」且「選滿 6 個」時，才啟用購買按鈕
    if (contract && selectedNumbers.length === 6) {
        buyBtn.disabled = false;
        buyBtn.innerText = `💰 購買彩券 (${selectedNumbers.length}/6)`;
    } else {
        buyBtn.disabled = true;
        buyBtn.innerText = selectedNumbers.length === 6 ? "💰 請先連線錢包" : `💰 請選擇 6 個號碼 (${selectedNumbers.length}/6)`;
    }
}

// 1. 連線錢包功能
async function connectWallet() {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            
            document.getElementById("status").innerText = "🟢 已連線: " + userAddress;
            
            // 連線合約
            contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
            
            // 讀取票價
            const priceWei = await contract.ticketPrice();
            price = priceWei;
            document.getElementById("priceInfo").innerText = `🎫 當前票價: ${ethers.formatEther(priceWei)} POL`;
            
            // 連線成功後，重新檢查按鈕狀態與獎金
            updateSelectionUI(); 
            checkWinnings();

        } catch (error) {
            alert("連線失敗: " + error.message);
        }
    } else {
        alert("請安裝 MetaMask!");
    }
}

// 2. 購買票券功能
async function buyTicket() {
    if (selectedNumbers.length !== 6) return alert("請先選擇 6 個號碼！");
    if (!contract) return alert("請先連線錢包！");
    
    try {
        // 將選號陣列轉為字串 (例如 "A1,B2...") 再轉為 Bytes
        const choiceString = selectedNumbers.join(",");
        const encryptedChoice = ethers.toUtf8Bytes(choiceString);
        
        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        // 發送交易
        const tx = await contract.buyTicket(encryptedChoice, { value: price });
        document.getElementById("status").innerText = "⏳ 交易確認中...等待區塊打包";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！祝您中獎！";
        alert(`購票成功！您選擇了: ${choiceString}`);
        
        // 購票後清空選擇，方便買下一張
        selectedNumbers = [];
        document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('selected'));
        updateSelectionUI();
        
    } catch (error) {
        console.error(error);
        document.getElementById("status").innerText = "❌ 失敗: " + error.message;
    }
}

// 3. 檢查獎金功能
async function checkWinnings() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "查詢鏈上數據中...";
        const winnings = await contract.pendingWinnings(userAddress);
        
        if (winnings > 0) {
            const amount = ethers.formatEther(winnings);
            document.getElementById("winMessage").innerText = `🎉 恭喜！你有 ${amount} POL 獎金！`;
            document.getElementById("winMessage").style.display = "block";
            document.getElementById("btnClaim").style.display = "block"; // 顯示領獎按鈕
            document.getElementById("claimStatus").innerText = "待領取";
        } else {
            document.getElementById("winMessage").style.display = "none";
            document.getElementById("btnClaim").style.display = "none";
            document.getElementById("claimStatus").innerText = "無未領獎金";
        }
    } catch (error) {
        console.error(error);
    }
}

// 4. 提領獎金功能
async function claimPrize() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "⏳ 提領請求發送中...";
        const tx = await contract.claimPrize();
        await tx.wait();
        
        document.getElementById("claimStatus").innerText = "✅ 提領成功！資金已入帳。";
        alert("獎金已成功轉入您的錢包！");
        
        // 提領後重新檢查 (按鈕應消失)
        checkWinnings();
    } catch (error) {
        console.error(error);
        document.getElementById("claimStatus").innerText = "❌ 失敗: " + error.message;
    }
}

// 5. 管理員開獎功能 (Chainlink 觸發)
async function drawWinner() {
    if (!contract) return;
    
    // JS 腳本源碼 (傳給 Chainlink 執行)
    const source = "return Functions.encodeUint256(Math.floor(Math.random() * 100));"; 
    
    try {
        // 🚀 設定 Gas Limit 為 300,000 (符合 Polygon 主網限制)
        const tx = await contract.performUpkeep(source, { gasLimit: 300000 });
        
        document.getElementById("status").innerText = "⏳ 開獎請求已發送...等待 Chainlink 回應";
        await tx.wait();
        
        alert("開獎請求已發送！\n請稍待 1~2 分鐘，Chainlink 計算完畢後，請按「重新整理獎金」查看結果。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗 (權限不足或 Gas 錯誤): " + error.message);
    }
}
