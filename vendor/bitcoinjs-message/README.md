# Fearless `bitcoinjs-message` compatibility shim

`@subwallet/keyring` declares this legacy message-signing package but does not
import it in the module surface consumed by Fearless. Its dependency chain uses
an unpatched `elliptic` release affected by GHSA-848j-6mx2-7j84.

Fearless supports BIP84 wallet transactions through its own audited builder and
signer, not legacy Bitcoin message signing. This shim keeps dependency loading
compatible and makes any unexpected call fail closed.
