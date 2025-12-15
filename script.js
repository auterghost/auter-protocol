let web3;
let accounts;
let contractInstance;
let deployedContractAddress = null; 

const status = document.getElementById('status');
const result = document.getElementById('result');
const addressDisplay = document.getElementById('addressDisplay');
const deployBtn = document.getElementById('deployBtn');
const getAddrBtn = document.getElementById('getAddrBtn');

// 1. 連線錢包
async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            // 請求連線 MetaMask
            accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            web3 = new Web3(window.ethereum);
            status.textContent = `已連線到區塊鏈 (帳號: ${accounts[0].substring(0, 6)}...)`;

            deployBtn.disabled = false; 
            result.innerHTML = '<p style="color:green;">連線成功，現在可以部署合約。</p>';

        } catch (error) {
            console.error("連線錯誤:", error);
            status.textContent = '連線錢包時發生錯誤。';
            result.innerHTML = '<p style="color:red;">請確認您已安裝 MetaMask 並授權連線。</p>';
        }
    } else {
        status.textContent = '錯誤：請安裝 MetaMask 或其他 Web3 錢包。';
        result.innerHTML = '<p style="color:red;">請安裝 <a href="https://metamask.io/" target="_blank">MetaMask</a> 以繼續。</p>';
    }
}

// 2. 部署智能合約 (佔位邏輯，需要您的 ABI 和 Bytecode)
async function deployContract() {
    if (!accounts) {
        result.innerHTML = '<p style="color:red;">請先連線錢包。</p>';
        return;
    }

    result.innerHTML = '<p style="color:orange;">警告：我們需要您的智能合約 **ABI** 和 **Bytecode** 才能真正部署。</p>';
    status.textContent = '合約部署功能準備中...';
    deployBtn.disabled = true; // 避免重複點擊

    // **************** [這裡將是您的核心智能合約程式碼] ****************
    // 由於您尚未提供最終編譯結果 (ABI & Bytecode)，此處先佔位
    const contractABI = []; // 您的 ABI 
    const contractBytecode = '0x'; // 您的 Bytecode

    if (contractABI.length === 0) {
        result.innerHTML += '<p style="color:red;">**錯誤：缺少 ABI 和 Bytecode**，無法部署。</p>';
        deployBtn.disabled = false;
        return;
    }
    // *******************************************************************

    // 模擬部署過程 (實際部署代碼需要 ABI 和 Bytecode)
    // const contract = new web3.eth.Contract(contractABI);
    // contract.deploy({ data: contractBytecode, arguments: [/* 構造函數參數 */] })
    //     .send({ from: accounts[0] })
    //     .on('transactionHash', (hash) => {
    //         result.innerHTML = `<p style="color:orange;">交易已發送，Hash: ${hash}</p>`;
    //     })
    //     .on('receipt', (receipt) => {
    //         deployedContractAddress = receipt.contractAddress;
    //         result.innerHTML = `<p style="color:green;">合約部署成功！地址已儲存。</p>`;
    //         addressDisplay.textContent = `部署地址: ${deployedContractAddress}`;
    //         getAddrBtn.disabled = false;
    //     })
    //     .on('error', (error) => {
    //         result.innerHTML = `<p style="color:red;">部署失敗: ${error.message}</p>`;
    //         deployBtn.disabled = false;
    //     });
}

// 3. 顯示合約地址
function getContractAddress() {
    if (deployedContractAddress) {
        addressDisplay.textContent = `已部署的合約地址: ${deployedContractAddress}`;
        result.innerHTML = '<p style="color:blue;">合約地址已成功顯示。</p>';
    } else {
        result.innerHTML = '<p style="color:red;">請先成功部署合約。</p>';
    }
}

// 初始化狀態
window.onload = () => {
    if (typeof window.ethereum !== 'undefined') {
        status.textContent = 'MetaMask 偵測成功，請點擊連線。';
    } else {
        status.textContent = '請安裝 MetaMask 錢包。';
    }
};
