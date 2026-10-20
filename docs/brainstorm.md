# Brainstorm: EventPass

Protocol of the brainstorming session with Claude (Anthropic) before writing code.
Format: Claude asks one question at a time with options and a recommendation;
the author answers. This is a condensed record of the questions and answers.

## Project choice
Candidates the author considered:
- QrMenu: digital QR menu and ordering for cafes
- EventPass: event announcements and ticket booking

Claude's assessment: both are too simple as plain CRUD. EventPass has a real
engineering core (no double-selling of a seat, timed holds, QR check-in),
and bugs there are easy to find during manual testing. Chosen: EventPass.

## Decisions

### Q1. Who is the main organizer?
Options: A) small organizers, B) anyone self-registering, C) large venues.
**Answer: C, large venues** (concert halls, festivals). Consequence: seat maps
and race conditions on seats matter a lot.

### Q2. How does a guest pick a seat?
Options: A) seat map, B) zones only, C) both modes.
**Answer: C, both modes.** Claude's mitigation: one common "sellable unit"
model (a seat or a zone capacity) so holds, payment and tickets are written once.

### Q3. How does payment work?
Options: A) simulated, B) Stripe test mode, C) no payment.
**Answer: A, simulated payment** with a test card; a special card number
simulates a decline. Holds, expiry, cancel and statuses are real.

### Q4. Does the guest need an account?
Options: A) no account, B) mandatory account, C) mixed.
**Answer: A, no account.** Guest enters name and email and gets a ticket link.
Guest cabinet goes to post-mvp.

### Q5. How is entry control done?
Options: A) web scanner page, B) manual code only, C) scanner plus offline mode.
**Answer: A, web scanner** with camera QR and manual code input; green/red
result; a reused code is rejected. Offline mode is post-mvp.

### Q6. Roles with an account
Options: A) organizer and controller, B) three roles with platform admin,
C) one staff role.
**Answer: A, organizer and controller.**

### Q7. One venue or many?
Options: A) multi-venue platform, B) single venue, C) separate site per venue.
**Answer: A, multi-venue.** Data of different venues is isolated; guests see
a common catalog.

### Q8. Seat holds during payment
Options: A) 10 min timer and 8 tickets per order, B) 15 min no limit, C) no hold.
**Answer: A, 10-minute hold with countdown**, max 8 tickets per order.

### Q9. How the guest gets the ticket
Options: A) ticket page with QR plus PDF plus simulated email, B) email only,
C) page only.
**Answer: A** (consistent with issues #12 to #14: ticket view, PDF, simulated email).

## Summary
Multi-venue ticketing platform. Seat-map and zone modes over one sellable-unit
model, 10-minute holds, simulated payment, guest checkout without account,
QR tickets, web check-in scanner, roles organizer and controller.
