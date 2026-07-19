/**
 * ArenaStatusManager
 * Maintains the live status (idle, waiting, playing) of each Ludo arena (queueKey).
 * Tracks waitingCount (players in matchmaking queue) and playingCount (players currently in active matches).
 */
export class ArenaStatusManager {
    static state = {}; // key: queueKey -> { waitingCount: number, playingCount: number, activeMatchCount: number }

    static initQueue(queueKey) {
        if (!this.state[queueKey]) {
            this.state[queueKey] = { waitingCount: 0, playingCount: 0, activeMatchCount: 0 };
        }
    }

    static syncState(queueKey, currentQueue) {
        this.initQueue(queueKey);
        const waitingCount = currentQueue ? currentQueue.length : 0;
        this.state[queueKey].waitingCount = waitingCount;
        this.broadcast(queueKey);
    }

    static joinPool(queueKey) {
        this.initQueue(queueKey);
        this.state[queueKey].playingCount += 2;
        this.state[queueKey].activeMatchCount = (this.state[queueKey].activeMatchCount || 0) + 1;
        this.broadcast(queueKey);
    }

    static leavePool(queueKey) {
        this.initQueue(queueKey);
        if (this.state[queueKey].playingCount >= 2) {
            this.state[queueKey].playingCount -= 2;
        } else if (this.state[queueKey].playingCount > 0) {
            this.state[queueKey].playingCount = 0;
        }
        if (this.state[queueKey].activeMatchCount > 0) {
            this.state[queueKey].activeMatchCount -= 1;
        }
        this.broadcast(queueKey);
    }

    static getOnlineUsersStats() {
        let classic = 0;
        let time = 0;
        let turn = 0;

        for (const [queueKey, queueState] of Object.entries(this.state)) {
            const players = queueState.waitingCount + queueState.playingCount;
            if (queueKey.includes('CLASSIC')) {
                classic += players;
            } else if (queueKey.includes('TIME')) {
                time += players;
            } else if (queueKey.includes('TURN')) {
                turn += players;
            }
        }
        
        const total = global.onlineUsers ? global.onlineUsers.size : 0;
        return { classic, time, turn, total };
    }

    static broadcastOnlineUsersUpdate() {
        if (!global.ludoNamespace) return;
        global.ludoNamespace.emit('onlineUsersUpdate', this.getOnlineUsersStats());
    }

    static broadcast(queueKey) {
        if (!global.ludoNamespace) return;
        const { waitingCount, playingCount, activeMatchCount } = this.state[queueKey];
        
        const payload = {
            queueKey,
            waitingCount,
            playingCount,
            activeMatchCount: activeMatchCount || 0,
            timestamp: Date.now()
        };

        console.log('BROADCAST_QUEUE_UPDATED', payload);
        global.ludoNamespace.emit('queueUpdated', payload);
        this.broadcastOnlineUsersUpdate();
    }

    static broadcastAll(socket) {
        for (const [queueKey, state] of Object.entries(this.state)) {
            const { waitingCount, playingCount, activeMatchCount } = state;
            const payload = {
                queueKey,
                waitingCount,
                playingCount,
                activeMatchCount: activeMatchCount || 0,
                timestamp: Date.now()
            };
            socket.emit('queueUpdated', payload);
        }
        socket.emit('onlineUsersUpdate', this.getOnlineUsersStats());
    }
}
