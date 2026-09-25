# City Runner

A WWII tank game for the browser. No installs, no sign-up, no ads — just open and play.

I built it because I wanted a tank game I could open on my phone during a break without waiting for anything to load. Turns out a few other people wanted the same thing, so here we are.

## The setup

There are two layers here.

The first is a fast-paced tank battle. You drive, aim, and shoot — pushing through waves of enemy armour across open terrain, towns, and forests. Shell type matters. So does the angle. A well-placed APCR round into the side of a Panther feels very different from spraying HE at the front.

The second layer is the war map. You start with three sectors on the European front. Every sector produces something — fuel, ammunition, or industry. You spend that on recruits, upgrades, forts, and eventually nuclear warheads. Then you deploy those units onto adjacent sectors and let the battle resolve in the field.

Lose a sector and the enemy pushes further in. Take one and your front line widens. The map isn't decoration — it's the whole campaign.

## Requirements

Node.js 18 or newer.

    npm install
    npm start

Then open http://localhost:3000.

## Controls

- Left stick — drive
- Right stick — traverse turret
- FIRE — shoot
- AP / APCR / HEAT / HE — switch shell
- Abilities row — artillery, repair, smoke, airstrike, extinguisher

## Difficulty

- EASY — four starting sectors, lighter enemy presence. Good for learning the map.
- NORMAL — three starting sectors. The intended experience.
- HARD — one sector, more enemies, no handholding.

There's a 90-second grace window after each surrender or fresh start. Use it to think.

## What's in the game

- Five continents, each with its own enemy multiplier and unlock cost
- Emergency Aid — a one-per-hour resource drop when things go badly
- Nuclear strikes — 300 industry, 150 fuel, 150 ammo, roughly three minutes of production
- Supply lines through forts (60 industry, 40 ammo per fort)
- Daily rewards with a marked sector that pays out 200 industry
- Four commander types — Iron Fist, Thunder, Hammer, Storm — each boosting one unit type
- WebRTC peer-to-peer multiplayer (early, still rough)

## Tech

- Three.js for rendering
- Express for the thin backend
- @noble/post-quantum for signed leaderboard entries (ML-KEM-768, ML-DSA-65)
- PeerJS for multiplayer transport

## Languages

English, German, Russian, Arabic. The in-game language toggle sits at the top of the screen.

## A note on the code

The war module (war-module.js) is loaded after the main game and injects its own UI. It keeps its own state in localStorage under steel_front_war_v2. If you want to reset the map, use the SURRENDER button — it clears sectors, units, and forts but keeps your resources, which are meant to be permanent across continents.

## License

MIT. Use it, fork it, ship it, sell it, do whatever.

— lamin
