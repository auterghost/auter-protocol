import { ethers } from "ethers";

// --- CONFIGURATION ---
// ⚠️ 部署 AuterArkV12_Final.txt 後，請貼上新地址
const CONTRACT_ADDRESS = "0xE1116629228F9f338b903dd94784BA17aD2193A3"; 
const CHAIN_ID = 137; // Polygon Mainnet
const TICKET_PRICE = ethers.parseEther("1.0");

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
            setupEvents();
        } else {
            console.warn("Contract address not set");
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
    if (!contract || CONTRACT_ADDRESS.length < 10) return alert("Contract address missing! Please update script.js");
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
    if (!contract || CONTRACT_ADDRESS.length < 10) return alert("Contract address missing! Please update script.js");
    
    // 1. Check players LOCALLY first to avoid gas waste
    try {
        const players = await contract.getPlayerCount();
        if (Number(players) === 0) {
            alert("⚠️ 錯誤：目前沒有玩家！\n\n您必須先「購買一張彩票」才能執行開獎。\n請選擇 6 個號碼並點擊 MINT TICKET。");
            return;
        }
    } catch(e) {
        console.warn("Could not fetch player count", e);
    }

    setLoading(true, "REQUESTING VRF...");
    try {
        const tx = await contract.pickWinner({ gasLimit: 500000 });
        await tx.wait();
        alert("✅ Randomness Requested! \nWait ~30-60s. The winner will appear automatically.");
    } catch (e) {
        console.error("Draw Error:", e);
        let errorMsg = e.reason || e.message || "Unknown Error";
        
        if (errorMsg.includes("No players")) {
             errorMsg = "❌ No players in pool! Buy a ticket first.";
        } else if (errorMsg.includes("execution reverted")) {
            errorMsg = "❌ Transaction Reverted!\n\nFINAL CHECKLIST:\n1. Open vrf.chain.link (Polygon Mainnet).\n2. Is your Subscription funded with **POL**? (At least 3 POL)\n3. Did you 'Add Consumer' and paste the NEW Contract Address?\n4. Did you Buy a Ticket first?";
        }
        alert(errorMsg);
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
