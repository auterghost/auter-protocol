import { ethers } from "ethers";

// --- CONFIGURATION ---
const CONTRACT_ADDRESS = "0x01b1e5424C982d8209679DA404ff3247ed9687B5"; 
const CHAIN_ID = 137; // Polygon Mainnet
const TICKET_PRICE = ethers.parseEther("1.0");

// 這是您截圖中正確的 Chainlink VRF Subscription ID
const CORRECT_SUB_ID = "91085056963050045204976540555110204657705201567062698051797821556862941861279";

// --- ABI ---
const ABI = [
  "function buyTicket(bytes calldata _encryptedChoices) external payable",
  "function getPlayerCount() view returns (uint256)",
  "function pendingWinnings(address) view returns (uint256)",
  "function claimPrize() external",
  "function pickWinner() external",
  // Admin & Debug Functions
  "function emergencyWithdraw() external",
  "function setMarketStatus(bool _isOpen) external",
  "function isMarketOpen() view returns (bool)",
  "function s_subscriptionId() view returns (uint256)", // 读取合約內的 SubID
  "function setChainlinkConfig(uint256 _subId, uint32 _gasLimit, bytes32 _keyHash) external", // 修復用
  // Events
  "event TicketPurchased(address indexed player)", 
  "event WinnerPicked(address indexed winner, uint256 prize, uint256 fee, uint256 randomValue)"
];

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
const drawBtn = document.getElementById('draw-btn');
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

        const net = await provider.getNetwork();
        if (Number(net.chainId) !== CHAIN_ID) {
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] });
            } catch (e) {
                alert("Please switch to Polygon Mainnet to play.");
                return;
            }
        }

        if (CONTRACT_ADDRESS && CONTRACT_ADDRESS.length > 10) {
            contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
            refreshData();
            checkConfigDiagnostic(); // 執行診斷
            setupEvents();
        }

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

// --- DIAGNOSTIC TOOL (AUTO FIXER) ---
async function checkConfigDiagnostic() {
    try {
        console.log("Running diagnostics...");
        // 1. 檢查 Sub ID
        const currentSubId = await contract.s_subscriptionId();
        const currentIdStr = currentSubId.toString();
        
        console.log(`On-Chain ID: ${currentIdStr}`);
        console.log(`Correct ID:  ${CORRECT_SUB_ID}`);

        if (currentIdStr !== CORRECT_SUB_ID) {
            drawBtn.classList.add('hidden'); // 隱藏開獎按鈕
            
            // 創建修復按鈕
            const fixBtn = document.createElement('button');
            fixBtn.id = "fix-btn";
            fixBtn.className = "w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl font-bold tracking-widest border border-red-400 animate-pulse mb-2";
            fixBtn.innerHTML = `⚠️ CONFIG MISMATCH DETECTED<br><span class="text-xs">CLICK TO FIX SUBSCRIPTION ID</span>`;
            fixBtn.onclick = fixConfiguration;
            
            drawBtn.parentNode.insertBefore(fixBtn, drawBtn);
            alert("⚠️ 檢測到設定錯誤：合約內的訂閱 ID 與 Chainlink 不符。\n請點擊紅色的 'FIX' 按鈕進行修復，修復後即可開獎。");
        } else {
            console.log("Config is CORRECT ✅");
        }
    } catch (e) {
        console.warn("Diagnostic failed:", e);
    }
}

async function fixConfiguration() {
    setLoading(true, "FIXING CONFIG...");
    try {
        // VRF V2.5 KeyHash (Polygon Mainnet - 1000 gwei lane)
        const keyHash = "0x719e78216d7a488f7808298782a22235948f95c010b490f05560b457b0784d86";
        const gasLimit = 300000;
        
        // 呼叫管理員功能更新 ID
        const tx = await contract.setChainlinkConfig(CORRECT_SUB_ID, gasLimit, keyHash);
        await tx.wait();
        
        alert("Config Fixed! You can now draw.");
        document.getElementById('fix-btn').remove();
        drawBtn.classList.remove('hidden');
    } catch (e) {
        alert("Fix failed: " + (e.reason || e.message));
    }
    setLoading(false);
}

function setupEvents() {
    if (!contract) return;
    contract.on("WinnerPicked", (winner, prize, fee) => {
        console.log(`Winner picked: ${winner}`);
        alert(`🎉 Winner Picked! \nWinner: ${winner.slice(0,6)}... \nPrize: ${ethers.formatEther(prize)} POL`);
        refreshData();
    });
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
    if (!contract) return alert("Contract address missing in script.js");
    setLoading(true, "MINTING TICKET...");
    try {
        const isOpen = await contract.isMarketOpen();
        if(!isOpen) throw new Error("Market is currently closed by Admin.");

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

drawBtn.onclick = async () => {
    if (!contract) return alert("Contract address missing in script.js");
    
    // Safety Check: Ensure there are players
    try {
        const players = await contract.getPlayerCount();
        if (Number(players) === 0) return alert("❌ No players in the pool. Cannot draw.");
    } catch(e) {}

    setLoading(true, "REQUESTING VRF RANDOMNESS...");
    try {
        // Manually set Gas Limit to prevent RPC estimation errors on Polygon
        const tx = await contract.pickWinner({ gasLimit: 500000 });
        await tx.wait();
        alert("✅ Randomness Requested! \nWait ~30-60s for Chainlink VRF V2.5 callback.\nThe winner will appear automatically.");
    } catch (e) {
        console.error("Draw Error:", e);
        let errorMsg = e.reason || e.message || "Unknown Error";
        if(errorMsg.includes("user rejected")) errorMsg = "Transaction Rejected by User";
        alert("Draw Failed: " + errorMsg);
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
