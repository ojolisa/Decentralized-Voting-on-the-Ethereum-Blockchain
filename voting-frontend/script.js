// --- Global Variables ---
let web3;
let votingContract;
let userAccount;
let isOfficial = false;
let eventListenersInitialized = false;

// To store event listener subscriptions for proper cleanup
let stateChangedListener = null;
let voterAddedListener = null;
let votedListener = null;

// contractStateEnum is assumed to be available from config.js (e.g., {0: 'Created', 1: 'Voting', 2: 'Ended'})

// --- DOM Element References ---
const connectButton = document.getElementById('connectButton');
const accountArea = document.getElementById('accountArea');
const accountAddressSpan = document.getElementById('accountAddress');
const adminPanel = document.getElementById('adminPanel');
const voterPanel = document.getElementById('voterPanel');
const candidatesSection = document.getElementById('candidatesSection');
const candidatesListDiv = document.getElementById('candidatesList');
const resultsSection = document.getElementById('resultsSection');
const resultsListDiv = document.getElementById('resultsList');
const registeredVotersDiv = document.getElementById('registeredVoters');
const votersListDiv = document.getElementById('votersList');
const loadingIndicator = document.getElementById('loadingIndicator');
const contractStateSpan = document.getElementById('contractState');
const totalVotersSpan = document.getElementById('totalVoters');
const totalVotesSpan = document.getElementById('totalVotes');
const currentVoterNameSpan = document.getElementById('currentVoterName');
const hasVotedSpan = document.getElementById('hasVoted');
const winnerNameSpan = document.getElementById('winnerName');
const registerVoterButton = document.getElementById('registerVoter');
const startVotingButton = document.getElementById('startVoting');
const endVotingButton = document.getElementById('endVoting');
const voterAddressInput = document.getElementById('voterAddress');
const voterNameInput = document.getElementById('voterName');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const bodyElement = document.body;
const notificationArea = document.getElementById('notificationArea'); // Assuming you have this div in your HTML

// --- Theme Functions ---
function setTheme(theme) {
    if (theme === 'dark') {
        bodyElement.classList.add('dark-mode');
        themeToggleBtn.innerHTML = '🌙'; // Use icons
        localStorage.setItem('theme', 'dark');
    } else {
        bodyElement.classList.remove('dark-mode');
        themeToggleBtn.innerHTML = '☀️'; // Use icons
        localStorage.setItem('theme', 'light');
    }
}

function toggleTheme() {
    if (bodyElement.classList.contains('dark-mode')) {
        setTheme('light');
    } else {
        setTheme('dark');
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme) setTheme(savedTheme);
    else if (prefersDark) setTheme('dark');
    else setTheme('light');
}

// --- Core Application Logic ---

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    // Check for existing connection
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    } else {
        console.log("MetaMask not detected or not connected initially.");
        resetUI(); // Ensure clean state
    }

    // Button listeners
    connectButton.addEventListener('click', connectWallet);
    registerVoterButton.addEventListener('click', registerVoter);
    startVotingButton.addEventListener('click', startVoting);
    endVotingButton.addEventListener('click', endVoting);
    // Vote button listeners are added dynamically in loadCandidates()
});

// Connect Wallet Function
async function connectWallet() {
    if (window.ethereum) {
        showLoading("Connecting to wallet...");
        try {
            web3 = new Web3(window.ethereum);
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAccount = accounts[0];
            accountAddressSpan.textContent = userAccount;
            connectButton.style.display = 'none';
            accountArea.style.display = 'block';

            // --- Configuration Check ---
            if (!contractAddress || contractAddress === "YOUR_CONTRACT_ADDRESS_HERE" || contractAddress === "") {
                console.error("Contract address missing in config.js");
                showNotification("Error: Voting contract address not configured.", 5000, 'danger');
                resetUI(); // Reset because we can't proceed
                return;
            }
            if (!contractABI || contractABI.length === 0) {
                console.error("Contract ABI missing or empty in config.js");
                showNotification("Error: Voting contract ABI not configured.", 5000, 'danger');
                resetUI(); // Reset
                return;
            }
            // --- End Configuration Check ---

            votingContract = new web3.eth.Contract(contractABI, contractAddress);

            const official = await votingContract.methods.official().call();
            isOfficial = (official.toLowerCase() === userAccount.toLowerCase());

            adminPanel.style.display = isOfficial ? 'block' : 'none';
            voterPanel.style.display = 'none'; // Hide initially, loadVoterInfo will show it

            // --- Load Initial Data ---
            await refreshContractState(); // Load state first
            await loadVoterInfo();
            await loadCandidates();
            await loadVoters();
            // Results section visibility is handled by refreshContractState

            // --- Setup Wallet Event Listeners ---
            // Remove first to prevent duplicates if connectWallet is somehow called again
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
            // Add fresh listeners
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

            // --- Setup Contract Event Listeners ---
            setupEventListeners(); // This will handle its own cleanup and initialization

            hideLoading();
            console.log("Wallet connected, contract initialized, listeners set up.");
            showNotification("Wallet connected successfully.", 3000, 'success');

        } catch (error) {
            console.error("Error during wallet connection or initialization:", error);
            showNotification(`Connection Error: ${error.message || 'User denied access or unknown error.'}`, 5000, 'danger');
            resetUI(); // Crucial to reset state on any connection error
            hideLoading(); // Ensure loading is hidden on error
        }
    } else {
        console.log("MetaMask is not installed or available.");
        showNotification("MetaMask not detected. Please install MetaMask.", 5000, 'warning');
        resetUI(); // Reset UI if no provider
    }
}

// --- Event Listener Setup and Cleanup ---

function clearContractEventListeners() {
    let cleared = false;
    if (stateChangedListener && typeof stateChangedListener.unsubscribe === 'function') {
        try { stateChangedListener.unsubscribe(); } catch (e) { console.warn("Error unsubscribing stateChangedListener:", e); }
        stateChangedListener = null;
        cleared = true;
    }
    if (voterAddedListener && typeof voterAddedListener.unsubscribe === 'function') {
        try { voterAddedListener.unsubscribe(); } catch (e) { console.warn("Error unsubscribing voterAddedListener:", e); }
        voterAddedListener = null;
        cleared = true;
    }
    if (votedListener && typeof votedListener.unsubscribe === 'function') {
        try { votedListener.unsubscribe(); } catch (e) { console.warn("Error unsubscribing votedListener:", e); }
        votedListener = null;
        cleared = true;
    }

    if (cleared) {
        console.log("Cleared existing contract event listeners.");
    }
    eventListenersInitialized = false; // Reset flag after clearing
}

function setupEventListeners() {
    if (!votingContract) {
        console.warn("Attempted to setup listeners but contract is not initialized.");
        return;
    }
    if (eventListenersInitialized) {
        // console.log("Listeners already initialized."); // Optional: reduce noise
        return;
    }

    console.log("Setting up contract event listeners...");
    clearContractEventListeners(); // Clear any potential old listeners first

    // Listen for state changes
    stateChangedListener = votingContract.events.VotingStateChanged({ fromBlock: 'latest' })
        .on('data', (event) => {
            console.log('Event: VotingStateChanged received:', event.transactionHash);
            const newState = parseInt(event.returnValues.newState);
            // Use timeout to ensure log appears first and avoid potential race conditions with other updates
            setTimeout(() => {
                console.log(`Processing VotingStateChanged for Tx: ${event.transactionHash}, New State: ${contractStateEnum[newState]}`);
                showNotification(`Voting state updated to: ${contractStateEnum[newState]}`, 3000, 'info');
                refreshContractState(); // Update state display, button enables, results visibility
                loadCandidates();       // Reload candidates to update button states/visibility
                // No need to reload voters list on state change usually
            }, 0);
        })
        .on('error', (error, receipt) => {
            console.error('Error on VotingStateChanged listener:', error, receipt);
        });

    // Listen for new voters
    voterAddedListener = votingContract.events.VoterAdded({ fromBlock: 'latest' })
        .on('data', (event) => {
            console.log('Event: VoterAdded received:', event.transactionHash);
            const { voterAddress, voterName } = event.returnValues;
            setTimeout(() => {
                console.log(`Processing VoterAdded for Tx: ${event.transactionHash}, Voter: ${voterName}`);
                showNotification(`Voter registered: ${voterName}`, 3000, 'success');
                refreshContractState(); // Update total voter count
                loadVoters();         // Reload the list of voters
            }, 0);
        })
        .on('error', (error, receipt) => {
            console.error('Error on VoterAdded listener:', error, receipt);
        });

    // Listen for votes
    votedListener = votingContract.events.Voted({ fromBlock: 'latest' })
        .on('data', (event) => {
            console.log('Event: Voted received:', event.transactionHash);
            const { voterAddress, candidateIndex } = event.returnValues;
            setTimeout(() => {
                console.log(`Processing Voted event for Tx: ${event.transactionHash}, Voter: ${voterAddress}`);
                refreshContractState(); // Update total vote count
                loadCandidates();       // Update vote counts on candidate cards & disable buttons if needed
                loadVoters();         // Update the 'voted' status in the voter list

                // Check if the current user is the one who voted
                if (userAccount && voterAddress.toLowerCase() === userAccount.toLowerCase()) {
                    loadVoterInfo(); // Update their specific voter panel
                    showNotification("Your vote has been successfully recorded!", 3000, 'success');
                } else {
                    // Notify subtly about other votes
                    showNotification(`A vote was cast by ${voterAddress.substring(0, 6)}...`, 2000, 'light');
                }
            }, 0);
        })
        .on('error', (error, receipt) => {
            console.error('Error on Voted listener:', error, receipt);
        });

    eventListenersInitialized = true;
    console.log("Contract event listeners are now active.");
}


// --- Wallet Change Handlers ---

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        console.log('Wallet disconnected.');
        showNotification("Wallet disconnected. Please reconnect.", 4000, 'warning');
        resetUI(); // Clean up state and listeners
    } else if (accounts[0].toLowerCase() !== userAccount?.toLowerCase()) { // Check if account *actually* changed
        console.log('Account changed. Reloading page...');
        showNotification("Account changed. Reloading...", 2000, 'info');
        // Reloading is the simplest way to ensure a clean state with the new account
        window.location.reload();
    }
}

function handleChainChanged(_chainId) {
    console.log('Network changed. Reloading page...');
    showNotification("Network changed. Reloading...", 2000, 'info');
    window.location.reload(); // Reload to connect to the correct network context
}

// --- Data Loading Functions ---

async function refreshContractState() {
    if (!votingContract) return null;
    try {
        const stateResult = await votingContract.methods.state().call();
        const state = parseInt(stateResult); // Ensure number
        const totalVoterResult = await votingContract.methods.totalVoter().call();
        const totalVoteResult = await votingContract.methods.totalVote().call();

        contractStateSpan.textContent = contractStateEnum[state] || 'Unknown';
        totalVotersSpan.textContent = totalVoterResult.toString();
        totalVotesSpan.textContent = totalVoteResult.toString();

        // Update badge color
        contractStateSpan.className = 'badge state-badge '; // Reset classes
        if (state === 0) contractStateSpan.classList.add('bg-secondary'); // Created
        else if (state === 1) contractStateSpan.classList.add('bg-success'); // Voting
        else if (state === 2) contractStateSpan.classList.add('bg-danger'); // Ended
        else contractStateSpan.classList.add('bg-dark'); // Unknown

        // Show/hide results
        if (state === 2) { // Ended
            resultsSection.style.display = 'block';
            await loadResults(); // Load results only when ended
        } else {
            resultsSection.style.display = 'none';
        }

        // Enable/disable admin controls based on state
        if (isOfficial) {
            const isCreated = (state === 0);
            const isVoting = (state === 1);
            registerVoterButton.disabled = !isCreated;
            voterAddressInput.disabled = !isCreated;
            voterNameInput.disabled = !isCreated;
            startVotingButton.disabled = !isCreated;
            endVotingButton.disabled = !isVoting;
        }

        return state; // Return state for potential use elsewhere

    } catch (error) {
        console.error("Error refreshing contract state:", error);
        contractStateSpan.textContent = 'Error';
        contractStateSpan.className = 'badge state-badge bg-warning';
        showNotification("Error fetching contract state.", 4000, 'danger');
        return null;
    }
}

async function loadVoterInfo() {
    if (!votingContract || !userAccount) return;
    try {
        // Use a try-catch specifically for the voter check, as it's expected to fail for non-voters
        let voterInfo;
        try {
            voterInfo = await votingContract.methods.voterRegister(userAccount).call();
        } catch (innerError) {
            // This is expected if the user is not registered, don't treat as a major error
            console.log(`User ${userAccount} not registered.`);
            voterPanel.style.display = 'none';
            return; // Exit function, nothing more to do here
        }

        // If the call succeeded, check if the voter has a name (is actually registered)
        if (voterInfo && voterInfo.voterName !== "") {
            voterPanel.style.display = 'block';
            currentVoterNameSpan.textContent = voterInfo.voterName;
            hasVotedSpan.textContent = voterInfo.voted ? 'Yes' : 'No';
            hasVotedSpan.className = voterInfo.voted ? 'text-success fw-bold' : 'text-danger';
        } else {
            // Should technically be caught above, but double-check
            voterPanel.style.display = 'none';
        }
    } catch (error) {
        // Catch unexpected errors during the process
        console.error("Unexpected error loading voter info:", error);
        voterPanel.style.display = 'none';
        currentVoterNameSpan.textContent = 'Error';
        hasVotedSpan.textContent = '-';
        showNotification("Error loading your voter status.", 4000, 'warning');
    }
}

async function loadCandidates() {
    if (!votingContract) return;
    candidatesListDiv.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div>'; // Loading indicator

    try {
        const stateResult = await votingContract.methods.state().call();
        const state = parseInt(stateResult);
        const candidates = await votingContract.methods.getCandidates().call();
        // console.log("Raw candidates from contract:", JSON.stringify(candidates)); // Debugging

        candidatesListDiv.innerHTML = ''; // Clear loading/previous list

        if (!candidates || candidates.length === 0) {
            candidatesListDiv.innerHTML = '<p class="text-muted">No candidates have been added yet.</p>';
            return;
        }

        // Determine if the current user can vote (must be in Voting state, registered, and not voted yet)
        let voterCanVote = false;
        if (userAccount && state === 1) { // Only check if Voting is active
            try {
                const voterInfo = await votingContract.methods.voterRegister(userAccount).call();
                if (voterInfo && voterInfo.voterName !== "" && !voterInfo.voted) {
                    voterCanVote = true;
                }
            } catch (e) {
                // Expected error if user not registered, voterCanVote remains false
                // console.log("User not registered, cannot vote.");
            }
        }

        candidates.forEach((candidate, index) => {
            const candidateCard = document.createElement('div');
            candidateCard.className = 'col-md-4 mb-3 d-flex'; // Use d-flex for equal height cards

            // Vote button logic
            let voteButtonHTML = '';
            if (state === 1) { // Only show vote buttons if Voting is active
                const disabledAttr = !voterCanVote ? 'disabled title="You are not registered, have already voted, or voting is not active."' : '';
                voteButtonHTML = `<button class="btn btn-primary vote-btn w-100" data-index="${index}" ${disabledAttr}>Vote</button>`;
            } else if (state === 0) {
                voteButtonHTML = `<button class="btn btn-secondary w-100" disabled>Voting not started</button>`;
            } else { // state === 2 (Ended) or unknown
                voteButtonHTML = `<button class="btn btn-secondary w-100" disabled>Voting ended</button>`;
            }


            candidateCard.innerHTML = `
                <div class="card candidate-card flex-fill">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${candidate.candidateName}</h5>
                        <p class="card-text vote-count mt-auto mb-2">Votes: <span class="fw-bold">${candidate.voteCount.toString()}</span></p>
                        ${voteButtonHTML}
                    </div>
                </div>
            `;
            candidatesListDiv.appendChild(candidateCard);
        });

        // Add event listeners ONLY to ENABLED vote buttons
        document.querySelectorAll('.vote-btn:not([disabled])').forEach(button => {
            // Remove first to prevent duplicates if loadCandidates is called rapidly
            button.removeEventListener('click', handleVoteButtonClick);
            button.addEventListener('click', handleVoteButtonClick);
        });

    } catch (error) {
        console.error("Error loading candidates:", error);
        candidatesListDiv.innerHTML = '<p class="text-danger">Error loading candidates. Check console.</p>';
        showNotification("Could not load candidates.", 4000, 'warning');
    }
}

// Separate handler for vote clicks to make listener removal easier
function handleVoteButtonClick() {
    const candidateIndex = this.getAttribute('data-index');
    // Disable button immediately to prevent double clicks
    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Voting...';
    voteForCandidate(candidateIndex);
}

async function loadVoters() {
    if (!votingContract) return;
    votersListDiv.innerHTML = '<p><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading registered voters...</p>';

    try {
        const voterAddresses = await votingContract.methods.getVoterAddresses().call();

        if (!voterAddresses || voterAddresses.length === 0) {
            votersListDiv.innerHTML = '<p class="text-muted">No voters registered yet.</p>';
            return;
        }

        const tableHTML = `
            <div class="table-responsive">
                <table class="table table-striped table-hover table-sm caption-top">
                    <caption>List of Registered Voters</caption>
                    <thead class="table-light">
                        <tr>
                            <th scope="col">#</th>
                            <th scope="col">Address</th>
                            <th scope="col">Name</th>
                            <th scope="col">Has Voted</th>
                        </tr>
                    </thead>
                    <tbody id="votersTableBody">
                        <!-- Rows will be populated by JS -->
                    </tbody>
                </table>
            </div>`;
        votersListDiv.innerHTML = tableHTML;
        const votersTableBody = document.getElementById('votersTableBody');

        // Fetch details in parallel
        const detailPromises = voterAddresses.map(address =>
            votingContract.methods.voterRegister(address).call()
                .then(info => ({ address, ...info }))
                .catch(err => {
                    console.warn(`Could not fetch info for ${address}:`, err.message || err);
                    return { address, voterName: 'Error', voted: 'N/A' }; // Graceful error handling per voter
                })
        );

        const voterDetails = await Promise.all(detailPromises);

        // Populate table body
        votersTableBody.innerHTML = ''; // Clear just in case
        voterDetails.forEach((voter, index) => {
            const row = votersTableBody.insertRow();
            const votedStatus = voter.voted === true ? '<span class="text-success">✓ Yes</span>' :
                voter.voted === false ? '<span class="text-danger">✗ No</span>' :
                    '<span class="text-muted">N/A</span>';
            const shortAddress = `${voter.address.substring(0, 6)}...${voter.address.substring(voter.address.length - 4)}`;

            row.innerHTML = `
                <th scope="row">${index + 1}</th>
                <td><small title="${voter.address}">${shortAddress}</small></td>
                <td>${voter.voterName || '<em class="text-muted">N/A</em>'}</td>
                <td>${votedStatus}</td>
            `;
        });

    } catch (error) {
        console.error("Error loading voters list:", error);
        votersListDiv.innerHTML = '<p class="text-danger">Error loading registered voters. Check console.</p>';
        showNotification("Could not load voters list.", 4000, 'warning');
    }
}

async function loadResults() {
    if (!votingContract) return;
    resultsListDiv.innerHTML = '<p><span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading results...</p>';
    winnerNameSpan.textContent = 'Calculating...';

    try {
        // Double-check state - although refreshContractState should handle visibility
        const stateResult = await votingContract.methods.state().call();
        if (parseInt(stateResult) !== 2) {
            console.warn("loadResults called but voting state is not 'Ended'. Hiding section.");
            resultsSection.style.display = 'none';
            return;
        }

        // Fetch winner and all candidates
        // Use Promise.all for slight efficiency gain
        const [winningIndexResult, candidates] = await Promise.all([
            votingContract.methods.winningCandidate().call(),
            votingContract.methods.getCandidates().call()
        ]);
        const winningIndex = parseInt(winningIndexResult); // Ensure number

        if (!candidates || candidates.length === 0) {
            winnerNameSpan.textContent = "N/A (No candidates)";
            resultsListDiv.innerHTML = '<p class="text-muted">No candidates were available in this election.</p>';
            return;
        }

        // Determine winner name - handle potential invalid index (though contract should prevent this if ended)
        const winner = (winningIndex >= 0 && winningIndex < candidates.length)
            ? candidates[winningIndex]
            : null;

        if (winner) {
            winnerNameSpan.textContent = winner.candidateName;
        } else {
            console.warn(`Winning index ${winningIndex} is out of bounds for candidates array.`);
            // Check if there might be a tie (contract logic dependent)
            // For now, indicate calculation issue or tie possibility
            winnerNameSpan.textContent = "Undetermined / Tie?";
        }


        // Sort candidates by vote count (descending) - Safely handle BigInts
        const sortedCandidates = [...candidates].sort((a, b) => {
            const voteA = BigInt(a.voteCount);
            const voteB = BigInt(b.voteCount);
            if (voteB > voteA) return 1;
            if (voteB < voteA) return -1;
            return 0;
        });

        // Build results table
        const tableBodyContent = sortedCandidates.map((candidate, index) => {
            const isWinner = winner && candidate.candidateName === winner.candidateName;
            // Find original index if needed, otherwise just use sorted position
            return `
                <tr ${isWinner ? 'class="table-success fw-bold"' : ''}>
                    <th scope="row">${index + 1}</th>
                    <td>${candidate.candidateName} ${isWinner ? '🏆' : ''}</td>
                    <td>${candidate.voteCount.toString()}</td>
                </tr>
            `;
        }).join('');

        resultsListDiv.innerHTML = `
             <div class="table-responsive">
                <table class="table table-striped table-hover table-sm">
                    <thead class="table-light">
                        <tr>
                            <th scope="col">Rank</th>
                            <th scope="col">Candidate</th>
                            <th scope="col">Votes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBodyContent}
                    </tbody>
                </table>
            </div>
        `;

    } catch (error) {
        console.error("Error loading results:", error);
        winnerNameSpan.textContent = "Error";
        resultsListDiv.innerHTML = '<p class="text-danger">Error loading results. Check console.</p>';
        showNotification("Could not load voting results.", 4000, 'danger');
    }
}

// --- Transaction Functions ---

async function registerVoter() {
    const voterAddress = voterAddressInput.value.trim();
    const voterName = voterNameInput.value.trim();

    if (!web3.utils.isAddress(voterAddress)) {
        showNotification("Invalid Ethereum address.", 3000, 'warning');
        return;
    }
    if (!voterName) {
        showNotification("Voter name cannot be empty.", 3000, 'warning');
        return;
    }
    if (!votingContract || !userAccount || !isOfficial) {
        showNotification("Cannot register voter: Not connected or not authorized.", 4000, 'danger');
        return;
    }

    showLoading("Registering voter...");
    registerVoterButton.disabled = true; // Disable button during TX
    try {
        const tx = await votingContract.methods.addVoter(voterAddress, voterName).send({ from: userAccount });
        console.log("Register Voter TX successful:", tx.transactionHash);
        hideLoading();
        // Notification will be shown by the VoterAdded event listener
        // Refresh counts immediately
        await refreshContractState();
        // Optionally clear fields on success (or let event trigger list reload)
        voterAddressInput.value = '';
        voterNameInput.value = '';
        // loadVoters() will be called by the event listener
    } catch (error) {
        console.error("Error registering voter:", error);
        hideLoading();
        showNotification(`Error registering voter: ${error.message || 'Transaction failed.'}`, 5000, 'danger');
    } finally {
        // Re-enable button based on current state, even if TX failed
        const stateResult = await votingContract.methods.state().call();
        registerVoterButton.disabled = !(isOfficial && parseInt(stateResult) === 0);
    }
}

async function startVoting() {
    if (!votingContract || !userAccount || !isOfficial) {
        showNotification("Cannot start voting: Not connected or not authorized.", 4000, 'danger');
        return;
    }

    showLoading("Starting the voting period...");
    startVotingButton.disabled = true; // Disable button during TX
    try {
        const tx = await votingContract.methods.startVote().send({ from: userAccount });
        console.log("Start Voting TX successful:", tx.transactionHash);
        hideLoading();
        // State update and candidate list refresh will be handled by VotingStateChanged event listener
        // await refreshContractState(); // Optional: For slightly faster UI feedback before event
        // await loadCandidates();      // Optional: For slightly faster UI feedback before event
    } catch (error) {
        console.error("Error starting voting:", error);
        hideLoading();
        showNotification(`Error starting voting: ${error.message || 'Transaction failed.'}`, 5000, 'danger');
    } finally {
        // Re-enable button based on current state (refresh might be needed)
        const stateResult = await votingContract.methods.state().call();
        startVotingButton.disabled = !(isOfficial && parseInt(stateResult) === 0);
    }
}

async function endVoting() {
    if (!votingContract || !userAccount || !isOfficial) {
        showNotification("Cannot end voting: Not connected or not authorized.", 4000, 'danger');
        return;
    }

    showLoading("Ending the voting period...");
    endVotingButton.disabled = true; // Disable button during TX
    try {
        const tx = await votingContract.methods.endVote().send({ from: userAccount });
        console.log("End Voting TX successful:", tx.transactionHash);
        hideLoading();
        // State update, results loading, and candidate list refresh handled by VotingStateChanged event
        // await refreshContractState(); // Optional: Faster feedback
        // await loadCandidates();      // Optional: Faster feedback
    } catch (error) {
        console.error("Error ending voting:", error);
        hideLoading();
        showNotification(`Error ending voting: ${error.message || 'Transaction failed.'}`, 5000, 'danger');
    } finally {
        // Re-enable button based on current state (refresh might be needed)
        const stateResult = await votingContract.methods.state().call();
        endVotingButton.disabled = !(isOfficial && parseInt(stateResult) === 1);
    }
}

async function voteForCandidate(candidateIndex) {
    if (!votingContract || !userAccount) {
        showNotification("Cannot vote: Wallet not connected.", 4000, 'danger');
        return;
    }
    if (candidateIndex === null || candidateIndex === undefined) {
        console.error("Invalid candidate index provided for voting.");
        showNotification("Internal error: Invalid candidate selected.", 4000, 'danger');
        // Re-enable buttons if needed after fixing the error state
        await loadCandidates();
        return;
    }

    showLoading("Submitting your vote...");
    // Buttons are disabled in handleVoteButtonClick, keep them disabled here
    try {
        const tx = await votingContract.methods.vote(candidateIndex).send({ from: userAccount });
        console.log("Vote TX successful:", tx.transactionHash);
        hideLoading();
        // Vote confirmation notification, candidate counts, and voter status updates
        // are handled by the Voted event listener.
        // You might want immediate feedback for the current user's status:
        await refreshContractState(); // Update total votes count quickly
        await loadVoterInfo();      // Update "Has Voted" status for current user quickly
        // loadCandidates() and loadVoters() are handled by the event listener

    } catch (error) {
        console.error("Error casting vote:", error);
        hideLoading();
        showNotification(`Error casting vote: ${error.message || 'Transaction failed or rejected.'}`, 5000, 'danger');
        // If the vote failed, re-enable the buttons by reloading candidates
        await loadCandidates(); // Reload candidates to potentially re-enable the buttons
    }
    // No finally block needed to re-enable buttons, as loadCandidates is called on error,
    // and on success, the Voted event handler's loadCandidates call will show disabled buttons anyway.
}

// --- UI Helper Functions ---

function showLoading(message = "Processing transaction...") {
    if (!loadingIndicator) return;
    loadingIndicator.querySelector('p').textContent = message;
    loadingIndicator.style.display = 'flex'; // Use flex for centering if styled that way
}

function hideLoading() {
    if (!loadingIndicator) return;
    loadingIndicator.style.display = 'none';
}

function resetUI() {
    console.log("Resetting UI and clearing state...");
    // Clear contract/web3 state
    web3 = null;
    votingContract = null;
    userAccount = null;
    isOfficial = false;

    // IMPORTANT: Clear listeners before nulling contract
    clearContractEventListeners(); // Clear contract listeners
    // Remove wallet listeners (important to avoid leaks on soft disconnect)
    if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        console.log("Removed wallet event listeners.");
    }

    // Reset DOM elements
    accountAddressSpan.textContent = 'N/A';
    accountArea.style.display = 'none';
    connectButton.style.display = 'block';
    adminPanel.style.display = 'none';
    voterPanel.style.display = 'none';
    resultsSection.style.display = 'none';
    candidatesSection.style.display = 'block'; // Usually keep candidates section visible

    contractStateSpan.textContent = 'N/A';
    contractStateSpan.className = 'badge state-badge bg-dark'; // Dark/disconnected state
    totalVotersSpan.textContent = '-';
    totalVotesSpan.textContent = '-';
    currentVoterNameSpan.textContent = '-';
    hasVotedSpan.textContent = '-';
    winnerNameSpan.textContent = '-';

    candidatesListDiv.innerHTML = '<p class="text-muted">Connect your wallet to interact with the voting application.</p>';
    votersListDiv.innerHTML = '<p class="text-muted">Connect your wallet to view registered voters.</p>';
    resultsListDiv.innerHTML = ''; // Clear results area

    // Reset admin inputs/buttons state if they exist
    if (registerVoterButton) registerVoterButton.disabled = true;
    if (startVotingButton) startVotingButton.disabled = true;
    if (endVotingButton) endVotingButton.disabled = true;
    if (voterAddressInput) voterAddressInput.disabled = true;
    if (voterNameInput) voterNameInput.disabled = true;

    hideLoading(); // Ensure loading indicator is hidden
    console.log("UI Reset complete.");
}

// Simple Notification Function (using Bootstrap Alerts)
function showNotification(message, duration = 3500, type = 'info') {
    // types: primary, secondary, success, danger, warning, info, light, dark
    if (!notificationArea) {
        console.warn("Notification area element not found. Cannot display message:", message);
        return;
    }

    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type} alert-dismissible fade show shadow-sm m-2`; // Added margin
    alertElement.setAttribute('role', 'alert');
    alertElement.style.minWidth = '250px'; // Ensure minimum width
    alertElement.style.transition = 'opacity 0.5s ease-out'; // Smooth fade

    alertElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    notificationArea.appendChild(alertElement);

    // Auto-dismiss using Bootstrap's Alert component
    const bsAlert = new bootstrap.Alert(alertElement);
    setTimeout(() => {
        bsAlert.close(); // Trigger Bootstrap's close method
    }, duration);

    // Fallback removal in case Bootstrap isn't fully loaded or alert is manually dismissed early
    alertElement.addEventListener('closed.bs.alert', () => {
        // Optional: console.log("Notification closed");
    });
}