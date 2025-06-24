// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract ArcadzVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    address public bonezContract;
    address private signer;

    mapping(address => uint256) public nonceByAddress;

    // Custom errors
    error ZeroAmount();
    error BonezContractNotSet();
    error InvalidSignature();
    error InvalidNonce();
    error InsufficientContractBalance();

    // Events
    event BonezDeposit(address indexed user, uint256 amount);
    event BonezWithdraw(address indexed user, uint256 amount, uint256 nonce);

    constructor(
        address _bonez,
        address _signer
    ) Ownable(msg.sender) {
        bonezContract = _bonez;
        signer = _signer;
    }

    /* ********************************** */
    /*           Deposit Function         */
    /* ********************************** */

    function deposit(uint256 amount) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (bonezContract == address(0)) revert BonezContractNotSet();
        
        IERC20(bonezContract).safeTransferFrom(msg.sender, address(this), amount);
        
        emit BonezDeposit(msg.sender, amount);
    }

    /* ********************************** */
    /*          Withdraw Function         */
    /* ********************************** */

    function withdraw(
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (nonceByAddress[msg.sender] != nonce) revert InvalidNonce();
        if (IERC20(bonezContract).balanceOf(address(this)) < amount) revert InsufficientContractBalance();
        if (!verify(amount, nonce, msg.sender, signature)) revert InvalidSignature();

        nonceByAddress[msg.sender]++;
        IERC20(bonezContract).safeTransfer(msg.sender, amount);

        emit BonezWithdraw(msg.sender, amount, nonce);
    }

    /* ********************************** */
    /*             Signature              */
    /* ********************************** */

    function verify(
        uint256 amount,
        uint256 nonce,
        address userAddress,
        bytes memory signature
    ) public view returns (bool) {
        bytes32 messageHash = keccak256(
            abi.encode(
                address(this),
                amount,
                nonce,
                userAddress
            )
        );

        return MessageHashUtils.toEthSignedMessageHash(messageHash).recover(signature) == signer;
    }

    /* ********************************** */
    /*               Admin                */
    /* ********************************** */

    function setBonez(address _bonez) external onlyOwner {
        bonezContract = _bonez;
    }

    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
    }

    function emergencyWithdraw() external onlyOwner {
        IERC20(bonezContract).safeTransfer(
            msg.sender,
            IERC20(bonezContract).balanceOf(address(this))
        );
    }

    function withdrawAvax() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    receive() external payable {}

    /* ********************************** */
    /*              Pausable              */
    /* ********************************** */

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}