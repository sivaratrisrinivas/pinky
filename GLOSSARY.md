# Pinky

Pinky asks first-time contributors to a GitHub repo for a small refundable deposit before a maintainer looks at their issue or PR. It keeps maintainers' time for people willing to stake something on not being spam.

## Language

**Project**:
A GitHub repo set up with Pinky, with its own maintainer wallet and promise amount. Installing the App on a repo doesn't make it a project.
_Avoid_: Repo (when you mean a repo set up with Pinky), installation

### People

**Maintainer**:
Someone with write access to the repo. Only maintainers give verdicts.
_Avoid_: Owner, admin, collaborator

**First-timer**:
An author GitHub marks as `NONE`, `FIRST_TIMER` or `FIRST_TIME_CONTRIBUTOR` on the issue or PR. Only first-timers are asked for a promise.
_Avoid_: Non-collaborator, newcomer, outsider

**Promiser**:
Whoever paid for a promise. Usually the first-timer, but anyone can make a promise for a first-timer, which is how existing contributors vouch for newcomers.
_Avoid_: Depositor, payer, backer, co-signer

### Money

**Promise**:
The refundable deposit tied to one issue or PR.
_Avoid_: Deposit, stake, bond, escrow

**Kept**:
A promise refunded to its promiser.
_Avoid_: Refunded, returned, accepted

**Broken**:
A promise forfeited to the project's maintainer wallet because the maintainer judged the issue or PR spam.
_Avoid_: Forfeited, slashed, burned

**Verdict**:
The maintainer's decision that settles a promise as kept or broken. `/accept` or a plain close keeps it, and `/spam` breaks it.
_Avoid_: Ruling, judgement, resolution

**Maintainer wallet**:
The token account a project names when it signs up. Broken promises are paid into it.
_Avoid_: Fund, project fund, treasury

**Arbiter**:
The key the Pinky app holds to settle promises on a maintainer's behalf.
_Avoid_: Admin key, authority, oracle
