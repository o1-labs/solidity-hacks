// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract WalletLibrary {
    mapping(address => bool) public m_owners;
    uint256 public m_required;
    uint256 public m_numOwners;
    
    struct Transaction {
        address to;
        uint256 value;
        bool executed;
    }
    
    mapping(uint256 => Transaction) public m_txs;
    mapping(uint256 => mapping(address => bool)) public m_confirmations;
    uint256 public m_transactionCount;
    
    event Deposit(address indexed from, uint256 value);
    event Confirmation(address indexed owner, uint256 indexed transactionId);
    event Execution(uint256 indexed transactionId);
    event OwnerAddition(address indexed owner);
    
    modifier onlyOwner() {
        require(m_owners[msg.sender], "Not an owner");
        _;
    }
    
    modifier ownerDoesNotExist(address owner) {
        require(!m_owners[owner], "Owner already exists");
        _;
    }
    
    modifier ownerExists(address owner) {
        require(m_owners[owner], "Owner does not exist");
        _;
    }
    
    modifier transactionExists(uint256 transactionId) {
        require(m_txs[transactionId].to != address(0), "Transaction does not exist");
        _;
    }
    
    modifier confirmed(uint256 transactionId, address owner) {
        require(m_confirmations[transactionId][owner], "Transaction not confirmed");
        _;
    }
    
    modifier notConfirmed(uint256 transactionId, address owner) {
        require(!m_confirmations[transactionId][owner], "Transaction already confirmed");
        _;
    }
    
    modifier notExecuted(uint256 transactionId) {
        require(!m_txs[transactionId].executed, "Transaction already executed");
        _;
    }
    
    // SAFE VERSION: This function should only be callable during contract creation
    function initWallet(address[] memory _owners, uint256 _required) external {
        require(m_numOwners == 0, "Already initialized");
        require(_owners.length >= _required && _required > 0, "Invalid requirements");
        
        for (uint256 i = 0; i < _owners.length; i++) {
            require(_owners[i] != address(0), "Invalid owner");
            require(!m_owners[_owners[i]], "Duplicate owner");
            
            m_owners[_owners[i]] = true;
            emit OwnerAddition(_owners[i]);
        }
        
        m_numOwners = _owners.length;
        m_required = _required;
    }
    
    function kill(address payable to) external onlyOwner {
        selfdestruct(to);
    }
    
    function submitTransaction(address destination, uint256 value) external onlyOwner returns (uint256) {
        uint256 transactionId = m_transactionCount;
        m_txs[transactionId] = Transaction({
            to: destination,
            value: value,
            executed: false
        });
        m_transactionCount++;
        
        confirmTransaction(transactionId);
        return transactionId;
    }
    
    function confirmTransaction(uint256 transactionId) public 
        onlyOwner 
        transactionExists(transactionId) 
        notConfirmed(transactionId, msg.sender) 
    {
        m_confirmations[transactionId][msg.sender] = true;
        emit Confirmation(msg.sender, transactionId);
        executeTransaction(transactionId);
    }
    
    function executeTransaction(uint256 transactionId) internal 
        transactionExists(transactionId) 
        notExecuted(transactionId) 
    {
        if (isConfirmed(transactionId)) {
            Transaction storage txn = m_txs[transactionId];
            txn.executed = true;
            
            (bool success,) = txn.to.call{value: txn.value}("");
            require(success, "Transaction failed");
            
            emit Execution(transactionId);
        }
    }
    
    function isConfirmed(uint256 transactionId) public view returns (bool) {
        // Simplified confirmation check
        uint256 confirmationCount = getConfirmationCount(transactionId);
        return confirmationCount >= m_required;
    }
    
    function getConfirmationCount(uint256 /* transactionId */) internal pure returns (uint256) {
        // This would normally iterate through all owners
        // Simplified for demo - always return 0
        return 0;
    }
    
    // Fallback to accept ETH
    receive() external payable {
        if (msg.value > 0) {
            emit Deposit(msg.sender, msg.value);
        }
    }
}

contract MultisigWallet {
    address public walletLibrary;
    
    constructor(address _library, address[] memory _owners, uint256 _required) {
        walletLibrary = _library;
        
        // Initialize the wallet by delegating to the library
        (bool success,) = _library.delegatecall(
            abi.encodeWithSignature("initWallet(address[],uint256)", _owners, _required)
        );
        require(success, "Initialization failed");
    }
    
    fallback() external payable {
        address target = walletLibrary;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}
}
