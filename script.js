// ✅ V7.1 完整修復版：加大開獎 Gas Limit 防止交易失敗
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
let selectedNumbers = []; 

// 🔥 監聽錢包切換：只要帳號變更，網頁自動重整
if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
        window.location.reload();
    });
}

// 初始化
window.onload = function() {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const container = document.getElementById('gridContainer');
    
    // 產生 7x7 矩陣按鈕
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

function toggleSelection(btn, coord) {
    if (selectedNumbers.includes(coord)) {
        selectedNumbers = selectedNumbers.filter(n => n !== coord);
        btn.classList.remove('selected');
    } else {
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
    
    const buyBtn = document.getElementById('btnBuy');
    if (contract && selectedNumbers.length === 6) {
        buyBtn.disabled = false;
        buyBtn.innerText = `💰 購買彩券 (${selectedNumbers.length}/6)`;
    } else {
        buyBtn.disabled = true;
        buyBtn.innerText = selectedNumbers.length === 6 ? "💰 請先連線錢包" : `💰 請選擇 6 個號碼 (${selectedNumbers.length}/6)`;
    }
}

// 1. 連線錢包 (強制選擇帳號)
async function connectWallet() {
    if (window.ethereum) {
        try {
            // 強制跳出 MetaMask 帳號選擇視窗
            await window.ethereum.request({
                method: "wallet_requestPermissions",
                params: [{ eth_accounts: {} }]
            });

            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            
            document.getElementById("status").innerText = "🟢 已連線: " + userAddress;
            
            contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
            
            const priceWei = await contract.ticketPrice();
            price = priceWei;
            document.getElementById("priceInfo").innerText = `🎫 當前票價: ${ethers.formatEther(priceWei)} POL`;
            
            updateSelectionUI(); 
            checkWinnings();

        } catch (error) {
            if (error.code !== 4001) {
                alert("連線失敗: " + error.message);
            }
        }
    } else {
        alert("請安裝 MetaMask!");
    }
}

// 2. 購買票券
async function buyTicket() {
    if (selectedNumbers.length !== 6) return alert("請先選擇 6 個號碼！");
    if (!contract) return alert("請先連線錢包！");
    
    try {
        const choiceString = selectedNumbers.join(",");
        const encryptedChoice = ethers.toUtf8Bytes(choiceString);
        
        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        const tx = await contract.buyTicket(encryptedChoice, { value: price });
        document.getElementById("status").innerText = "⏳ 交易確認中...等待區塊打包";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！祝您中獎！";
        alert(`購票成功！您選擇了: ${choiceString}`);
        
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
        document.getElementById("claimStatus").innerText = "查詢鏈上數據中...";
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
        
        document.getElementById("claimStatus").innerText = "✅ 提領成功！資金已入帳。";
        alert("獎金已成功轉入您的錢包！");
        checkWinnings();
    } catch (error) {
        console.error(error);
        document.getElementById("claimStatus").innerText = "❌ 失敗: " + error.message;
    }
}

// 5. 管理員開獎 (🔥 V7.1：加大 Gas Limit 防止 Revert)
async function drawWinner() {
    if (!contract) return;
    
    // V7 邏輯代碼：Chainlink 上的運算邏輯
    const source = `
        // 模擬數據：假設這是從區塊鏈上讀取到的選號
        const allBets = [
            ["A1", "A2", "A3", "A4", "A5", "A6"], // 玩家 1 (全A)
            ["A1", "A2", "A3", "A4", "A5", "B1"], // 玩家 2 (選了 B1)
            ["A1", "C3", "D4", "E5", "F6", "G7"], // 玩家 3 (選了 G7, F6...)
            ["A1", "A2", "A3", "A4", "A5", "A6"], // 玩家 4 (跟玩家 1 重複)
            ["B1", "B2", "B3", "B4", "B5", "B6"]  // 玩家 5 (跟玩家 2 的 B1 重複)
        ];

        // 步驟 A: 統計每個座標被選了幾次
        const counts = {};
        for (const bet of allBets) {
            for (const coord of bet) {
                counts[coord] = (counts[coord] || 0) + 1;
            }
        }

        // 步驟 B: 找出「被選次數最少」是多少次
        let minCount = 999999;
        for (const coord in counts) {
            if (counts[coord] < minCount) {
                minCount = counts[coord];
            }
        }
        
        // 步驟 C: 回傳一個隨機數來決定贏家 (目前 V7 階段的測試回傳)
        return Functions.encodeUint256(Math.floor(Math.random() * 100)); 
    `;
    
    try {
        // 🚀 關鍵修正：將 gasLimit 提高到 600,000
        // 之前設定 300,000 導致實際耗用 297,000 時容易交易失敗
        const tx = await contract.performUpkeep(source, { gasLimit: 600000 });
        
        document.getElementById("status").innerText = "⏳ V7 邏輯計算請求已發送...";
        await tx.wait();
        
        alert("開獎請求已發送！\n請稍待 1~2 分鐘後檢查獎金。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗: " + error.message);
    }
}
