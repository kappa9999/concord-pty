# Protocol

Each agent is asked to follow this response format:

AGREE: yes|no
PROPOSAL:
<plan or steps>
NOTES:
<optional>

<sentinel>

The sentinel is a unique line such as:
<<END_OF_MESSAGE_8f2c4b>>

When an agent agrees, it should restate the current proposal under PROPOSAL.
If it disagrees, it should provide a revised proposal under PROPOSAL.

