// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ArcadzVault is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    address public bonezContract;
    address public signer;

    mapping(address => uint256) public nonceByAddress;

    // EIP-712 type hash for withdraw operations
    bytes32 private constant WITHDRAW_TYPEHASH = keccak256(
        "Withdraw(address vault,uint256 amount,uint256 nonce,address userAddress,uint256 deadline)"
    );

    // Custom errors
    error ZeroAmount();
    error BonezContractNotSet();
    error InvalidSignature();
    error InvalidNonce();
    error InsufficientContractBalance();
    error ZeroAddress();
    error InvalidTokenContract();
    error SignatureExpired();

    // Events
    event BonezDeposit(address indexed user, uint256 amount);
    event BonezWithdraw(address indexed user, uint256 amount, uint256 nonce);
    event BonezContractUpdated(address indexed oldContract, address indexed newContract);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event EmergencyWithdraw(address indexed owner, uint256 amount);
    event AvaxWithdraw(address indexed owner, uint256 amount);

    constructor(
        address _bonez,
        address _signer
    ) Ownable(msg.sender) EIP712("ArcadzVault", "1") {
        if (_bonez == address(0)) revert ZeroAddress();
        if (_signer == address(0)) revert ZeroAddress();
        
        if (_bonez.code.length == 0) revert InvalidTokenContract();
        
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
        uint256 deadline,
        bytes memory signature
    ) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (nonceByAddress[msg.sender] != nonce) revert InvalidNonce();
        if (IERC20(bonezContract).balanceOf(address(this)) < amount) revert InsufficientContractBalance();
        if (!verify(amount, nonce, deadline, msg.sender, signature)) revert InvalidSignature();

        nonceByAddress[msg.sender]++;
        
        // Use nonReentrant for the actual transfer
        _withdrawTokens(msg.sender, amount);

        emit BonezWithdraw(msg.sender, amount, nonce);
    }

    function _withdrawTokens(address to, uint256 amount) internal nonReentrant {
        IERC20(bonezContract).safeTransfer(to, amount);
    }

    /* ********************************** */
    /*             Signature              */
    /* ********************************** */

    function verify(
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        address userAddress,
        bytes memory signature
    ) public view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                WITHDRAW_TYPEHASH,
                address(this),
                amount,
                nonce,
                userAddress,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        
        if (hash.recover(signature) != signer) {
            return false; // Signature is invalid/tampered
        }
        
        if (block.timestamp > deadline) {
            return false; // Signature is valid but expired
        }
        
        return true; // Signature is valid AND not expired
    }

    /* ********************************** */
    /*               Admin                */
    /* ********************************** */

    function setBonez(address _bonez) external onlyOwner {
        if (_bonez == address(0)) revert ZeroAddress();
        if (_bonez.code.length == 0) revert InvalidTokenContract();
        
        address oldContract = bonezContract;
        bonezContract = _bonez;
        
        emit BonezContractUpdated(oldContract, _bonez);
    }

    function setSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert ZeroAddress();
        
        address oldSigner = signer;
        signer = _signer;
        
        emit SignerUpdated(oldSigner, _signer);
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = IERC20(bonezContract).balanceOf(address(this));
        IERC20(bonezContract).safeTransfer(msg.sender, balance);
        
        emit EmergencyWithdraw(msg.sender, balance);
    }

    function withdrawAvax() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Transfer failed");
        
        emit AvaxWithdraw(msg.sender, balance);
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

    /* ********************************** */
    /*           EIP-712 Helpers          */
    /* ********************************** */

    /**
     * @dev Returns the domain separator for the current chain.
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}