// ✅ V8.0 最終完成版：真實區塊鏈數據讀取 + 反向樂透邏輯
// ⚠️ 請在此處填入你剛才部署的 V8 合約地址
const CONTRACT_ADDRESS = "0xA110ba1acb8c7e287D3963674B1dd527d6417bC2"; 

const abi = [
    "function ticketPrice() view returns (uint256)",
    "function buyTicket(bytes _encryptedChoices) external payable",
    "function pendingWinnings(address) view returns (uint256)",
    "function claimPrize() external",
    "function performUpkeep(string) external",
    "function isMarketOpen() view returns (bool)",
    "function getAllBets() view returns (address[], bytes[])"
];

let provider, signer, contract;
let price = 0;
let userAddress = "";
let selectedNumbers = []; 

if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
        window.location.reload();
    });
}

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

async function connectWallet() {
    if (window.ethereum) {
        try {
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
            if (error.code !== 4001) alert("連線失敗: " + error.message);
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
        
        document.getElementById("status").innerText = "⏳ 發送交易中...";
        const tx = await contract.buyTicket(encryptedChoice, { value: price });
        document.getElementById("status").innerText = "⏳ 等待打包...";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！";
        alert(`購票成功！`);
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
    } catch (error) { console.error(error); }
}

async function claimPrize() {
    if (!contract) return;
    try {
        document.getElementById("claimStatus").innerText = "⏳ 提領中...";
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

// 🔥 V8.0 核心：真正的反向樂透邏輯 (Chainlink 執行)
async function drawWinner() {
    if (!contract) return;
    
    // 這段代碼會在 Chainlink 的伺服器上執行
    const source = `
        const contractAddress = args[0];
        const data = "0x4d588439"; // getAllBets() selector

        const response = await Functions.makeEthereumCall({
            to: contractAddress,
            data: data,
        });

        if (response.error) {
            throw Error("Chainlink Call Failed");
        }

        const returnType = ["address[]", "bytes[]"];
        const decoded = ethers.utils.defaultAbiCoder.decode(returnType, response.returnData);
        const players = decoded[0];
        const rawBets = decoded[1];

        const counts = {};
        const playerBets = [];

        for (let i = 0; i < rawBets.length; i++) {
            const hex = rawBets[i].slice(2);
            let str = "";
            for (let n = 0; n < hex.length; n += 2) {
                str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
            }
            
            const coords = str.split(",");
            playerBets.push({ playerIndex: i, bets: coords });

            coords.forEach(c => {
                counts[c] = (counts[c] || 0) + 1;
            });
        }

        let bestScore = 999999;
        let winnerIndex = 0;

        for (let i = 0; i < playerBets.length; i++) {
            let score = 0;
            playerBets[i].bets.forEach(c => {
                score += counts[c];
            });

            if (score < bestScore) {
                bestScore = score;
                winnerIndex = i;
            }
        }

        return Functions.encodeUint256(winnerIndex);
    `;
    
    try {
        const tx = await contract.performUpkeep(source, { gasLimit: 300000 });
        
        document.getElementById("status").innerText = "⏳ V8 真實開獎請求已發送...";
        await tx.wait();
        
        alert("開獎請求已發送！\nChainlink 正在讀取鏈上數據並計算最獨特的贏家。\n請稍待 2 分鐘後檢查。");
    } catch (error) {
        console.error(error);
        alert("開獎失敗: " + error.message);
    }
}
