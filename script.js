// 您的合約地址 (這是我們剛剛部署最新的那一個)
const CONTRACT_ADDRESS = "0x303bb114056284c33a808ac0A71399ed00FBe099";

const abi = [
    "function ticketPrice() view returns (uint256)",
    "function buyTicket(bytes _encryptedChoices) external payable"
];

let provider;
let signer;
let contract;
let price = 0;

async function connectWallet() {
    if (window.ethereum) {
        try {
            // Ethers.js v6 的寫法
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            const address = await signer.getAddress();
            
            document.getElementById("status").innerText = "🟢 已連線: " + address;
            
            // 連線合約並讀取票價
            contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
            const priceWei = await contract.ticketPrice();
            price = priceWei; // 存起來等等用
            
            document.getElementById("priceInfo").innerText = 
                `🎫 當前票價: ${ethers.formatEther(priceWei)} POL\n(請確保錢包餘額足夠)`;
                
        } catch (error) {
            alert("連線失敗: " + error.message);
        }
    } else {
        alert("請安裝 MetaMask!");
    }
}

async function buyTicket() {
    if (!contract) {
        alert("請先連線錢包！");
        return;
    }

    try {
        // 模擬玩家的選擇 (A1, B2, C3, D4, E5, F6)
        // 這裡我們隨便轉成一個 bytes，實際上要用特定的編碼
        // 為了測試，我們先傳送一個假的 "選擇數據"
        const mockChoice = ethers.toUtf8Bytes("A1,B2,C3,D4,E5,F6");

        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        // 🚀【關鍵修改】強制設定 gasLimit 為 500,000
        // 這能解決 Internal JSON-RPC error 錯誤，略過節點估算
        const tx = await contract.buyTicket(mockChoice, { 
            value: price, 
            gasLimit: 500000 
        });
        
        document.getElementById("status").innerText = "⏳ 交易發送中...等待區塊確認";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！現在去跑 Keeper 看看！";
        alert("購票成功！合約裡現在有錢了！");

    } catch (error) {
        console.error(error);
        document.getElementById("status").innerText = "❌ 失敗: " + error.message;
        alert("購買失敗，請看控制台 (可能餘額不足?)");
    }
}
