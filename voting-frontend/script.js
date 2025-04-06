let web3;
let votingContract;
let userAccount;
let isOfficial = false;
let eventListenersInitialized = false;
// contractStateEnum is also available from config.js

// --- DOM Element References ---
// It's good practice to get references once if they are used multiple times
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

// --- Core Functions ---

function setTheme(theme) {
    if (theme === 'dark') {
        bodyElement.classList.add('dark-mode');
        themeToggleBtn.innerHTML = '🌙 Dark'; // Or use actual icons
        localStorage.setItem('theme', 'dark');
    } else {
        bodyElement.classList.remove('dark-mode');
        themeToggleBtn.innerHTML = '☀️ Light'; // Or use actual icons
        localStorage.setItem('theme', 'light');
    }
}

// --- Theme Toggle Logic ---
function toggleTheme() {
    if (bodyElement.classList.contains('dark-mode')) {
        setTheme('light');
    } else {
        setTheme('dark');
    }
}

// --- Initialize Theme on Load ---
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        // Use saved theme if available
        setTheme(savedTheme);
    } else if (prefersDark) {
        // Otherwise, use OS preference
        setTheme('dark');
    } else {
        // Default to light if no preference found
        setTheme('light');
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme first
    initializeTheme();

    // Add listener for the toggle button
    if (themeToggleBtn) { // Ensure button exists
        themeToggleBtn.addEventListener('click', toggleTheme);
    } else {
        console.warn("Theme toggle button not found.");
    }

    // --- Keep your existing DOMContentLoaded logic below ---
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet();
    } else {
        console.log("MetaMask not detected or not connected initially.");
        resetUI();
    }
    connectButton.addEventListener('click', connectWallet);
    registerVoterButton.addEventListener('click', registerVoter);
    startVotingButton.addEventListener('click', startVoting);
    endVotingButton.addEventListener('click', endVoting);
});

// Connect to MetaMask
async function connectWallet() {
    if (window.ethereum) {
        try {
            web3 = new Web3(window.ethereum);
            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAccount = accounts[0];
            accountAddressSpan.textContent = userAccount;
            connectButton.style.display = 'none';
            accountArea.style.display = 'block';

            // Initialize contract (ABI and Address from config.js)
            if (!contractAddress || contractAddress === "YOUR_CONTRACT_ADDRESS_HERE" || contractAddress === "") {
                alert("Contract address is not set! Please update config.js");
                return;
            }
            if (!contractABI || contractABI.length === 0) {
                alert("Contract ABI is not set! Please check config.js");
                return;
            }

            votingContract = new web3.eth.Contract(contractABI, contractAddress);

            // Check if user is official
            const official = await votingContract.methods.official().call();
            isOfficial = (official.toLowerCase() === userAccount.toLowerCase());

            if (isOfficial) {
                adminPanel.style.display = 'block';
            } else {
                adminPanel.style.display = 'none';
            }

            // Load initial data
            await refreshContractState(); // Wait for state first
            await loadVoterInfo();
            await loadCandidates();
            await loadVoters();

            // Setup listeners for wallet changes
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

        } catch (error) {
            console.error("User denied account access or error occurred:", error);
            alert(`Error connecting to MetaMask: ${error.message || error}`);
            resetUI(); // Reset UI if connection fails
        }
    } else {
        alert("MetaMask is not installed. Please install MetaMask to use this DApp.");
    }
}

// Handle wallet account changes
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        // MetaMask is locked or the user has disconnected accounts
        console.log('Please connect to MetaMask.');
        resetUI();
        alert("MetaMask disconnected. Please reconnect.");
    } else {
        // Reload the page to re-initialize with the new account
        window.location.reload();
    }
}

// Handle network changes
function handleChainChanged(_chainId) {
    // Reload the page to ensure connection to the correct network and contract
    console.log('Network changed. Reloading...');
    window.location.reload();
}


// Refresh contract state information
async function refreshContractState() {
    if (!votingContract) return;
    try {
        const state = parseInt(await votingContract.methods.state().call()); // Ensure state is number
        const totalVoter = await votingContract.methods.totalVoter().call();
        const totalVote = await votingContract.methods.totalVote().call();

        contractStateSpan.textContent = contractStateEnum[state] || 'Unknown';
        totalVotersSpan.textContent = totalVoter.toString();
        totalVotesSpan.textContent = totalVote.toString();

        // Update badge color based on state
        contractStateSpan.className = 'badge state-badge '; // Reset classes
        if (state === 0) contractStateSpan.classList.add('bg-secondary'); // Created
        else if (state === 1) contractStateSpan.classList.add('bg-success'); // Voting
        else if (state === 2) contractStateSpan.classList.add('bg-danger'); // Ended
        else contractStateSpan.classList.add('bg-dark'); // Unknown

        // Show/hide results section based on state
        if (state === 2) { // Ended
            resultsSection.style.display = 'block';
            await loadResults();
        } else {
            resultsSection.style.display = 'none';
        }

        // Enable/disable admin buttons based on state
        if (isOfficial) {
            startVotingButton.disabled = (state !== 0); // Can only start if Created
            endVotingButton.disabled = (state !== 1);   // Can only end if Voting
            registerVoterButton.disabled = (state !== 0); // Can only register if Created
            voterAddressInput.disabled = (state !== 0);
            voterNameInput.disabled = (state !== 0);
        }

        return state; // Return state for other functions to use

    } catch (error) {
        console.error("Error refreshing contract state:", error);
        contractStateSpan.textContent = 'Error';
        contractStateSpan.className = 'badge state-badge bg-warning';
    }
    return null; // Indicate error or no state fetched
}

// Load voter information for the current user
async function loadVoterInfo() {
    if (!votingContract || !userAccount) return;
    try {
        const voterInfo = await votingContract.methods.voterRegister(userAccount).call();

        if (voterInfo && voterInfo.voterName !== "") { // Check if voterName exists and is not empty
            voterPanel.style.display = 'block';
            currentVoterNameSpan.textContent = voterInfo.voterName;
            hasVotedSpan.textContent = voterInfo.voted ? 'Yes' : 'No';
        } else {
            voterPanel.style.display = 'none'; // Hide if user is not a registered voter
            currentVoterNameSpan.textContent = '-';
            hasVotedSpan.textContent = '-';
        }
    } catch (error) {
        // It's common for this call to revert if the address isn't registered, so handle gracefully
        if (error.message.includes("Voter not registered")) {
            console.log("Current user is not a registered voter.");
            voterPanel.style.display = 'none';
        } else {
            console.error("Error loading voter info:", error);
        }
        currentVoterNameSpan.textContent = 'Error';
        hasVotedSpan.textContent = '-';
    }
}

// Load all candidates
async function loadCandidates() {
    if (!votingContract) return;

    candidatesListDiv.innerHTML = '';

    try {
        const state = parseInt(await votingContract.methods.state().call()); // Get current state
        const candidates = await votingContract.methods.getCandidates().call();
        candidatesListDiv.innerHTML = ''; // Clear previous list

        if (!candidates || candidates.length === 0) {
            candidatesListDiv.innerHTML = '<p>No candidates available.</p>';
            return;
        }

        // Get voter status to enable/disable vote buttons
        let voterCanVote = false;
        if (userAccount && state === 1) { // Only check if voting is active
            try {
                const voterInfo = await votingContract.methods.voterRegister(userAccount).call();
                if (voterInfo && voterInfo.voterName !== "" && !voterInfo.voted) {
                    voterCanVote = true;
                }
            } catch (e) {
                // Ignore error if user not registered, voterCanVote remains false
                console.log("User not registered, cannot vote.");
            }
        }


        candidates.forEach((candidate, index) => {
            const candidateCard = document.createElement('div');
            candidateCard.className = 'col-md-4 mb-3';
            // Conditionally add vote button
            let voteButtonHTML = '';
            if (state === 1) { // Voting state
                const canVoteThisCandidate = voterCanVote; // Can vote if registered and hasn't voted
                voteButtonHTML = `<button class="btn btn-primary vote-btn" data-index="${index}" ${!canVoteThisCandidate ? 'disabled' : ''}>Vote</button>`;
            }

            candidateCard.innerHTML = `
                <div class="card candidate-card h-100">
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${candidate.candidateName}</h5>
                        <p class="card-text vote-count mt-auto">${candidate.voteCount} votes</p>
                        ${voteButtonHTML}
                    </div>
                </div>
            `;
            candidatesListDiv.appendChild(candidateCard);
        });

        // Add event listeners ONLY to enabled vote buttons
        document.querySelectorAll('.vote-btn:not([disabled])').forEach(button => {
            // Remove existing listener to prevent duplicates if reloaded
            button.removeEventListener('click', handleVoteButtonClick);
            button.addEventListener('click', handleVoteButtonClick);
        });

    } catch (error) {
        console.error("Error loading candidates:", error);
        candidatesListDiv.innerHTML = '<p class="text-danger">Error loading candidates. Check console.</p>';
    }
}

// Handler for vote button clicks (to easily remove listener)
function handleVoteButtonClick() {
    const candidateIndex = this.getAttribute('data-index');
    voteForCandidate(candidateIndex);
}


// Load registered voters list
async function loadVoters() {
    if (!votingContract) return;
    votersListDiv.innerHTML = '<p>Loading voters...</p>'; // Show loading indicator
    try {
        const voterAddresses = await votingContract.methods.getVoterAddresses().call();

        if (!voterAddresses || voterAddresses.length === 0) {
            votersListDiv.innerHTML = '<p>No voters registered yet.</p>';
            return;
        }

        // Create table structure
        votersListDiv.innerHTML = `
            <table class="table table-striped table-sm">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Address</th>
                        <th scope="col">Name</th>
                        <th scope="col">Voted</th>
                    </tr>
                </thead>
                <tbody id="votersTableBody">
                    <!-- Rows will be inserted here -->
                </tbody>
            </table>
        `;
        const votersTableBody = document.getElementById('votersTableBody');
        votersTableBody.innerHTML = ''; // Clear just in case

        // Fetch details for each voter (can be slow for many voters)
        // Consider pagination or loading details on demand for large lists
        let voterPromises = voterAddresses.map(address =>
            votingContract.methods.voterRegister(address).call()
                .then(info => ({ address, ...info })) // Combine address with fetched info
                .catch(err => {
                    console.warn(`Could not fetch info for ${address}:`, err);
                    return { address, voterName: 'Error', voted: 'N/A' }; // Handle potential errors
                })
        );

        const voterDetails = await Promise.all(voterPromises);


        // Populate table
        voterDetails.forEach((voter, index) => {
            const row = votersTableBody.insertRow();
            row.innerHTML = `
                <th scope="row">${index + 1}</th>
                <td><small>${voter.address}</small></td>
                <td>${voter.voterName || 'N/A'}</td>
                <td>${voter.voted === true ? '✓ Yes' : (voter.voted === false ? '✗ No' : 'N/A')}</td>
            `;
        });


    } catch (error) {
        console.error("Error loading voters:", error);
        votersListDiv.innerHTML = '<p class="text-danger">Error loading registered voters. Check console.</p>';
    }
}


// Load results after voting has ended
async function loadResults() {
    if (!votingContract) return;
    resultsListDiv.innerHTML = '<p>Loading results...</p>'; // Loading indicator
    winnerNameSpan.textContent = 'Calculating...';
    try {
        // Ensure voting has actually ended
        const state = parseInt(await votingContract.methods.state().call());
        if (state !== 2) {
            console.log("Voting has not ended yet.");
            resultsSection.style.display = 'none'; // Hide results section if not ended
            return;
        }

        const winningIndex = await votingContract.methods.winningCandidate().call();
        const candidates = await votingContract.methods.getCandidates().call();

        if (!candidates || candidates.length === 0) {
            winnerNameSpan.textContent = "No candidates";
            resultsListDiv.innerHTML = '<p>No candidates found.</p>';
            return;
        }

        // Handle potential tie or no votes case if winningCandidate returns default/invalid index
        // Smart contract logic should ideally handle ties clearly. Assuming index is valid if state is Ended.
        winnerNameSpan.textContent = candidates[winningIndex].candidateName;

        // Create a sorted list of candidates by vote count (descending)
        const sortedCandidates = [...candidates].sort((a, b) => {
            // Ensure we are comparing BigInts
            const voteA = BigInt(a.voteCount);
            const voteB = BigInt(b.voteCount);

            // Perform comparison using BigInt logic, return Number for sort()
            if (voteB > voteA) {
                return 1; // b should come before a (for descending order)
            } else if (voteB < voteA) {
                return -1; // a should come before b
            } else {
                return 0; // a and b are equal in terms of vote count
            }
        });

        // Build results table
        resultsListDiv.innerHTML = `
            <table class="table table-striped table-hover table-sm">
                <thead>
                    <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Candidate</th>
                        <th scope="col">Votes</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedCandidates.map((candidate, index) => `
                        <tr ${candidate.candidateName === candidates[winningIndex].candidateName ? 'class="table-success fw-bold"' : ''}>
                            <th scope="row">${index + 1}</th>
                            <td>${candidate.candidateName}</td>
                            <td>${candidate.voteCount.toString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error("Error loading results:", error);
        winnerNameSpan.textContent = "Error";
        resultsListDiv.innerHTML = '<p class="text-danger">Error loading results. Check console.</p>';
    }
}

// --- Transaction Functions (Admin & Voter Actions) ---

// Register a new voter (Admin only)
async function registerVoter() {
    const voterAddress = voterAddressInput.value.trim();
    const voterName = voterNameInput.value.trim();

    if (!web3.utils.isAddress(voterAddress)) {
        alert("Please enter a valid Ethereum address.");
        return;
    }
    if (!voterName) {
        alert("Please enter the voter's name.");
        return;
    }
    if (!votingContract || !userAccount || !isOfficial) {
        alert("Admin account not connected or contract not initialized.");
        return;
    }

    showLoading("Registering voter...");
    try {
        const tx = await votingContract.methods.addVoter(voterAddress, voterName).send({ from: userAccount });
        console.log("Transaction successful:", tx);
        voterAddressInput.value = ''; // Clear fields on success
        voterNameInput.value = '';
        await loadVoters(); // Refresh the list
        await refreshContractState(); // Refresh counts
        hideLoading();
        alert("Voter registered successfully!");
    } catch (error) {
        console.error("Error registering voter:", error);
        hideLoading();
        alert(`Error registering voter: ${error.message}`);
    }
}

// Start voting period (Admin only)
async function startVoting() {
    if (!votingContract || !userAccount || !isOfficial) {
        alert("Admin account not connected or contract not initialized.");
        return;
    }
    showLoading("Starting the voting period...");
    try {
        const tx = await votingContract.methods.startVote().send({ from: userAccount });
        console.log("Transaction successful:", tx);
        await refreshContractState(); // Update UI immediately
        await loadCandidates(); // Reload candidates to show vote buttons
        hideLoading();
        alert("Voting has started!");
    } catch (error) {
        console.error("Error starting voting:", error);
        hideLoading();
        alert(`Error starting voting: ${error.message}`);
    }
}

// End voting period (Admin only)
async function endVoting() {
    if (!votingContract || !userAccount || !isOfficial) {
        alert("Admin account not connected or contract not initialized.");
        return;
    }
    showLoading("Ending the voting period...");
    try {
        const tx = await votingContract.methods.endVote().send({ from: userAccount });
        console.log("Transaction successful:", tx);
        await refreshContractState(); // Update UI (will trigger results load)
        await loadCandidates(); // Reload candidates to remove vote buttons
        hideLoading();
        alert("Voting has ended!");
    } catch (error) {
        console.error("Error ending voting:", error);
        hideLoading();
        alert(`Error ending voting: ${error.message}`);
    }
}

// Vote for a candidate (Voter action)
async function voteForCandidate(candidateIndex) {
    if (!votingContract || !userAccount) {
        alert("Wallet not connected or contract not initialized.");
        return;
    }
    if (candidateIndex === null || candidateIndex === undefined) {
        console.error("Invalid candidate index provided.");
        return;
    }

    showLoading("Submitting your vote...");
    try {
        const tx = await votingContract.methods.vote(candidateIndex).send({ from: userAccount });
        console.log("Transaction successful:", tx);
        // Refresh relevant parts of the UI
        await refreshContractState();
        await loadCandidates(); // Show updated counts and disable button
        await loadVoterInfo();  // Show voted status
        await loadVoters();     // Update voted status in list
        hideLoading();
        alert("Vote cast successfully!");
    } catch (error) {
        console.error("Error casting vote:", error);
        hideLoading();
        alert(`Error casting vote: ${error.message}. Make sure you are registered and haven't voted yet.`);
    }
}

// --- UI Helper Functions ---

// Show loading indicator with optional message
function showLoading(message = "Processing transaction...") {
    loadingIndicator.querySelector('p').textContent = message;
    loadingIndicator.style.display = 'block';
}

// Hide loading indicator
function hideLoading() {
    loadingIndicator.style.display = 'none';
}

// Reset UI elements to initial state (e.g., on disconnect)
function resetUI() {
    accountAddressSpan.textContent = '';
    accountArea.style.display = 'none';
    connectButton.style.display = 'block';
    adminPanel.style.display = 'none';
    voterPanel.style.display = 'none';
    resultsSection.style.display = 'none';

    contractStateSpan.textContent = 'Loading...';
    contractStateSpan.className = 'badge bg-secondary state-badge';
    totalVotersSpan.textContent = '-';
    totalVotesSpan.textContent = '-';
    candidatesListDiv.innerHTML = '<p>Connect wallet to load candidates.</p>';
    votersListDiv.innerHTML = '<p>Connect wallet to load voters.</p>';

    web3 = null;
    votingContract = null;
    userAccount = null;
    isOfficial = false;
}

function setupEventListeners() {
    if (!votingContract || eventListenersInitialized) {
        console.log("Event listeners already initialized or contract not ready.");
        return;
    }

    console.log("Setting up contract event listeners...");

    // Listen for state changes (Start/End Voting)
    votingContract.events.VotingStateChanged({ fromBlock: 'latest' })
        .on('data', (event) => {
            console.log('VotingStateChanged event received:', event);
            const newState = parseInt(event.returnValues.newState);
            console.log(`Voting state changed to: ${contractStateEnum[newState]}`);
            // Refresh core state display and potentially results/candidate buttons
            refreshContractState(); // This handles UI changes based on state
            loadCandidates();       // Reload candidates to update button states/visibility
            showNotification(`Voting state updated to: ${contractStateEnum[newState]}`);
        })
        .on('error', (error) => {
            console.error('Error listening to VotingStateChanged:', error);
        });

    // Listen for new voters being added
    votingContract.events.VoterAdded({ fromBlock: 'latest' })
        .on('data', (event) => {
            console.log('VoterAdded event received:', event);
            const { voterAddress, voterName } = event.returnValues;
            console.log(`New voter added: ${voterName} (${voterAddress})`);
            // Refresh the voters list and total count
            refreshContractState(); // Update total voter count
            loadVoters();         // Reload the list of voters
            showNotification(`Voter registered: ${voterName}`);
        })
        .on('error', (error) => {
            console.error('Error listening to VoterAdded:', error);
        });

    // Listen for votes being cast
    votingContract.events.Voted({ fromBlock: 'latest' })
        .on('data', (event) => {
            console.log('Voted event received:', event);
            const { voterAddress, candidateIndex } = event.returnValues;
            console.log(`Vote cast by ${voterAddress} for candidate index ${candidateIndex}`);
            // Refresh vote counts, total votes, and potentially voter status
            refreshContractState(); // Update total vote count
            loadCandidates();       // Update vote counts on candidate cards
            loadVoters();         // Update the 'voted' status in the voter list

            // If the current user is the one who voted, update their specific panel
            if (userAccount && voterAddress.toLowerCase() === userAccount.toLowerCase()) {
                loadVoterInfo();
                showNotification("Your vote has been confirmed!");
            } else {
                // Optionally show a generic notification for other votes
                showNotification("A vote was cast.");
            }
        })
        .on('error', (error) => {
            console.error('Error listening to Voted:', error);
        });

    eventListenersInitialized = true; // Mark as initialized
    console.log("Event listeners are active.");
}

// --- Modify connectWallet ---
async function connectWallet() {
    if (window.ethereum) {
        try {
            web3 = new Web3(window.ethereum);
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAccount = accounts[0];
            accountAddressSpan.textContent = userAccount;
            connectButton.style.display = 'none';
            accountArea.style.display = 'block';

            if (!contractAddress || contractAddress === "YOUR_CONTRACT_ADDRESS_HERE" || contractAddress === "") {
                alert("Contract address is not set! Please update config.js");
                resetUI(); return; // Added resetUI
            }
            if (!contractABI || contractABI.length === 0) {
                alert("Contract ABI is not set! Please check config.js");
                resetUI(); return; // Added resetUI
            }

            votingContract = new web3.eth.Contract(contractABI, contractAddress);

            const official = await votingContract.methods.official().call();
            isOfficial = (official.toLowerCase() === userAccount.toLowerCase());

            if (isOfficial) {
                adminPanel.style.display = 'block';
            } else {
                adminPanel.style.display = 'none';
            }

            // Load initial data
            await refreshContractState();
            await loadVoterInfo();
            await loadCandidates();
            await loadVoters();

            // Setup listeners for wallet changes
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

            // ****** Setup Contract Event Listeners ******
            setupEventListeners();
            // *******************************************

        } catch (error) {
            console.error("User denied account access or error occurred:", error);
            alert(`Error connecting to MetaMask: ${error.message || error}`);
            resetUI();
        }
    } else {
        alert("MetaMask is not installed. Please install MetaMask to use this DApp.");
        resetUI(); // Ensure UI resets if MetaMask isn't found
    }
}

// --- Add a simple notification function (optional enhancement) ---
function showNotification(message, duration = 3000) {
    // You can replace this with a more sophisticated toast library
    const notificationArea = document.getElementById('notificationArea');
    if (!notificationArea) { // Create it if it doesn't exist
        const container = document.querySelector('.container');
        const div = document.createElement('div');
        div.id = 'notificationArea';
        div.style.position = 'fixed';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.zIndex = '2000';
        container?.parentNode?.insertBefore(div, container.nextSibling); // Append after container
    }

    const notificationElement = document.createElement('div');
    notificationElement.className = 'alert alert-info alert-dismissible fade show shadow-sm'; // Use Bootstrap alert
    notificationElement.style.minWidth = '250px';
    notificationElement.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    document.getElementById('notificationArea')?.appendChild(notificationElement);

    // Auto-dismiss
    setTimeout(() => {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(notificationElement);
        if (bsAlert) {
            bsAlert.close();
        } else {
            notificationElement.remove(); // Fallback removal
        }
    }, duration);
}

// --- Modify resetUI to handle potential listeners ---
function resetUI() {
    // ... (keep existing reset logic) ...
    accountAddressSpan.textContent = '';
    accountArea.style.display = 'none';
    connectButton.style.display = 'block';
    adminPanel.style.display = 'none';
    voterPanel.style.display = 'none';
    resultsSection.style.display = 'none';

    contractStateSpan.textContent = 'N/A'; // Indicate not connected
    contractStateSpan.className = 'badge bg-dark state-badge'; // Use a 'disconnected' color
    totalVotersSpan.textContent = '-';
    totalVotesSpan.textContent = '-';
    candidatesListDiv.innerHTML = '<p>Connect wallet to load candidates.</p>';
    votersListDiv.innerHTML = '<p>Connect wallet to load voters.</p>';
    winnerNameSpan.textContent = '-'; // Reset winner

    // Clean up Web3 objects and flags
    web3 = null;
    votingContract = null; // Crucial: Ensure contract object is cleared
    userAccount = null;
    isOfficial = false;
    eventListenersInitialized = false; // Allow listeners to be setup again on reconnect

    // Remove Ethereum listeners to prevent memory leaks if page isn't reloaded
    if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
    }
    console.log("UI Reset and Listeners potentially cleaned up.");
}

// --- Modify handleAccountsChanged and handleChainChanged ---
// Ensure they call resetUI or reload properly

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        console.log('MetaMask disconnected.');
        resetUI(); // Call resetUI to clean state
        showNotification("Wallet disconnected. Please reconnect.", 5000);
    } else if (accounts[0] !== userAccount) { // Check if account actually changed
        console.log('Account changed. Reloading page...');
        showNotification("Account changed. Reloading...", 3000);
        // Reloading is the simplest way to ensure everything re-initializes correctly
        window.location.reload();
    }
}

function handleChainChanged(_chainId) {
    console.log('Network changed. Reloading page...');
    showNotification("Network changed. Reloading...", 3000);
    window.location.reload();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if MetaMask is already connected (e.g., page refresh)
    if (window.ethereum && window.ethereum.selectedAddress) {
        connectWallet(); // Attempt to connect if already authorized
    } else {
        console.log("MetaMask not detected or not connected initially.");
        resetUI(); // Ensure clean state if no wallet connected
    }

    // Button listeners
    connectButton.addEventListener('click', connectWallet);
    registerVoterButton.addEventListener('click', registerVoter);
    startVotingButton.addEventListener('click', startVoting);
    endVotingButton.addEventListener('click', endVoting);

    // Note: Vote button listeners are added dynamically in loadCandidates()
});