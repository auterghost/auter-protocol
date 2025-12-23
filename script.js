// ✅ 請填入你剛剛測試成功的 V6.0 合約地址
const CONTRACT_ADDRESS = "0xD4991248BdBCE99b04Ef4111cDf1e7f90ed904F7";

const abi = [
    "function ticketPrice() view returns (uint256)",
    "function buyTicket(bytes _encryptedChoices) external payable",
    "function pendingWinnings(address) view returns (uint256)",
    "function claimPrize() external",
    "function performUpkeep(string) external",
    "function isMarketOpen() view returns (bool)"
];

let provider, signer, contract;
let price = 0;
let userAddress = "";
let selectedNumbers = []; // 儲存玩家選的號碼 (例如 ["A1", "B2"])

// 初始化：產生 7x7 矩陣按鈕
window.onload = function() {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const container = document.getElementById('gridContainer');
    
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

// 處理選號邏輯
function toggleSelection(btn, coord) {
    if (selectedNumbers.includes(coord)) {
        // 取消選擇
        selectedNumbers = selectedNumbers.filter(n => n !== coord);
        btn.classList.remove('selected');
    } else {
        // 選擇 (限制最多 6 個)
        if (selectedNumbers.length >= 6) {
            alert("最多只能選擇 6 個號碼！");
            return;
        }
        selectedNumbers.push(coord);
        btn.classList.add('selected');
    }
    updateSelectionUI();
}

function updateSelectionUI() {
    document.getElementById('selectedCount').innerText = selectedNumbers.length;
    document.getElementById('selectedCoords').innerText = selectedNumbers.length > 0 ? selectedNumbers.join(", ") : "(尚未選擇)";
    
    // 只有連線且選滿 6 個時，才啟用購買按鈕
    const buyBtn = document.getElementById('btnBuy');
    if (contract && selectedNumbers.length === 6) {
        buyBtn.disabled = false;
        buyBtn.innerText = `💰 購買彩券 (${selectedNumbers.length}/6)`;
    } else {
        buyBtn.disabled = true;
        buyBtn.innerText = selectedNumbers.length === 6 ? "💰 請先連線錢包" : `💰 請選擇 6 個號碼 (${selectedNumbers.length}/6)`;
    }
}

// 1. 連線錢包
async function connectWallet() {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            
            document.getElementById("status").innerText = "🟢 已連線: " + userAddress;
            contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
            
            const priceWei = await contract.ticketPrice();
            price = priceWei;
            document.getElementById("priceInfo").innerText = `🎫 當前票價: ${ethers.formatEther(priceWei)} POL`;
            
            updateSelectionUI(); // 重新檢查按鈕狀態
            checkWinnings();

        } catch (error) {
            alert("連線失敗: " + error.message);
        }
    } else {
        alert("請安裝 MetaMask!");
    }
}

// 2. 購買票券 (將玩家選的號碼送上鏈)
async function buyTicket() {
    if (selectedNumbers.length !== 6) return alert("請先選擇 6 個號碼！");
    if (!contract) return alert("請先連線錢包！");
    
    try {
        // 將陣列轉為字串 (例如 "A1,B2,C3,D4,E5,F6") 再轉為 Bytes
        const choiceString = selectedNumbers.join(",");
        const encryptedChoice = ethers.toUtf8Bytes(choiceString);
        
        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        const tx = await contract.buyTicket(encryptedChoice, { value: price });
        document.getElementById("status").innerText = "⏳ 交易確認中...等待區塊打包";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！祝您中獎！";
        alert(`購票成功！您選擇了: ${choiceString}`);
        
        // 清空選擇
        selectedNumbers = [];
        document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('selected'));
        updateSelectionUI();
        
    } catch (error) {
        console.error(error);
        document.getElementById("status").innerText = "❌ 失敗: " + error.message;
    }
}

// 3. 檢查獎金
async function checkWinnings() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "查詢中...";
        const winnings = await contract.pendingWinnings(userAddress);
        
        if (winnings > 0) {
            const amount = ethers.formatEther(winnings);
            document.getElementById("winMessage").innerText = `🎉 恭喜！你有 ${amount} POL 獎金！`;
            document.getElementById("winMessage").style.display = "block";
            document.getElementById("btnClaim").style.display = "block";
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

// 4. 提領獎金
async function claimPrize() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "⏳ 提領請求發送中...";
        const tx = await contract.claimPrize();
        await tx.wait();
        document.getElementById("claimStatus").innerText = "✅ 提領成功！";
        alert("獎金已入帳！");
        checkWinnings();
    } catch (error) {
        console.error(error);
        document.getElementById("claimStatus").innerText = "❌ 失敗: " + error.message;
    }
}

// 5. 管理員開獎 (已修正 Gas)
async function drawWinner() {
    if (!contract) return;
    const source = "return Functions.encodeUint256(Math.floor(Math.random() * 100));"; 
    try {
        // 設定 300,000 以符合 Chainlink 限制
        const tx = await contract.performUpkeep(source, { gasLimit: 300000 });
        document.getElementById("status").innerText = "⏳ 開獎請求已發送...";
        await tx.wait();
        alert("開獎請求已發送！請稍待 1~2 分鐘後檢查獎金。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗: " + error.message);
    }
}
