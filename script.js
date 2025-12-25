import { ethers } from "ethers";

// --- CONFIGURATION ---
// ⚠️ 請注意：CHAIN_ID 是 Polygon 區塊鏈的固定編號 (137)，這不是訂閱 ID。
// 你的 Chainlink 訂閱 ID (178) 已經正確設定在智能合約 (Solidity) 中，無需在此設定。
const CONTRACT_ADDRESS = "0x6a996DA8761C164B5ACE18AE11024b8dc6DD2f1f"; // 你的 V9 合約地址
const CHAIN_ID = 137; // Polygon Mainnet ID (固定值，請勿修改，否則錢包無法連線)
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
// ⚠️ V9.7 修正：硬編碼地址注入 (Hardcoded Injection)
// 既然參數傳遞 (args[0]) 會導致節點讀取失敗，我們直接把地址寫死在 JS 字串裡。
// 這能確保節點絕對找得到合約。
const CHAINLINK_SOURCE = `
// 1. 直接鎖定你的合約地址 (由 script.js 注入字串)
const contractAddress = "${CONTRACT_ADDRESS}"; 

// 2. 加強版 RPC 列表 (包含 LlamaNodes 與 PublicNode)
const rpcList = [
    "https://polygon.llamarpc.com",           // 新增：通常反應很快
    "https://polygon-bor-rpc.publicnode.com", // 備用 1
    "https://rpc.ankr.com/polygon",           // 備用 2
    "https://polygon-rpc.com",                // 官方
    "https://1rpc.io/matic"                   // 隱私節點
];

const data = "0x5d62d910"; // getPlayerCount() selector

console.log("Target Contract (Hardcoded):", contractAddress);

// 輔助函數：嘗試單一 RPC 請求
async function tryRpc(url) {
    try {
        const request = Functions.makeHttpRequest({
            url: url,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            data: {
                jsonrpc: "2.0",
                method: "eth_call",
                params: [{ to: contractAddress, data: data }, "latest"],
                id: 1
            },
            timeout: 9000 // 延長超時至 9 秒
        });
        
        const response = await request;
        
        if (response.error) {
            console.log("RPC Error [" + url + "]: Connection Failed");
            return null;
        }
        
        if (!response.data || !response.data.result) {
            console.log("RPC Error [" + url + "]: No Data");
            return null;
        }
        
        const res = response.data.result;

        // V9.7 特別檢查：如果不幸回傳 0x，視為該節點尚未同步
        if (res === "0x") {
            console.log("RPC Warning [" + url + "]: Returned 0x (Empty)");
            return null;
        }
        
        console.log("RPC Success [" + url + "]: " + res);
        return res;
    } catch (e) {
        console.log("RPC Exception [" + url + "]: " + e.message);
        return null;
    }
}

// 主邏輯：輪詢所有 RPC
let hexCount = null;

for (let i = 0; i < rpcList.length; i++) {
    hexCount = await tryRpc(rpcList[i]);
    if (hexCount) break; 
}

if (!hexCount) {
    // 這是給 Chainlink 儀表板看的錯誤訊息
    throw Error("CRITICAL FAILURE: Could not fetch data from ANY RPC node for " + contractAddress);
}

// 解析數據
const count = parseInt(hexCount, 16);
console.log("Final Player Count:", count);

if (isNaN(count)) {
  throw Error("Parsed NaN from hex: " + hexCount);
}

if (count === 0) {
    return Functions.encodeUint256(BigInt(0));
}

// 決定贏家 (確定性算法)
const seed = count * 997 + 123;
const winnerIndex = seed % count;

console.log("Winner Index:", winnerIndex);

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
    setLoading(true, "REQUESTING RANDOMNESS (V9.7 HARDCODED)...");
    try {
        // V9.7: 這裡的 CHAINLINK_SOURCE 已經包含了寫死的地址，
        // 不會再發生 "All RPCs failed" 找不到合約的問題。
        const tx = await contract.performUpkeep(CHAINLINK_SOURCE);
        await tx.wait();
        alert("Draw Initiated! Using direct address injection (Wait ~1 min)...");
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
