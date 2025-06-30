// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract InvestmentDAO {
    mapping(address => uint256) public investments;
    uint256 public totalInvestments;
    
    event Investment(address indexed investor, uint256 amount);
    event Withdrawal(address indexed investor, uint256 amount);
    
    function invest() external payable {
        require(msg.value > 0, "Investment amount must be greater than 0");
        investments[msg.sender] += msg.value;
        totalInvestments += msg.value;
        emit Investment(msg.sender, msg.value);
    }
    
    function withdrawInvestment(uint256 amount) external {
        require(amount > 0, "Withdrawal amount must be greater than 0");
        require(investments[msg.sender] >= amount, "Insufficient investment balance");
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        
        investments[msg.sender] -= amount;
        totalInvestments -= amount;
        
        emit Withdrawal(msg.sender, amount);
    }
    
    function getInvestment(address investor) external view returns (uint256) {
        return investments[investor];
    }
    
    function getTotalFunds() external view returns (uint256) {
        return address(this).balance;
    }
}
