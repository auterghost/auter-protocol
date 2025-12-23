// ✅ V6.1 優化版：新增「自動偵測帳號切換」功能
// 請確認合約地址是正確的 V6.0 地址
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
let selectedNumbers = []; 

// 🔥 新增：監聽錢包切換事件
// 只要你在 MetaMask 切換帳號，網頁就會自動重新整理
if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
        window.location.reload();
    });
}

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

// 1. 連線錢包
async function connectWallet() {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            // 请求用戶授權帳號 (如果切換了帳號，這裡會抓到新的)
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
            alert("連線失敗: " + error.message);
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

// 5. 管理員開獎 (Gas Limit 300,000)
async function drawWinner() {
    if (!contract) return;
    const source = "return Functions.encodeUint256(Math.floor(Math.random() * 100));"; 
    try {
        const tx = await contract.performUpkeep(source, { gasLimit: 300000 });
        document.getElementById("status").innerText = "⏳ 開獎請求已發送...";
        await tx.wait();
        alert("開獎請求已發送！請稍待 1~2 分鐘後檢查獎金。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗: " + error.message);
    }
}
