// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    enum State { Created, Voting, Ended }
    State public state;

    address public official;

    struct Voter {
        string voterName;
        bool voted;
    }

    struct Candidate {
        string candidateName;
        uint voteCount;
    }

    mapping(address => Voter) public voterRegister;
    address[] public voterAddresses;

    Candidate[] public candidates;
    uint public totalVoter;
    uint public totalVote;

    modifier condition(bool _condition) {
        require(_condition, "Condition failed");
        _;
    }

    modifier onlyOfficial() {
        require(msg.sender == official, "Only official can perform this action");
        _;
    }

    modifier inState(State _state) {
        require(state == _state, "Invalid state for this action");
        _;
    }

    constructor(string[] memory candidateNames) {
        official = msg.sender;
        for (uint i = 0; i < candidateNames.length; i++) {
            candidates.push(Candidate({
                candidateName: candidateNames[i],
                voteCount: 0
            }));
        }
        state = State.Created;
    }

    function addVoter(address _voterAddress, string memory _voterName)
        public
        inState(State.Created)
        onlyOfficial
    {
        require(bytes(voterRegister[_voterAddress].voterName).length == 0, "Voter already registered");

        voterRegister[_voterAddress] = Voter({
            voterName: _voterName,
            voted: false
        });

        voterAddresses.push(_voterAddress);
        totalVoter++;
    }

    function getVoterAddresses() public view returns (address[] memory) {
        return voterAddresses;
    }

    function startVote()
        public
        inState(State.Created)
        onlyOfficial
    {
        state = State.Voting;
    }

    function endVote()
        public
        inState(State.Voting)
        onlyOfficial
    {
        state = State.Ended;
    }

    function vote(uint candidateIndex)
        public
        inState(State.Voting)
    {
        require(candidateIndex < candidates.length, "Invalid candidate index");
        Voter storage sender = voterRegister[msg.sender];
        require(!sender.voted, "Already voted");
        require(bytes(sender.voterName).length != 0, "Not a registered voter");

        sender.voted = true;
        candidates[candidateIndex].voteCount++;
        totalVote++;
    }

    function winningCandidate() public view inState(State.Ended) returns (uint winningIndex) {
        uint winningVoteCount = 0;
        for (uint i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > winningVoteCount) {
                winningVoteCount = candidates[i].voteCount;
                winningIndex = i;
            }
        }
    }

    function getCandidates() public view returns (Candidate[] memory) {
        return candidates;
    }
}
