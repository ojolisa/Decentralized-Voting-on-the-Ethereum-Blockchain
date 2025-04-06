// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    enum State {
        Created,
        Voting,
        Ended
    }
    State public state;

    address public official;

    struct Voter {
        string voterName;
        bool voted;
    }

    struct Candidate {
        string candidateName;
        uint256 voteCount;
    }

    mapping(address => Voter) public voterRegister;
    address[] public voterAddresses;

    Candidate[] public candidates;
    uint256 public totalVoter;
    uint256 public totalVote;

    // --- Events ---
    event VotingStateChanged(State newState);
    event VoterAdded(address indexed voterAddress, string voterName);
    event Voted(address indexed voterAddress, uint256 indexed candidateIndex);

    modifier condition(bool _condition) {
        require(_condition, "Condition failed");
        _;
    }

    modifier onlyOfficial() {
        require(
            msg.sender == official,
            "Only official can perform this action"
        );
        _;
    }

    modifier inState(State _state) {
        require(state == _state, "Invalid state for this action");
        _;
    }

    constructor(string[] memory candidateNames) {
        official = msg.sender;
        for (uint256 i = 0; i < candidateNames.length; i++) {
            candidates.push(
                Candidate({candidateName: candidateNames[i], voteCount: 0})
            );
        }
        state = State.Created;
        // Although the state starts as Created, emitting here might be noisy.
        // It's usually better to emit on *changes*.
        // emit VotingStateChanged(State.Created); // Optional: Emit initial state
    }

    function addVoter(address _voterAddress, string memory _voterName)
        public
        inState(State.Created)
        onlyOfficial
    {
        require(
            bytes(voterRegister[_voterAddress].voterName).length == 0,
            "Voter already registered"
        );

        voterRegister[_voterAddress] = Voter({
            voterName: _voterName,
            voted: false
        });

        voterAddresses.push(_voterAddress);
        totalVoter++;

        emit VoterAdded(_voterAddress, _voterName); // Emit event
    }

    function getVoterAddresses() public view returns (address[] memory) {
        return voterAddresses;
    }

    function startVote() public inState(State.Created) onlyOfficial {
        state = State.Voting;
        emit VotingStateChanged(State.Voting); // Emit event
    }

    function endVote() public inState(State.Voting) onlyOfficial {
        state = State.Ended;
        emit VotingStateChanged(State.Ended); // Emit event
    }

    function vote(uint256 candidateIndex) public inState(State.Voting) {
        require(candidateIndex < candidates.length, "Invalid candidate index");
        Voter storage sender = voterRegister[msg.sender];
        require(!sender.voted, "Already voted");
        require(bytes(sender.voterName).length != 0, "Not a registered voter");

        sender.voted = true;
        candidates[candidateIndex].voteCount++;
        totalVote++;

        emit Voted(msg.sender, candidateIndex); // Emit event
    }

    function winningCandidate()
        public
        view
        inState(State.Ended)
        returns (uint256 winningIndex)
    {
        uint256 winningVoteCount = 0;
        // Note: In case of a tie, this returns the index of the first candidate with the highest count.
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > winningVoteCount) {
                winningVoteCount = candidates[i].voteCount;
                winningIndex = i;
            }
        }
        // It's good practice to handle the case where no votes were cast / all counts are 0
        // If winningVoteCount is still 0, maybe return a special value or revert?
        // For simplicity, we'll leave it as returning index 0 if no votes.
    }

    function getCandidates() public view returns (Candidate[] memory) {
        return candidates;
    }
}
