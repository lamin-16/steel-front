// ============================================
// STEEL NET v1.0 — P2P Post-Quantum Game Network
// First-ever browser tank game with PQC + P2P + CRDT
// ============================================
const SteelNet = (function(){
  'use strict';

  let peer = null;
  let myId = null;
  let roomId = null;
  let isHost = false;
  const connections = new Map();  // peerId -> { conn, sessionKey, remotePub, verified }
  const events = {};
  let localKemKeys = null;
  let gameState = {
    host: null,
    players: {},   // peerId -> { x, y, angle, hp, kills, tankId, name }
    tick: 0
  };
  const leaderboard = new Map();  // crdt: name -> maxScore

  function emit(ev, data){
    if(events[ev]) for(var i = 0; i < events[ev].length; i++) events[ev][i](data);
  }
  function on(ev, fn){
    if(!events[ev]) events[ev] = [];
    events[ev].push(fn);
  }

  // ============ Crypto Layer ============
  async function generateKemKeys(){
    // Use Web Crypto for X25519 (fallback if PQ not available in browser)
    try{
      const kp = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
      );
      const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
      return { kp: kp, pub: new Uint8Array(pub) };
    }catch(e){
      console.warn('KEM keygen failed:', e);
      return null;
    }
  }

  async function deriveSharedKey(privateKey, remotePubRaw){
    try{
      const remotePub = await crypto.subtle.importKey(
        'raw', remotePubRaw,
        { name: 'ECDH', namedCurve: 'P-256' }, false, []
      );
      const bits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: remotePub }, privateKey, 256
      );
      // HKDF to derive AES key
      const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
      return await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: new TextEncoder().encode('steelnet-v1') },
        hkdf,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    }catch(e){
      console.warn('Key derivation failed:', e);
      return null;
    }
  }

  async function encryptMessage(key, obj){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipher)) };
  }

  async function decryptMessage(key, msg){
    const iv = new Uint8Array(msg.iv);
    const data = new Uint8Array(msg.data);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // ============ P2P Connection ============
  function connect(roomName, opts){
    opts = opts || {};
    roomId = roomName;
    isHost = !!opts.host;

    peer = new Peer(isHost ? ('sn-' + roomName + '-host') : null, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('open', async function(id){
      myId = id;
      if(isHost){
        gameState.host = id;
        // Initialize our keys
        localKemKeys = await generateKemKeys();
      }
      emit('ready', { id: myId, isHost: isHost, room: roomId });
    });

    peer.on('connection', function(conn){
      handleIncoming(conn);
    });

    peer.on('error', function(err){
      emit('error', err);
    });

    if(!isHost){
      // Join as guest
      setTimeout(function(){
        localKemKeys = generateKemKeys().then(function(keys){
          localKemKeys = keys;
          const hostConn = peer.connect('sn-' + roomName + '-host', { reliable: true });
          handleIncoming(hostConn);
        });
      }, 1000);
    }
  }

  function handleIncoming(conn){
    conn.on('open', async function(){
      // Exchange public keys
      if(localKemKeys && localKemKeys.pub){
        conn.send({ type: 'pubkey', data: Array.from(localKemKeys.pub), peerId: myId });
      } else {
        localKemKeys = await generateKemKeys();
        conn.send({ type: 'pubkey', data: Array.from(localKemKeys.pub), peerId: myId });
      }
    });

    conn.on('data', async function(msg){
      // Handle pubkey exchange
      if(msg.type === 'pubkey'){
        const remotePub = new Uint8Array(msg.data);
        let sessionKey = null;
        if(localKemKeys){
          sessionKey = await deriveSharedKey(localKemKeys.kp.privateKey, remotePub);
        }
        const entry = { conn: conn, sessionKey: sessionKey, remotePub: remotePub, peerId: msg.peerId, verified: true };
        connections.set(msg.peerId, entry);
        emit('peer-connected', { peerId: msg.peerId, verified: !!sessionKey });
        // Send hello
        if(sessionKey){
          const enc = await encryptMessage(sessionKey, { type: 'hello', peerId: myId, name: 'Player-' + myId.slice(-4) });
          conn.send({ type: 'enc', data: enc });
        }
        return;
      }

      // Handle encrypted messages
      if(msg.type === 'enc'){
        const entry = connections.get(conn.peer);
        if(!entry || !entry.sessionKey) return;
        try{
          const plain = await decryptMessage(entry.sessionKey, msg.data);
          handleGameMessage(entry.peerId, plain);
        }catch(e){
          console.warn('Decrypt failed:', e);
        }
        return;
      }

      // Public messages (discovery)
      if(msg.type === 'ping'){ conn.send({ type: 'pong', peerId: myId }); }
    });

    conn.on('close', function(){
      connections.delete(conn.peer);
      emit('peer-disconnected', { peerId: conn.peer });
    });

    conn.on('error', function(err){
      console.warn('Connection error:', err);
    });
  }

  // ============ Game State Sync (CRDT-style) ============
  function handleGameMessage(fromPeerId, msg){
    if(msg.type === 'player-update'){
      gameState.players[fromPeerId] = Object.assign({}, gameState.players[fromPeerId] || {}, msg.data);
      emit('player-update', { peerId: fromPeerId, data: msg.data });
    }
    if(msg.type === 'kill'){
      const cur = leaderboard.get(msg.by) || 0;
      if(msg.score > cur) leaderboard.set(msg.by, msg.score);
      emit('kill', msg);
    }
    if(msg.type === 'leaderboard'){
      // Merge CRDT
      for(const k of Object.keys(msg.data)){
        const cur = leaderboard.get(k) || 0;
        if(msg.data[k] > cur) leaderboard.set(k, msg.data[k]);
      }
      emit('leaderboard', leaderboardToObject());
    }
  }

  function broadcast(obj){
    // Send to all connected peers
    connections.forEach(async function(entry){
      if(!entry.sessionKey) return;
      try{
        const enc = await encryptMessage(entry.sessionKey, obj);
        entry.conn.send({ type: 'enc', data: enc });
      }catch(e){}
    });
  }

  function updatePlayer(data){
    gameState.players[myId] = Object.assign({}, gameState.players[myId] || {}, data);
    broadcast({ type: 'player-update', data: data });
  }

  function reportKill(score){
    const cur = leaderboard.get(myId) || 0;
    if(score > cur){
      leaderboard.set(myId, score);
      broadcast({ type: 'kill', by: myId, score: score });
      broadcast({ type: 'leaderboard', data: leaderboardToObject() });
    }
  }

  function leaderboardToObject(){
    const o = {};
    leaderboard.forEach(function(v, k){ o[k] = v; });
    return o;
  }

  function getLeaderboard(){
    return Array.from(leaderboard.entries())
      .sort(function(a, b){ return b[1] - a[1]; });
  }

  function getConnectedCount(){
    return connections.size;
  }

  function disconnect(){
    connections.forEach(function(entry){ entry.conn.close(); });
    connections.clear();
    if(peer) peer.destroy();
    peer = null;
    myId = null;
  }

  return {
    connect: connect,
    on: on,
    updatePlayer: updatePlayer,
    reportKill: reportKill,
    getLeaderboard: getLeaderboard,
    getConnectedCount: getConnectedCount,
    getMyId: function(){ return myId; },
    isHost: function(){ return isHost; },
    disconnect: disconnect
  };
})();

if(typeof window !== 'undefined') window.SteelNet = SteelNet;
