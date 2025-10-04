const PEER_PREFIX = "atlasquest";
const HOST_SUFFIX = "host";

function buildHostId(roomCode) {
  return `${PEER_PREFIX}-${roomCode}-${HOST_SUFFIX}`;
}

export class PeerNetwork {
  constructor() {
    this.peer = null;
    this.role = "idle";
    this.roomCode = null;
    this.hostId = null;
    this.peerId = null;
    this.connections = new Map();
    this.handlers = new Map();
    this.hostConn = null;
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    handlers.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error("PeerNetwork handler error", err);
      }
    });
  }

  async host(roomCode) {
    this.role = "host";
    this.roomCode = roomCode;
    this.hostId = buildHostId(roomCode);
    const PeerCtor = window.Peer || window.peerjs?.Peer;
    if (!PeerCtor) {
      throw new Error("PeerJS not available");
    }
    this.peer = new PeerCtor(this.hostId, { debug: 1 });
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.emit("error", err);
        reject(err);
      };
      this.peer.on("open", (id) => {
        this.peerId = id;
        this.emit("open", { role: "host", id });
        resolve(id);
      });
      this.peer.on("connection", (conn) => {
        this.setupConnection(conn, true);
      });
      this.peer.on("error", onError);
    });
  }

  async join(roomCode) {
    this.role = "client";
    this.roomCode = roomCode;
    this.hostId = buildHostId(roomCode);
    const PeerCtor = window.Peer || window.peerjs?.Peer;
    if (!PeerCtor) {
      throw new Error("PeerJS not available");
    }
    this.peer = new PeerCtor(undefined, { debug: 1 });
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.emit("error", err);
        reject(err);
      };
      this.peer.on("open", (id) => {
        this.peerId = id;
        this.emit("open", { role: "client", id });
        this.hostConn = this.peer.connect(this.hostId, { reliable: true });
        this.setupConnection(this.hostConn, false);
        resolve(id);
      });
      this.peer.on("error", onError);
    });
  }

  setupConnection(conn, incomingForHost) {
    const remotePeerId = conn.peer;
    conn.on("open", () => {
      this.emit("connection", {
        remotePeerId,
        connection: conn,
      });
      if (this.role === "host") {
        this.connections.set(remotePeerId, conn);
      } else {
        this.hostConn = conn;
      }
    });

    conn.on("data", (message) => {
      if (!message || typeof message !== "object") return;
      const { type, payload } = message;
      this.emit(type, {
        from: this.role === "host" ? remotePeerId : this.hostId,
        payload,
      });
    });

    conn.on("close", () => {
      if (this.role === "host") {
        this.connections.delete(remotePeerId);
        this.emit("disconnect", { remotePeerId });
      } else {
        this.emit("disconnect", { remotePeerId: this.hostId });
      }
    });

    conn.on("error", (err) => {
      this.emit("error", err);
    });
  }

  sendToHost(type, payload) {
    if (this.role !== "client" || !this.hostConn || this.hostConn.disconnected) {
      return;
    }
    this.hostConn.send({ type, payload });
  }

  sendToPlayer(playerPeerId, type, payload) {
    if (this.role !== "host") return;
    const conn = this.connections.get(playerPeerId);
    if (!conn) return;
    conn.send({ type, payload });
  }

  broadcast(type, payload) {
    if (this.role !== "host") return;
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send({ type, payload });
      }
    });
  }

  close() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.hostConn) {
      this.hostConn.close();
      this.hostConn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.role = "idle";
    this.roomCode = null;
    this.hostId = null;
    this.peerId = null;
  }
}
