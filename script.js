import { ethers } from "ethers";

// --- CONFIGURATION ---
// ⚠️ 請確認這裡是你已經部署的 V9 合約地址
const CONTRACT_ADDRESS = "0x6a996DA8761C164B5ACE18AE11024b8dc6DD2f1f";
const CHAIN_ID = 178; // Polygon Mainnet
const TICKET_PRICE = ethers.parseEther("1.0");

// --- ABI (Updated for V9) ---
const ABI = [
  "function buyTicket(bytes calldata _encryptedChoices) external payable",
  "function getPlayerCount() view returns (uint256)",
  "function pendingWinnings(address) view returns (uint256)",
  "function claimPrize() external",
  "function performUpkeep(string calldata source) external",
  "event TicketPurchased(address indexed player, bytes choices, uint256 timestamp)",
  "function emergencyWithdraw() external" 
];

// --- CHAINLINK SOURCE (JS executed by Decentralized Oracle Network) ---
// ⚠️ V9.3 重大修正：
// 1. 棄用 polygon-rpc.com (因為會回傳 HTML 導致 Response too large)
// 2. 改用 Ankr 節點 (更穩定且回應輕量)
const CHAINLINK_SOURCE = `
// 1. 設定 Polygon 主網 RPC (使用 Ankr)
const rpcUrl = "https://rpc.ankr.com/polygon"; 
const contractAddress = args[0];
const data = "0x5d62d910"; // getPlayerCount() selector

// 2. 發送 RPC 請求
const request = Functions.makeHttpRequest({
  url: rpcUrl,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  data: {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [{ to: contractAddress, data: data }, "latest"],
    id: 1
  }
});

// 3. 等待回應
const response = await request;

// 4. 錯誤處理
if (response.error) {
  throw Error("RPC Request Failed");
}

// 嚴格檢查：確保回傳的是數據而不是 HTML 網頁
if (!response.data || !response.data.result) {
  throw Error("Invalid RPC Response - likely HTML error");
}

// 5. 解析玩家人數
const hexCount = response.data.result;
const count = parseInt(hexCount, 16);
console.log("Player Count:", count);

if (isNaN(count)) {
  throw Error("Invalid count data");
}

// 如果沒人玩，避免除以零錯誤
if (count === 0) {
    return Functions.encodeUint256(BigInt(0));
}

// 6. 決定贏家 (確定性算法)
const seed = count * 997 + 123;
const winnerIndex = seed % count;

console.log("Winner Index:", winnerIndex);

// 7. 回傳結果
return Functions.encodeUint256(BigInt(winnerIndex));
`;

// --- STATE ---
let provider, signer, contract;
let currentSelection = [];
let walletAddress = null;

// --- DOM ELEMENTS ---
const connectBtn = document.getElementById('connect-btn');
const walletInfo = document.getElementById('wallet-info');
const gameUI = document.getElementById('game-ui');
const gridContainer = document.getElementById('grid-container');
const selectionCount = document.getElementById('selection-count');
const buyBtn = document.getElementById('buy-btn');
const clearBtn = document.getElementById('clear-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// --- INITIALIZATION ---
function initGrid() {
    gridContainer.innerHTML = '';
    for (let i = 1; i <= 49; i++) {
        const btn = document.createElement('button');
        btn.className = `h-10 w-10 sm:h-12 sm:w-12 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 bg-slate-800 text-slate-400 hover:bg-slate-700`;
        btn.innerText = i;
        btn.onclick = () => toggleNumber(i, btn);
        gridContainer.appendChild(btn);
    }
}

function toggleNumber(num, btn) {
    if (currentSelection.includes(num)) {
        currentSelection = currentSelection.filter(n => n !== num);
        btn.classList.remove('selected-ball');
    } else {
        if (currentSelection.length < 6) {
            currentSelection.push(num);
            btn.classList.add('selected-ball');
        }
    }
    updateUI();
}

function updateUI() {
    selectionCount.innerText = `${currentSelection.length}/6`;
    selectionCount.classList.toggle('text-green-400', currentSelection.length === 6);
    buyBtn.disabled = currentSelection.length !== 6;
}

// --- WEB3 FUNCTIONS ---
async function connectWallet() {
    if (!window.ethereum) return alert("Install MetaMask!");
    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        walletAddress = await signer.getAddress();

        // Switch Chain
        const net = await provider.getNetwork();
        if (Number(net.chainId) !== CHAIN_ID) {
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] });
            } catch (e) {
                alert("Please switch to Polygon Mainnet to play.");
                return;
            }
        }

        // Setup Contract
        if (CONTRACT_ADDRESS && CONTRACT_ADDRESS.length > 10) {
            contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
            refreshData();
        } else {
            console.warn("Contract Address NOT SET in script.js");
        }

        // Update UI
        connectBtn.classList.add('hidden');
        walletInfo.classList.remove('hidden');
        gameUI.classList.remove('hidden');
        document.getElementById('address-display').innerText = `${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}`;
        
        const bal = await provider.getBalance(walletAddress);
        document.getElementById('balance-display').innerText = `${ethers.formatEther(bal).slice(0,5)} POL`;
    } catch (e) {
        console.error("Wallet connection failed", e);
    }
}

async function refreshData() {
    if (!contract) return;
    try {
        const players = await contract.getPlayerCount();
        document.getElementById('player-count').innerText = players;

        const balance = await provider.getBalance(CONTRACT_ADDRESS);
        document.getElementById('pool-size').innerText = ethers.formatEther(balance);

        const winnings = await contract.pendingWinnings(walletAddress);
        const winEth = ethers.formatEther(winnings);
        document.getElementById('my-winnings').innerText = `${winEth} POL`;
        
        const btn = document.getElementById('claim-btn');
        if (Number(winEth) > 0) {
            btn.classList.remove('hidden');
            btn.onclick = async () => {
                setLoading(true, "CLAIMING PRIZE...");
                try {
                    const tx = await contract.claimPrize();
                    await tx.wait();
                    alert("Prize Claimed Successfully!");
                    refreshData();
                } catch(e) {
                    alert("Claim failed: " + (e.reason || "Unknown"));
                }
                setLoading(false);
            };
        } else {
            btn.classList.add('hidden');
        }
    } catch(e) { 
        // Silent fail
    }
}

// --- ACTIONS ---
buyBtn.onclick = async () => {
    if (!contract) return alert("Contract address not set in script.js");
    setLoading(true, "MINTING TICKET...");
    try {
        const coords = currentSelection.map(num => {
            const row = String.fromCharCode(65 + Math.floor((num - 1) / 7));
            const col = ((num - 1) % 7) + 1;
            return `${row}${col}`;
        }).join(",");

        const bytes = ethers.toUtf8Bytes(coords);
        const tx = await contract.buyTicket(bytes, { value: TICKET_PRICE });
        await tx.wait();
        alert(`Ticket Minted! Coordinates: ${coords}`);
        currentSelection = [];
        initGrid(); 
        updateUI();
        refreshData();
    } catch (e) {
        alert("Transaction Failed: " + (e.reason || "Unknown Error"));
    }
    setLoading(false);
};

document.getElementById('draw-btn').onclick = async () => {
    if (!contract) return alert("Contract address not set in script.js");
    setLoading(true, "REQUESTING RANDOMNESS...");
    try {
        // V9.3: 這裡會將新的 Ankr 腳本傳給 Chainlink
        const tx = await contract.performUpkeep(CHAINLINK_SOURCE);
        await tx.wait();
        alert("Draw Initiated! Oracle is processing (Wait ~1 min)...");
    } catch (e) {
        alert("Draw Failed: " + (e.reason || "Check console"));
    }
    setLoading(false);
};

function setLoading(active, text = "") {
    if (active) {
        loadingOverlay.classList.remove('hidden');
        loadingText.innerText = text;
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// --- BOOTSTRAP ---
connectBtn.onclick = connectWallet;
clearBtn.onclick = () => { currentSelection = []; initGrid(); updateUI(); };
initGrid();
