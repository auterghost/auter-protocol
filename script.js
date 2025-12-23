// ⚠️ 請務必將此處換成步驟 1 部署的 V6.0 合約地址
const CONTRACT_ADDRESS = "0xD4991248BdBCE99b04Ef4111cDf1e7f90ed904F7"; 

const abi = [
    "function ticketPrice() view returns (uint256)",
    "function buyTicket(bytes _encryptedChoices) external payable",
    "function pendingWinnings(address) view returns (uint256)", // 查詢獎金
    "function claimPrize() external", // 領獎
    "function performUpkeep(string) external", // 管理員開獎
    "function isMarketOpen() view returns (bool)"
];

let provider;
let signer;
let contract;
let price = 0;
let userAddress = "";

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

async function buyTicket() {
    if (!contract) return alert("請先連線錢包！");
    try {
        const mockChoice = ethers.toUtf8Bytes("A1,B2,C3,D4,E5,F6");
        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        const tx = await contract.buyTicket(mockChoice, { value: price });
        document.getElementById("status").innerText = "⏳ 交易確認中...";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！";
        alert("購票成功！等待開獎。");
    } catch (error) {
        console.error(error);
        document.getElementById("status").innerText = "❌ 失敗: " + error.message;
    }
}

// 檢查獎金 (整合 Remix/Chainlink 回傳的結果)
async function checkWinnings() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "正在查詢獎金...";
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
        console.error(error);
    }
}

// 提領獎金
async function claimPrize() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "⏳ 提領請求發送中...";
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

// 管理員測試用：觸發開獎 (實際上會由 Chainlink Automation 做，但手動測試用)
async function drawWinner() {
    if (!contract) return;
    const source = "return Functions.encodeUint256(Math.floor(Math.random() * 100));"; // 模擬簡單隨機
    try {
        const tx = await contract.performUpkeep(source);
        await tx.wait();
        alert("開獎請求已發送 Chainlink！請稍等幾分鐘後按「重新整理獎金」。");
    } catch (error) {
        alert("開獎失敗 (非管理員?): " + error.message);
    }
}
