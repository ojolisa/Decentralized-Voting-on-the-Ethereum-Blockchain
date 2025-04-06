# Blockchain Voting DApp

This project is a decentralized voting application (DApp) built on the Ethereum blockchain. It allows users to securely vote for candidates in an election, ensuring transparency and immutability. The DApp is designed for both administrators (election officials) and voters, providing a user-friendly interface to manage and participate in elections.

## Features

- **Admin Panel**:
  - Register voters with their Ethereum address and name.
  - Start and end the voting period.
- **Voter Panel**:
  - View voter details (name and voting status).
  - Cast a vote for a candidate during the voting period.
- **Candidate Management**:
  - Display a list of candidates with their vote counts.
  - Dynamically enable/disable voting buttons based on the election state.
- **Results**:
  - Display the winner and a ranked list of candidates after the voting period ends.
- **Dark Mode**:
  - Toggle between light and dark themes for better user experience.

## Smart Contract Details

The smart contract is written in Solidity and deployed on the Ethereum blockchain. It manages the election process, including voter registration, voting, and result calculation.

### Key Components:

- **State Management**: The contract has three states: `Created`, `Voting`, and `Ended`.
- **Voter Registration**: Admins can register voters before the voting period starts.
- **Voting**: Registered voters can vote for candidates during the voting period.
- **Results**: The contract calculates the winner based on the highest vote count.

## Project Structure

blockchain_voting-main/ ├── Voting.sol # Smart contract for the voting system ├── voting-frontend/ │ ├── index.html # Frontend HTML file │ ├── style.css # Custom CSS for styling │ ├── script.js # Frontend logic and interaction with the smart contract │ ├── config.js # Configuration file with contract address and ABI

## Prerequisites

- **MetaMask**: Install the MetaMask browser extension to interact with the Ethereum blockchain.
- **Node.js**: Install Node.js to run a local development server if needed.
- **Ganache** (optional): For local blockchain testing.

## How to Run the Project

### 1. Deploy the Smart Contract

1. Install [Remix IDE](https://remix.ethereum.org/) or use any Ethereum development environment.
2. Copy the contents of `Voting.sol` into the IDE.
3. Compile the contract using Solidity version `^0.8.0`.
4. Deploy the contract to your desired Ethereum network (e.g., Ganache for local testing or a testnet like Rinkeby).
5. Note the deployed contract address.

### 2. Configure the Frontend

1. Open `voting-frontend/config.js`.
2. Replace the placeholder `contractAddress` with the deployed contract address.
3. Ensure the `contractABI` matches the ABI of the deployed contract.

### 3. Run the Frontend

1. Open the `voting-frontend` folder.
2. Open `index.html` in a browser.
3. Ensure MetaMask is installed and connected to the same network as the deployed contract.

### 4. Using the DApp

- **Admin Actions**:
  - Connect your wallet using the "Connect to MetaMask" button.
  - Register voters by entering their Ethereum address and name.
  - Start the voting period using the "Start Voting" button.
  - End the voting period using the "End Voting" button.
- **Voter Actions**:
  - Connect your wallet using the "Connect to MetaMask" button.
  - View your voter details in the "Voter Panel".
  - Cast your vote for a candidate during the voting period.

### 5. View Results

- After the voting period ends, the results will be displayed in the "Election Results" section.

## Notes

- Ensure the wallet connected to MetaMask is the same as the admin wallet for admin actions.
- The DApp is designed to work with the Ethereum blockchain but can be adapted for other EVM-compatible blockchains.
