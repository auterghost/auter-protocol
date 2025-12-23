// ✅ V6.2 強制切換版：按鈕會強制跳出帳號選擇視窗
// 合約地址 (已驗證 V6.0)
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

// 🚀 V6.2 重點修改：連線錢包 (強制選擇帳號)
async function connectWallet() {
    if (window.ethereum) {
        try {
            // 👇 這行是關鍵：強制跳出 MetaMask 帳號選擇視窗
            // 這樣你切換到新帳號時，才能把新帳號「勾選」進來
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
            // 如果用戶在選擇視窗按取消，就不跳錯誤視窗干擾
            if (error.code !== 4001) {
                alert("連線失敗: " + error.message);
            }
        }
    } else {
        alert("請安裝 MetaMask!");
    }
}

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

async function drawWinner() {
    if (!contract) return;
    const source = "return Functions.encodeUint256(Math.floor(Math.random() * 100));"; 
    try {
        const tx = await contract.performUpkeep(source, { gasLimit: 300000 });
        document.getElementById("status").innerText = "⏳ 開獎請求已發送...等待 Chainlink 回應";
        await tx.wait();
        alert("開獎請求已發送！\n請稍待 1~2 分鐘，Chainlink 計算完畢後，請按「重新整理獎金」查看結果。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗 (權限不足或 Gas 錯誤): " + error.message);
    }
}
