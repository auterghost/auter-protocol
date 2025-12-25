import { ethers } from "ethers";

// --- CONFIGURATION ---
// ⚠️ 請務必填入您剛剛部署的 V16 合約地址
const CONTRACT_ADDRESS = "0xd10a40aA76eeE84C581E5006030fFf3cde15086A"; 
const CHAIN_ID = 137; // Polygon Mainnet
const TICKET_PRICE = ethers.parseEther("1.0");

// --- ABI (Compatible with V16) ---
const ABI = [
  "function buyTicket(bytes calldata _encryptedChoices) external payable",
  "function getPlayerCount() view returns (uint256)",
  "function pendingWinnings(address) view returns (uint256)",
  "function claimPrize() external",
  "function pickWinner() external",
  "function setNetworkConfig(uint256 _subId, uint32 _callbackGasLimit, bytes32 _keyHash) external",
  "function getFullDebugInfo() view returns (address, address, uint256, bytes32, uint256, uint256, address)",
  "function emergencyWithdraw() external",
  "event TicketPurchased(address indexed player)", 
  "event WinnerPicked(address indexed winner, uint256 prize, uint256 fee, uint256 randomValue)"
];

// --- STATE ---
let provider, signer, contract;
let currentSelection = [];
let walletAddress = null;
let currentKeyHash = ""; 

// --- DOM ELEMENTS ---
const connectBtn = document.getElementById('connect-btn');
const walletInfo = document.getElementById('wallet-info');
const gameUI = document.getElementById('game-ui');
const gridContainer = document.getElementById('grid-container');
const selectionCount = document.getElementById('selection-count');
const buyBtn = document.getElementById('buy-btn');
const clearBtn = document.getElementById('clear-btn');
const drawBtn = document.getElementById('draw-btn');
const checkBtn = document.getElementById('check-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Modal Elements
const debugModal = document.getElementById('debug-modal');
const debugContent = document.getElementById('debug-content');
const closeDebug = document.getElementById('close-debug');
const linkChainlink = document.getElementById('link-chainlink');
const linkPolygonscan = document.getElementById('link-polygonscan');

// Winner Modal Elements
const winnerModal = document.getElementById('winner-modal');
const winnerAddressDisplay = document.getElementById('winner-address');
const winnerPrizeDisplay = document.getElementById('winner-prize');
const closeWinnerBtn = document.getElementById('close-winner');

// --- INITIALIZATION ---
console.log("Auter Ark Script Loaded");

function initGrid() {
    if (!gridContainer) return;
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
        if (winnerModal) {
            winnerAddressDisplay.innerText = winner;
            winnerPrizeDisplay.innerText = `${ethers.formatEther(prize)} POL`;
            winnerModal.classList.remove('hidden');
        } else {
            alert(`🎉 Winner Picked! \nWinner: ${winner.slice(0,6)}... \nPrize: ${ethers.formatEther(prize)} POL`);
        }
        refreshData();
    });
}

if (closeWinnerBtn) {
    closeWinnerBtn.onclick = () => { winnerModal.classList.add('hidden'); };
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

// --- DEBUG DIAGNOSTIC LOGIC ---
checkBtn.onclick = async () => {
    if (!contract) return alert("Connect Wallet first");
    debugModal.classList.remove('hidden');
    debugContent.innerHTML = `<p class="text-center animate-pulse text-cyan-400">CONNECTING TO CONTRACT MEMORY...</p>`;

    try {
        const [
            coordinatorAddr,
            contractAddr,
            subId,
            keyHash,
            balance,
            playerCount,
            ownerAddr
        ] = await contract.getFullDebugInfo();

        currentKeyHash = keyHash;
        const detectedSubId = subId.toString();
        const detectedBalance = ethers.formatEther(balance);
        const isOwner = walletAddress.toLowerCase() === ownerAddr.toLowerCase();
        
        linkChainlink.href = `https://vrf.chain.link/polygon/${detectedSubId}`;
        linkPolygonscan.href = `https://polygonscan.com/address/${CONTRACT_ADDRESS}`;

        let html = `
            <div class="grid grid-cols-1 gap-3">
                <div class="bg-slate-800 p-3 rounded border-2 border-cyan-600/50 shadow-[0_0_15px_rgba(8,145,178,0.3)]">
                    <p class="text-xs text-slate-400 uppercase font-bold tracking-wider">Current Contract Address (V16)</p>
                    <p class="text-white text-sm break-all font-mono bg-black/30 p-2 rounded mt-1 select-all">${CONTRACT_ADDRESS}</p>
                    <p class="text-xs text-cyan-400 mt-2">👉 COPY THIS ADDRESS and add it as "Consumer" in Chainlink Dashboard.</p>
                </div>
                
                <div class="bg-slate-800 p-3 rounded border border-slate-700 flex justify-between items-center">
                    <div class="w-2/3">
                        <p class="text-xs text-slate-500">Subscription ID</p>
                        <p class="text-sm sm:text-base font-bold text-yellow-400 break-all font-mono">${detectedSubId}</p>
                    </div>
                    <div class="text-right w-1/3 pl-2">
                        <p class="text-xs text-slate-500">Balance</p>
                        <p class="text-xl font-bold ${Number(detectedBalance) >= 1 ? 'text-green-400' : 'text-red-500'}">${detectedBalance} POL</p>
                    </div>
                </div>
                
                <div class="bg-slate-800 p-3 rounded border border-slate-700">
                     <p class="text-xs text-slate-500">Key Hash (V2.5 500gwei)</p>
                     <p class="text-xs text-slate-400 break-all">${keyHash}</p>
                     <p class="text-[10px] text-green-500 mt-1">✅ Using Standard V2.5 Hash</p>
                </div>
            </div>
        `;

        if (isOwner) {
            html += `
                <div class="mt-4 p-3 bg-slate-800 border border-cyan-700 rounded">
                    <p class="text-cyan-400 font-bold text-sm mb-2">ADMIN CONTROLS</p>
                    <div class="flex gap-2">
                        <input id="new-sub-id" type="text" placeholder="New Sub ID" class="bg-slate-900 border border-slate-600 text-white p-2 rounded w-full text-xs font-mono" value="${detectedSubId}">
                        <button id="update-config-btn" class="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1 rounded text-xs font-bold whitespace-nowrap">UPDATE</button>
                    </div>
                </div>
            `;
        }
        
        debugContent.innerHTML = html;

        const updateBtn = document.getElementById('update-config-btn');
        if (updateBtn) {
            updateBtn.onclick = async () => {
                const newId = document.getElementById('new-sub-id').value;
                if (!newId) return;
                try {
                    setLoading(true, "UPDATING...");
                    const tx = await contract.setNetworkConfig(newId, 500000, currentKeyHash);
                    await tx.wait();
                    alert("✅ Updated!");
                    debugModal.classList.add('hidden');
                } catch(e) {
                    alert("Fail: " + e.message);
                }
                setLoading(false);
            };
        }

    } catch (e) {
        debugContent.innerHTML = `<p class="text-red-500">Error reading contract: ${e.message}</p>`;
    }
};

closeDebug.onclick = () => { debugModal.classList.add('hidden'); };

drawBtn.onclick = async () => {
    if (!contract || CONTRACT_ADDRESS.length < 10) return alert("Contract address missing! Please update script.js");
    
    try {
        const players = await contract.getPlayerCount();
        if (Number(players) === 0) {
            alert("⚠️ ERROR: No players! \n\nPlease BUY A TICKET first before drawing.");
            return;
        }
    } catch(e) {}

    setLoading(true, "REQUESTING VRF...");
    try {
        const tx = await contract.pickWinner({ gasLimit: 500000 });
        await tx.wait();
        alert("✅ Randomness Requested! \nWait ~60s. The winner will appear automatically.");
    } catch (e) {
        console.error("Draw Error:", e);
        let errorMsg = e.reason || e.message || "Unknown Error";
        
        if (errorMsg.includes("execution reverted") || errorMsg.includes("CALL_EXCEPTION")) {
            errorMsg = "❌ DRAW FAILED\n\n" + 
                       "Reason: The contract address (" + CONTRACT_ADDRESS.slice(0,6) + "...) is NOT added as a Consumer in Chainlink Dashboard.\n" +
                       "Fix: Go to Chainlink > Subscription > Add Consumer.";
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

connectBtn.onclick = connectWallet;
clearBtn.onclick = () => { currentSelection = []; initGrid(); updateUI(); };
initGrid();
