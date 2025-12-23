// 修正版 V6.0：已更新合約地址與強制 Gas 設定
// ✅ V6.0 新合約地址 (你提供的)
const CONTRACT_ADDRESS = "0xD4991248BdBCE99b04Ef4111cDf1e7f90ed904F7";

const abi = [
    "function ticketPrice() view returns (uint256)",
    "function buyTicket(bytes _encryptedChoices) external payable",
    "function pendingWinnings(address) view returns (uint256)", // 查詢獎金
    "function claimPrize() external", // 領獎
    "function performUpkeep(string) external", // 管理員開獎
    "function isMarketOpen() view returns (bool)" // 查詢市場狀態
];

let provider;
let signer;
let contract;
let price = 0;
let userAddress = "";

// 1. 連線錢包
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
            
            // 啟用購票按鈕
            document.getElementById("btnBuy").disabled = false;

            // 連線後立刻檢查有沒有獎金
            checkWinnings();

        } catch (error) {
            alert("連線失敗: " + error.message);
        }
    } else {
        alert("請安裝 MetaMask!");
    }
}

// 2. 購買票券
async function buyTicket() {
    if (!contract) return alert("請先連線錢包！");
    try {
        // 模擬玩家的選擇 (目前固定，未來可改選號介面)
        const mockChoice = ethers.toUtf8Bytes("A1,B2,C3,D4,E5,F6");
        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        // 發送交易
        const tx = await contract.buyTicket(mockChoice, { value: price });
        document.getElementById("status").innerText = "⏳ 交易確認中...等待區塊打包";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！資金已進入合約金庫！";
        alert("購票成功！請等待開獎。");
    } catch (error) {
        console.error(error);
        document.getElementById("status").innerText = "❌ 失敗: " + error.message;
    }
}

// 3. 檢查獎金 (讀取合約上的 pendingWinnings)
async function checkWinnings() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "正在查詢鏈上數據...";
        const winnings = await contract.pendingWinnings(userAddress);
        
        if (winnings > 0) {
            const amount = ethers.formatEther(winnings);
            document.getElementById("winMessage").innerText = `🎉 恭喜！你有 ${amount} POL 獎金尚未領取！`;
            document.getElementById("winMessage").style.display = "block";
            document.getElementById("btnClaim").style.display = "block"; // 顯示領獎按鈕
            document.getElementById("claimStatus").innerText = "待領取";
        } else {
            document.getElementById("winMessage").style.display = "none";
            document.getElementById("btnClaim").style.display = "none";
            document.getElementById("claimStatus").innerText = "目前無未領獎金";
        }
    } catch (error) {
        console.error("查詢獎金失敗:", error);
    }
}

// 4. 提領獎金
async function claimPrize() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "⏳ 提領請求發送中...請確認錢包";
        const tx = await contract.claimPrize();
        await tx.wait();
        
        document.getElementById("claimStatus").innerText = "✅ 提領成功！資金已轉入您的錢包。";
        alert("獎金已入帳！");
        
        // 提領後重新檢查 (按鈕應該會消失)
        checkWinnings();
    } catch (error) {
        console.error(error);
        document.getElementById("claimStatus").innerText = "❌ 提領失敗: " + error.message;
    }
}

// 5. 管理員開獎 (強制加上 gasLimit 解決報錯)
async function drawWinner() {
    if (!contract) return;
    
    // 這段 JS 代碼會傳給 Chainlink 去執行 (這裡僅做簡單模擬回傳隨機數)
    const source = "return Functions.encodeUint256(Math.floor(Math.random() * 100));"; 
    
    try {
        // 🚀 關鍵修正：強制設定 gasLimit 為 500,000
        // 這能繞過 MetaMask 的估算錯誤 (Missing Revert Data)
        const tx = await contract.performUpkeep(source, { gasLimit: 500000 });
        
        document.getElementById("status").innerText = "⏳ 開獎請求已發送...等待 Chainlink 回應";
        await tx.wait();
        
        alert("開獎請求已成功發送給 Chainlink！\n請等待約 1~2 分鐘，然後點擊「重新整理我的獎金」查看結果。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗: " + error.message);
    }
}
