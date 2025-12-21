// 修正版：合約地址已改為全小寫，解決 Checksum 錯誤
const CONTRACT_ADDRESS = "0x303bb114056284c33a808ac0a71399ed00fbe099";

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
        // 目前測試階段這是固定的，未來我們會加上讓玩家自己選號的功能
        const mockChoice = ethers.toUtf8Bytes("A1,B2,C3,D4,E5,F6");

        document.getElementById("status").innerText = "⏳ 正在發送交易...請在錢包確認";
        
        // 🚀 強制設定 gasLimit 為 500,000 (避免估算錯誤)
        const tx = await contract.buyTicket(mockChoice, { 
            value: price, 
            gasLimit: 500000 
        });
        
        document.getElementById("status").innerText = "⏳ 交易發送中...等待區塊確認";
        await tx.wait();
        
        document.getElementById("status").innerText = "✅ 購票成功！資金已進入合約金庫！";
        alert("購票成功！你是全球大樂透 V5 主網的第一位玩家！");

    } catch (error) {
        console.error(error);
        document.getElementById("status").innerText = "❌ 失敗: " + error.message;
        alert("購買失敗，請看控制台 (可能餘額不足?)");
    }
}
