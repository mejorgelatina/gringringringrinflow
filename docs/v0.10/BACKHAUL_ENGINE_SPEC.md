# Backhaul Opportunity Engine — v1

## Goal
Detect a compatible second task for a vehicle after a confirmed delivery, using existing capacity and potentially reducing empty miles. The engine produces an explainable recommendation; it does not assign drivers or change trips.

## Required inputs
- First delivery confirmed.
- Vehicle/driver and availability window confirmed.
- Usable capacity and remaining load after the first delivery.
- New offer with confirmed quantity, confirmed donor, and explicit consent to share necessary data.
- Confirmed recipient, compatible category, and condition policy.
- Confirmation that the carrier/platform terms allow the cargo type.
- Verified route from a provider, pickup and delivery ETAs, incremental kilometers, empty kilometers avoided, and incremental duration.

## Hard blockers
No consent; first delivery not confirmed; unit or capacity unconfirmed; overload; unconfirmed/incompatible recipient; unverified condition for human consumption; expired offer; ETA outside the window; unverified route; non-positive net benefit; or carrier terms not validated.

## Calculation
`net_benefit_km = empty_km_avoided - incremental_km`

A candidate is eligible only if net benefit is strictly positive and every hard gate passes. The initial score is a provisional normalization of net benefit relative to empty kilometers avoided. It is not calibrated against real-world data.

## Boundaries
The current implementation is a deterministic prototype using synthetic test cases. It does not call a map provider, contact a driver, reserve capacity, or dispatch a vehicle. Never interpret an estimated route as verified.
